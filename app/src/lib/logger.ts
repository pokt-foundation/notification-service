
type logLevel = 'debug' | 'info' | 'warn' | 'error'

export type Log = {
  timestamp: string
  requestId: string
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

export class Logger {
  requestId: string

  constructor(requestId?: string) {
    this.requestId = requestId ?? ''
  }

  log(level: logLevel, message?: string, error?: string, relayData?: {
    applicationId?: string,
    loadBalancerId?: string,
    loadBalancerApps?: string,
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