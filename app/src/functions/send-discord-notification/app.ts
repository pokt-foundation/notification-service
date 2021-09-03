import { getQueryResults } from '../../lib/datadog';
import { ApplicationLog, isApplicationLog, LambdaLog, LoadBalancerLog } from '../../models/datadog';
import { getHourFromUtcDate, getTodayStringTime } from '../../lib/date-utils';
import { table } from 'table';
import { formatNumber } from '../../utils/helpers';

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
function mapsExceededThresholds<T extends LambdaLog>(logs: T[]): Map<string, T[]> {
  const logsMap = new Map<string, T[]>()

  logs.forEach(log => logsMap.set(log.id,
    [...(logsMap.get(log.id) || []), log]))

  for (const [id, logs] of logsMap.entries()) {
    const filtered = filterMinimunDuplicates(logs)
    logsMap.set(id, filtered)
  }

  const timestampLogs = new Map<string, T[]>()
  for (const [_, logs] of logsMap.entries()) {
    logs.forEach(log => timestampLogs.set(log.hourstamp,
      [...(timestampLogs.get(log.hourstamp) || []), log]))
  }

  return timestampLogs
}

// All of the rows should allow string to write the header
// [loadBalancerName, email, relaysUsed, maxRelays, relaysUsed, percentageUsed, loadBalancerApps]
type LoadBalancerRow = [string, string, number | string, number | string, number | string, string]

// [applicationPublicKey, applicationAddress, applicationName, email, relaysUsed, maxRelays, percentageUsed]
type ApplicationRow = [string, string, string, string, number | string, number | string, number | string]

function formatRecords(records: LoadBalancerLog[] | ApplicationLog[]) {
  const formatted: LoadBalancerRow[] | ApplicationRow[] = []

  for (const log of records) {
    if (isApplicationLog(log)) {
      if (formatted.length === 0) {
        const entry: ApplicationRow = ['Public Key', 'Address', 'Name', 'Email', 'Relays used', 'Max relays', 'Percentage used']

          ; (formatted as ApplicationRow[]).push(entry)
      }
      const { applicationPublicKey, applicationAddress, email, applicationName, relaysUsed, maxRelays, percentageUsed } = log
      const entry: ApplicationRow = [applicationPublicKey, applicationAddress, applicationName, email, formatNumber(relaysUsed), formatNumber(maxRelays), percentageUsed]
        ; (formatted as ApplicationRow[]).push(entry)
    } else {
      if (formatted.length === 0) {
        const entry: LoadBalancerRow = ['Name', 'Email', 'Relays used', 'Max relays', 'Percentage used', 'Apps']
          ; (formatted as LoadBalancerRow[]).push(entry)
      }
      const { loadBalancerName, email, relaysUsed, maxRelays, percentageUsed, loadBalancerApps } = log
      const entry: LoadBalancerRow = [loadBalancerName, email, formatNumber(relaysUsed), formatNumber(maxRelays), percentageUsed, loadBalancerApps.join("\n")]
        ; (formatted as LoadBalancerRow[]).push(entry)
    }
  }

  return formatted
}

function buildOutputStr(title: string, data: Map<string, LoadBalancerLog[] | ApplicationLog[]>): string {
  let message = title
  for (const [key, value] of data) {
    message += `\n${getHourFromUtcDate(key)}\n`
    const ouput = table(formatRecords(value), { drawHorizontalLine: () => false })
    message += `${ouput}\n`
  }

  return message

}

exports.handler = async () => {
  const lbs = (await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %')).filter(lb => lb.hourstamp).map(lb => ({ ...lb, id: lb.loadBalancerId }))
  const apps = (await getQueryResults<ApplicationLog>('Application over 100 %')).filter(app => app.hourstamp).map(app => ({ ...app, id: app.applicationAddress }))
  const lbsResult = mapsExceededThresholds(lbs)
  const appResult = mapsExceededThresholds(apps)

  const date = getTodayStringTime()
  const appsMessage = buildOutputStr(`Exceeded Application Relays of [${date}] (UTC)`, appResult)
  const lbsMessage = buildOutputStr(`Exceeded Load Balancer Relays of [${date}] (UTC)`, lbsResult)

  console.log(appsMessage)
  console.log('\n')
  console.log(lbsMessage)

  return { message: 'ok' }
}