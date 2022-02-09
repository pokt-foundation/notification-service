import { getHoursFromNowUtcDate } from './date-utils'

type logLevel = 'debug' | 'info' | 'warn' | 'error'

export type Log = {
  timestamp: string
  hourstamp: string
  message?: string
  error?: string
  loadBalancerId?: string
  loadBalancerName?: string
  loadBalancerApps?: string[]
  applicationID?: string
  applicationAddress?: string
  applicationPublicKey?: string
  applicationName?: string
  chains?: string[]
  maxRelays?: number
  relaysUsed?: number
  percentageUsed?: number
  email?: string
}

export default function log(
  level: logLevel,
  message?: string,
  error?: string,
  relayData?: {
    applicationAddress?: string
    applicationPublicKey?: string
    loadBalancerId?: string
    loadBalancerName?: string
    loadBalancerApps?: string[]
    applicationName?: string
    applicationID?: string
    maxRelays?: number
    relaysUsed?: number
    percentageUsed?: number
    email?: string
    chains?: string[]
    dummy?: boolean
    gigastake?: boolean,
    gigastakeRedirect?: boolean
  },
  additionalInfo?: object
): void {
  const log: Log = {
    timestamp: new Date().toISOString(),
    hourstamp: getHoursFromNowUtcDate(0),
    message,
    error,
    ...relayData,
    ...additionalInfo,
  }

  const str = JSON.stringify(log)

  // This is to avoid datadog parsing log level twice
  switch (level) {
    case 'debug':
      console.debug(str)
      break
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
