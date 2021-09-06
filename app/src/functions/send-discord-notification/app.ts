import { getQueryResults } from '../../lib/datadog';
import { ApplicationLog, isApplicationLog, LambdaLog, LoadBalancerLog } from '../../models/datadog';
import { getHourFromUtcDate, getTodayStringTime } from '../../lib/date-utils';
import { formatNumber } from '../../utils/helpers';
import { sendDiscordThresholdData, sendMessage } from '../../lib/discord';
import { EmbedFieldData } from 'discord.js';

type availableLogs = LoadBalancerLog | ApplicationLog

// Goes through all the values and constantly updates the map with the most recent one,
// as the logs already come sorted, thereby only keeping the latest log of each hour
function filterMinimunDuplicates<T extends LambdaLog>(logs: T[]): T[] {
  const filtered: T[] = []

  const filter = new Map<string, T>()
  logs.forEach(lb => filter.set(lb.hourstamp, lb))

  for (const [_, lb] of filter.entries()) {
    filtered.push(lb)
  }

  return filtered
}

// Returns a map of exceeded logs based on their hourstamp 
function mapsExceededThresholds(logs: availableLogs[]): Map<string, availableLogs[]> {
  const logsMap = new Map<string, availableLogs[]>()

  logs.forEach(log => logsMap.set(log.id,
    [...(logsMap.get(log.id) || []), log]))

  for (const [id, logs] of logsMap.entries()) {
    const filtered = filterMinimunDuplicates(logs)
    logsMap.set(id, filtered)
  }
  return logsMap
}

function buildEmbedMessages(data: Map<string, availableLogs[]>): Map<string, EmbedFieldData[]> {
  const messages = new Map<string, EmbedFieldData[]>()

  for (const [id, logs] of data) {
    const message: EmbedFieldData[] = []
    if (isApplicationLog(logs[0])) {
      const { applicationName: name, applicationPublicKey: publicKey, applicationAddress: adddress, email } = logs[0]
      message.push(
        { name: 'Public Key', value: publicKey, inline: false },
        { name: 'Address', value: adddress, inline: true },
        { name: "Email", value: email, inline: true })
      for (const log of logs) {
        const { relaysUsed, maxRelays, percentageUsed, hourstamp } = log
        message.push(
          { name: 'Hour', value: getHourFromUtcDate(hourstamp), inline: false },
          { name: 'Relays used', value: formatNumber(relaysUsed), inline: true },
          { name: 'Max relays', value: formatNumber(maxRelays), inline: true },
          { name: 'Percentage used', value: formatNumber(percentageUsed), inline: true })
      }
      messages.set(name, message)
    } else {
      const { loadBalancerId: id, loadBalancerName: name, loadBalancerApps: apps, email } = logs[0]
      message.push(
        { name: 'Email', value: email, inline: false },
        { name: 'ID', value: id, inline: true },
        { name: "Apps", value: apps.join('\n'), inline: false })
      for (const log of logs) {
        const { relaysUsed, maxRelays, percentageUsed, hourstamp } = log
        message.push(
          { name: 'Hour', value: getHourFromUtcDate(hourstamp), inline: false },
          { name: 'Relays used', value: formatNumber(relaysUsed), inline: true },
          { name: 'Max relays', value: formatNumber(maxRelays), inline: true },
          { name: 'Percentage used', value: formatNumber(percentageUsed), inline: true })
      }
      messages.set(name, message)
    }
  }

  return messages
}

exports.handler = async () => {
  const lbs = (await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %'))
    .map(lb => ({ ...lb, id: lb.loadBalancerId }))
  const apps = (await getQueryResults<ApplicationLog>('Application over 100 %'))
    .map(app => ({ ...app, id: app.applicationAddress }))

  const lbsResult = mapsExceededThresholds(lbs)
  const appResult = mapsExceededThresholds(apps)

  const appsMessages = buildEmbedMessages(appResult)
  const lbsMessages = buildEmbedMessages(lbsResult)

  const date = getTodayStringTime()
  await sendMessage(`Exceeded Application/Load Balancer Relays of [${date}]`)

  const messagesToSend = []
  for (const [name, app] of appsMessages) {
    messagesToSend.push(sendDiscordThresholdData(`App: ${name}`, app))
  }
  for (const [name, lb] of lbsMessages) {
    messagesToSend.push(sendDiscordThresholdData(`LB: ${name}`, lb))
  }

  await Promise.allSettled(messagesToSend)

  return { message: 'ok' }
}