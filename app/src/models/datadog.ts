export type DataDogResponse<T> = {
  meta?: {
    page: {
      after: string
    }
  }
  data: {
    attributes: {
      status: string
      service: string
      tags?: string[] | null
      timestamp: string
      host: string
      attributes: T
      message: string
    }
    type: string
    id: string
  }[]
  links?: {
    next: string
  }
}

export type LambdaLog = {
  id: string
  level: string
  timestamp: (string | number)[]
  message: string
  hourstamp: string
}

export type EntityLog = LambdaLog & {
  relaysUsed: number
  maxRelays: number
  percentageUsed: number
  email: string
  chains: string[]
}

export type LoadBalancerLog = EntityLog & {
  loadBalancerName: string
  loadBalancerApps: string[]
  loadBalancerId: string
}

export type ApplicationLog = EntityLog & {
  applicationAddress: string
  applicationPublicKey: string
  applicationName: string
  applicationID: string
}

export type MaxUsage = EntityLog & {
  maxApps: number
  maxLbs: number
}

export function isLoadBalancerLog(
  log: LoadBalancerLog | ApplicationLog
): log is LoadBalancerLog {
  return (log as LoadBalancerLog).loadBalancerName !== undefined
}

export function isApplicationLog(
  log: LoadBalancerLog | ApplicationLog
): log is ApplicationLog {
  return (log as ApplicationLog).applicationAddress !== undefined
}
