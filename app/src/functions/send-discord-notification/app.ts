import { getQueryResults } from '../../lib/datadog';
import { ApplicationLog, LambdaLog, LoadBalancerLog } from '../../models/datadog';

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

exports.handler = async () => {
  const lbs = (await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %')).filter(lb => lb.hourstamp).map(lb => ({ ...lb, id: lb.loadBalancerId }))

  const apps = (await getQueryResults<ApplicationLog>('Application over 100 %')).filter(app => app.hourstamp).map(app => ({ ...app, id: app.applicationAddress }))

  const lbResult = mapsExceededThresholds(lbs)

  const appResult = mapsExceededThresholds(apps)


  return { message: 'ok' }
}