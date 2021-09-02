
type logLevel = 'debug' | 'info' | 'warn' | 'error'

export type Log = {
  timestamp: string
  level: logLevel
  message?: string
  error?: string
  applicationId?: string
  lbId?: string
  lbName?: string
  lbApps?: string
  maxRelays?: number
  relaysUsed?: number
  percentageUsed?: number
}

export default function log(level: logLevel, message?: string, error?: string, relayData?: {
  applicationId?: string,
  loadBalancerId?: string,
  loadBalancerApps?: string,
  maxRelays?: number
  relaysUsed?: number,
  percentageUsed?: number
}, additionalInfo?: object) {
  const log: Log = {
    timestamp: new Date().toISOString(),
    level,
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
