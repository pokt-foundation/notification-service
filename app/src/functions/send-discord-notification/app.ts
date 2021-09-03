import { getQueryResults } from '../../lib/datadog';
import { sendDiscordMessage } from '../../lib/discord';
import { ApplicationLog, isApplicationLog, LambdaLog, LoadBalancerLog } from '../../models/datadog';
import { retryEvery } from '../../utils/retry';
import fs from 'fs'
import { getHourFromUtcDate } from '../../lib/date-utils';

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
function mapsExceededThresholds<T extends LambdaLog>(logs: T[]) {
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
// [loadBalancerName, loadBalancerId, relaysUsed, maxRelays, relaysUsed, percentageUsed, loadBalancerApps]
type LoadBalancerRow = [string, string, number | string, number | string, number | string, string]

// [applicationPublicKey, applicationAddress, relaysUsed, maxRelays, relaysUsed, percentageUsed]
type ApplicationRow = [string, string, number | string, number | string, number | string, string]

function formatRecords(records: Map<string, LoadBalancerLog | ApplicationLog>) {
  const formatted: LoadBalancerRow[] | ApplicationLog[] = []

  for (const [id, log] of records.entries()) {
    if (isApplicationLog(log)) {
      if (formatted.length)

        log
    } else {
      // log
    }
  }

}

exports.handler = async () => {
  // const lbs = (await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %')).filter(lb => lb.hourstamp).map(lb => ({ ...lb, id: lb.loadBalancerId }))

  const apps = (await getQueryResults<ApplicationLog>('Application over 100 %')).filter(app => app.hourstamp).map(app => ({ ...app, id: app.applicationAddress }))

  // const lbResult = mapsExceededThresholds(lbs)

  const appResult = mapsExceededThresholds(apps)
  const appsMessage: { [key: string]: any } = {}
  for (const [hourStamp, apps] of appResult.entries()) {
    apps.forEach(app => {
      const { percentageUsed, applicationAddress, maxRelays, relaysUsed, } = app
      appsMessage[hourStamp] = [...(appsMessage[hourStamp] || []), { percentageUsed, applicationAddress, maxRelays, relaysUsed }]
    })
  }

  // await sendDiscordMessage(file)

  return { message: JSON.stringify(appsMessage).length }
}