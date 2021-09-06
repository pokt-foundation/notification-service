import { getQueryResults } from '../../lib/datadog';
import { ApplicationLog, isApplicationLog, LambdaLog, LoadBalancerLog } from '../../models/datadog';
import { getHourFromUtcDate, getTodayStringTime } from '../../lib/date-utils';
import { table } from 'table';
import { formatNumber } from '../../utils/helpers';
import { sendDiscordMessage } from '../../lib/discord';

const DISCORD_MESSAGE_LIMIT = 2000

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

function formatRecords(records: availableLogs[]) {
  const formatted: any[] = []

  const relaysRow = ['Hour', 'Relays used', 'Max relays', 'Percentage used']

  for (const log of records) {
    // Empty array values as table rows need to have the same length
    if (isApplicationLog(log)) {
      const { applicationAddress: address, applicationName: name,
        email, hourstamp, relaysUsed, maxRelays, percentageUsed } = log

      if (formatted.length === 0) {
        const appInfo = ['Address', 'Name', 'Email', '']

        formatted.push(
          appInfo,
          [address, name, email, ''],
          relaysRow)
      }
      const entry = [getHourFromUtcDate(hourstamp), formatNumber(relaysUsed), formatNumber(maxRelays), percentageUsed]
      formatted.push(entry)
    } else {
      const { loadBalancerName: name, hourstamp,
        email, relaysUsed, maxRelays, percentageUsed,
        loadBalancerApps: apps, loadBalancerId: id } = log

      if (formatted.length === 0) {
        const entry = ['Name', 'Email', 'ID', 'Apps']

        formatted.push(entry, [name, email, id, apps.join("\n")], relaysRow)
      }
      const entry = [getHourFromUtcDate(hourstamp), formatNumber(relaysUsed), formatNumber(maxRelays), percentageUsed]
      formatted.push(entry)
    }
  }

  return formatted
}

function buildOutputStr(title: string, data: Map<string, availableLogs[]>, maxLength: number): string[] {
  let message = title
  for (const [_, value] of data) {
    message += "\n"
    // Doesn't add unncessesary row length as public key is too long
    if (isApplicationLog(value[0])) {
      message += `Public Key: ${value[0].applicationPublicKey}\n`
    }

    const ouput = table(formatRecords(value), { drawHorizontalLine: () => false })
    message += ouput
  }

  // splitMessage recursively splits a multiline string until is lower than the maximum 
  // length allowed, this is because Discord has a fixed characters limit per message 
  const splitMessage = (str: string, maxLength: number, acc: string[]): string[] => {
    if (str.length < maxLength) {
      acc.push(str)
      return acc
    }

    const newLineIdx = str.indexOf('\n', str.length / 2)
    // Output might look deformed if not newline is found
    const splitLineBy = newLineIdx > -1 ? newLineIdx : str.length / 2

    const [firstHalf, secondHalf] = [str.slice(0, splitLineBy), str.slice(splitLineBy)]

    splitMessage(firstHalf, maxLength, acc)
    splitMessage(secondHalf, maxLength, acc)

    return acc
  }

  const messages = splitMessage(message, maxLength, [])

  // Discord code style output for better formatting
  return messages.map(str => '```' + str + '```')
}

exports.handler = async () => {
  const lbs = (await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %'))
    .map(lb => ({ ...lb, id: lb.loadBalancerId }))
  const apps = (await getQueryResults<ApplicationLog>('Application over 100 %'))
    .map(app => ({ ...app, id: app.applicationAddress }))

  const lbsResult = mapsExceededThresholds(lbs)
  const appResult = mapsExceededThresholds(apps)

  const date = getTodayStringTime()
  const appsMessages = buildOutputStr(`Exceeded Application Relays of [${date}] (UTC)\n`, appResult, DISCORD_MESSAGE_LIMIT)
  const lbsMessages = buildOutputStr(`Exceeded Load Balancer Relays of [${date}] (UTC)\n`, lbsResult, DISCORD_MESSAGE_LIMIT)

  for (const msg of appsMessages) {
    await sendDiscordMessage(msg)
  }

  for (const msg of lbsMessages) {
    await sendDiscordMessage(msg)
  }

  return { message: 'ok' }
}