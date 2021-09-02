import { getHoursFromNowUtcDate } from "./date-utils"

type logLevel = 'debug' | 'info' | 'warn' | 'error'

export type Log = {
  timestamp: string
  hourstamp: string,
  message?: string
  error?: string
  loadBalancerId?: string
  loadBalancerName?: string
  loadBalancerApps?: string[],
  applicationAddress?: string,
  maxRelays?: number
  relaysUsed?: number
  percentageUsed?: number
}

export default function log(level: logLevel, message?: string, error?: string, relayData?: {
  applicationAddress?: string
  loadBalancerId?: string,
  loadBalancerName?: string
  loadBalancerApps?: string[],
  maxRelays?: number
  relaysUsed?: number,
  percentageUsed?: number
}, additionalInfo?: object) {
  const log: Log = {
    timestamp: new Date().toISOString(),
    hourstamp: getHoursFromNowUtcDate(1),
    message,
    error,
    ...relayData,
    ...additionalInfo
  }

  const str = JSON.stringify(log)

  // This is to avoid datadog parsing log level twice
  switch (level) {

    case 'debug':
      console.debug(str)
    case 'info':
      console.info(str)
      break
    case 'warn':
      console.warn(str)
      break
    case 'error':
      console.error(str)
  }
}
