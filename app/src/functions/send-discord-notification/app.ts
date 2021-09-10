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

const EMBED_VALUE_CHARACTERS_LIMIT = 1024

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
        chains = ['-'],
        email = '-',
      } = logs[0]

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
        loadBalancerApps,
        chains = ['-'],
        email,
      } = logs[0]

      let apps = loadBalancerApps.join('\n')

      if (apps.length > EMBED_VALUE_CHARACTERS_LIMIT) {
        apps = `${apps.slice(0, 1020)}...`
      }
      message.push(
        { name: 'Email', value: email, inline: false },
        { name: 'ID', value: id, inline: true },
        { name: 'Chains', value: chains.join('\n'), inline: false },
        { name: 'Apps', value: apps, inline: false }
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

async function buildMaxUsageMsg(): Promise<EmbedFieldData[]> {
  let dailyMaximum = {
    hour: '',
    apps: 0,
    lbs: 0,
  }

  const dailyMaxUsage = await getQueryResults<MaxUsage>(
    'successfully calculated usage'
  )

  for (const currHour of dailyMaxUsage) {
    const { hourstamp: hour, maxApps, maxLbs } = currHour
    const { apps, lbs } = dailyMaximum
    if (maxApps > apps && maxLbs > lbs) {
      const newMaximum = {
        hour: getHourFromUtcDate(hour),
        apps: maxApps,
        lbs: maxLbs,
      }
      dailyMaximum = newMaximum
    }
  }

  const { hour, apps, lbs } = dailyMaximum

  return [
    { name: 'Hour', value: hour, inline: true },
    { name: 'Apps', value: formatNumber(apps), inline: true },
    { name: 'Lbs', value: formatNumber(lbs), inline: true },
  ]
}

function getTopUsedMsg(lbs: Map<string, LoadBalancerLog[]>, max: number) {
  const lbMaximums = new Map<string, { name: string, maxRelaysUsed: number, maxRelaysAllowed: number }>()

  for (const [_, logs] of lbs) {
    const name = logs[0].loadBalancerName

    lbMaximums.set(name, { name, maxRelaysAllowed: 0, maxRelaysUsed: 0 })
    for (const log of logs) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lb = lbMaximums.get(name)!
      lb.maxRelaysAllowed += log.maxRelays
      lb.maxRelaysUsed += log.relaysUsed
      console.log('LB', lb)
    }
  }

  const lbsArr = Array.from(lbMaximums, ([_, values]) => ({ ...values })).sort((a, b) => b.maxRelaysUsed - a.maxRelaysUsed);

  const end = max <= lbsArr.length ? max : lbsArr.length
  const top = lbsArr.slice(0, end)

  const embed: EmbedFieldData[] = []

  for (const lb of top) {
    embed.push(
      { name: 'Name', value: lb.name, inline: true },
      {
        name: 'Max daily Relays exceeded', value:
          formatNumber(lb.maxRelaysUsed - lb.maxRelaysAllowed), inline: true
      },
      { name: '-', value: '-', inline: true })
  }

  return embed
}

exports.handler = async () => {
  const lbOfApps = new Map<string, string>()

  const lbs = (
    await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %')
  ).map((lb) => {
    lb.loadBalancerApps.forEach(app => lbOfApps.set(app, lb.id))
    return { ...lb, id: lb.loadBalancerId }
  })

  const apps = (
    await getQueryResults<ApplicationLog>('Application over 100 %')
  ).map((app) => ({ ...app, id: app.applicationPublicKey }))

  const lbsResult = mapExceededThresholds(lbs)
  const appResult = mapExceededThresholds(apps)

  const appsMessages = buildEmbedMessages(appResult)
  const lbsMessages = buildEmbedMessages(lbsResult)

  const date = getTodayISODate()
  await sendMessage(`Exceeded Application/Load Balancer Relays of [${date}]`)

  const messagesToSend = []
  for (const [name, app] of appsMessages) {
    // Don't publish apps belonging to a Load Balancer
    const publicKey = app[0].value
    if (lbOfApps.get(publicKey)) {
      continue
    }

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

  const maxUsage = await buildMaxUsageMsg()
  await sendEmbedMessage(
    'Time of day with maximum number of apps/lbs',
    maxUsage
  )

  await sendEmbedMessage('Top Used Lbs',
    getTopUsedMsg(lbsResult as Map<string, LoadBalancerLog[]>, 5))

  return { message: 'ok' }
}
