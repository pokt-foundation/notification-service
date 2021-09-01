
type logLevel = 'debug' | 'info' | 'warn' | 'error'

export type Log = {
  timestamp: string
  requestId: string
  level: logLevel
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
export class Logger {
  requestId: string

  constructor(requestId?: string) {
    this.requestId = requestId ?? ''
  }

  log(level: logLevel, message?: string, error?: string, relayData?: {
    applicationAddress?: string,
    loadBalancerId?: string,
    loadBalancerApps?: string[],
    loadBalancerName?: string,
    maxRelays?: number
    relaysUsed?: number,
    percentageUsed?: number
  }, additionalInfo?: object) {
    const log: Log = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      level,
      message,
      error,
      ...relayData,
      ...additionalInfo
    }
    console.log(log)
  }
}

const logger = new Logger()

export default logger