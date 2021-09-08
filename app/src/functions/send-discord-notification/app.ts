import { getQueryResults } from '../../lib/datadog'
import {
  ApplicationLog,
  isApplicationLog,
  LambdaLog,
  LoadBalancerLog,
  MaxUsage,
} from '../../models/datadog'
import { getHourFromUtcDate, getTodayISODate } from '../../lib/date-utils'
import { formatNumber } from '../../utils/helpers'
import { sendEmbedMessage, sendMessage, splitEmbeds } from '../../lib/discord'
import { EmbedFieldData } from 'discord.js'

type availableLogs = LoadBalancerLog | ApplicationLog

/**
 * Goes through all the values and constantly updates the map with the most recent one
 * as the logs already come sorted, thereby only keeping the latest log of each hour
 * @param logs log to filter values from
 * @returns
 */
function filterMinimunDuplicates<T extends LambdaLog>(logs: T[]): T[] {
  const filtered: T[] = []

  const filter = new Map<string, T>()
  logs.forEach((lb) => filter.set(lb.hourstamp, lb))

  for (const [_, lb] of filter.entries()) {
    filtered.push(lb)
  }

  return filtered
}

// Returns a map of exceeded logs based on their hourstamp
function mapExceededThresholds(
  logs: availableLogs[]
): Map<string, availableLogs[]> {
  const logsMap = new Map<string, availableLogs[]>()

  logs.forEach((log) =>
    logsMap.set(log.id, [...(logsMap.get(log.id) || []), log])
  )

  for (const [id, logs] of logsMap.entries()) {
    const filtered = filterMinimunDuplicates(logs)
    logsMap.set(id, filtered)
  }
  return logsMap
}

function buildEmbedMessages(
  data: Map<string, availableLogs[]>
): Map<string, EmbedFieldData[]> {
  const messages = new Map<string, EmbedFieldData[]>()

  for (const [_, logs] of data) {
    const message: EmbedFieldData[] = []

    // Possibly empty variables have  a default dash as values 
    // cannot be an empty string
    if (isApplicationLog(logs[0])) {
      const {
        applicationName: name = '-',
        applicationPublicKey: publicKey,
        applicationAddress: adddress,
        email = '-',
      } = logs[0]
      const { chains = ['-'] } = logs[logs.length - 1]

      message.push(
        { name: 'Public Key', value: publicKey, inline: false },
        { name: 'Chains', value: chains.join(', '), inline: false },
        { name: 'Address', value: adddress, inline: true },
        { name: 'Email', value: email !== '' ? email : '-', inline: true }
      )
      for (const log of logs) {
        const { relaysUsed, maxRelays, percentageUsed, hourstamp } = log
        message.push(
          { name: 'Hour', value: getHourFromUtcDate(hourstamp), inline: false },
          {
            name: 'Relays used',
            value: formatNumber(relaysUsed),
            inline: true,
          },
          { name: 'Max relays', value: formatNumber(maxRelays), inline: true },
          {
            name: 'Percentage used',
            value: formatNumber(percentageUsed),
            inline: true,
          }
        )
      }
      messages.set(name, message)
    } else {
      const {
        loadBalancerId: id,
        loadBalancerName: name,
        loadBalancerApps: apps,
        email,
      } = logs[0]

      // TODO: Remove after 7/9/2021 as all logs will have chains attached
      const chains = logs[logs.length - 1].chains || ['-']
      message.push(
        { name: 'Email', value: email, inline: false },
        { name: 'ID', value: id, inline: true },
        { name: 'Chains', value: chains.join('\n'), inline: false },
        { name: 'Apps', value: apps.join('\n'), inline: false }
      )
      for (const log of logs) {
        const { relaysUsed, maxRelays, percentageUsed, hourstamp } = log
        message.push(
          { name: 'Hour', value: getHourFromUtcDate(hourstamp), inline: false },
          {
            name: 'Relays used',
            value: formatNumber(relaysUsed),
            inline: true,
          },
          { name: 'Max relays', value: formatNumber(maxRelays), inline: true },
          {
            name: 'Percentage used',
            value: formatNumber(percentageUsed),
            inline: true,
          }
        )
      }
      messages.set(name, message)
    }
  }

  return messages
}


async function getMaxUsageMsg(): Promise<EmbedFieldData[]> {
  let dailyMaximum = {
    hour: '',
    apps: 0,
    lbs: 0
  }

  const dailyMaxUsage = (
    await getQueryResults<MaxUsage>('successfully calculated usage')
  )

  for (const currHour of dailyMaxUsage) {
    const { hourstamp: hour, maxApps, maxLbs } = currHour
    const { apps, lbs } = dailyMaximum
    if (maxApps > apps && maxLbs > lbs) {
      const newMaximun = {
        hour: getHourFromUtcDate(hour),
        apps: maxApps,
        lbs: maxLbs,
      }
      dailyMaximum = newMaximun
    }
  }

  const { hour, apps, lbs } = dailyMaximum

  return [
    { name: 'Hour', value: hour, inline: true },
    { name: 'Apps', value: formatNumber(apps), inline: true },
    { name: 'Lbs', value: formatNumber(lbs), inline: true },]
}

exports.handler = async () => {
  const lbs = (
    await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %')
  ).map((lb) => ({ ...lb, id: lb.loadBalancerId }))
  const apps = (
    await getQueryResults<ApplicationLog>('Application over 100 %')
  ).map((app) => ({ ...app, id: app.applicationAddress }))

  const lbsResult = mapExceededThresholds(lbs)
  const appResult = mapExceededThresholds(apps)

  const appsMessages = buildEmbedMessages(appResult)
  const lbsMessages = buildEmbedMessages(lbsResult)

  const date = getTodayISODate()
  await sendMessage(`Exceeded Application/Load Balancer Relays of [${date}]`)

  const messagesToSend = []
  for (const [name, app] of appsMessages) {
    const embeds = splitEmbeds(app)
    for (const embed of embeds) {
      messagesToSend.push(sendEmbedMessage(`App: ${name}`, embed))
    }
  }
  for (const [name, lb] of lbsMessages) {
    const embeds = splitEmbeds(lb)
    for (const embed of embeds) {
      messagesToSend.push(sendEmbedMessage(`LB: ${name}`, embed))
    }
  }

  await Promise.allSettled(messagesToSend)

  const maxUsage = await getMaxUsageMsg()
  await sendEmbedMessage('Time of day with maximun number of apps/lbs', maxUsage)

  return { message: 'ok' }
}
