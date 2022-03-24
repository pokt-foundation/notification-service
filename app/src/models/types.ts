import { StakingStatus } from '@pokt-network/pocket-js'
import { INotificationSettings } from './Application'
import { Types } from 'mongoose'

export type GetUsageDataQuery = {
  relays: number
  applicationPublicKey: string
  result: string
  table: number
}

export type ApplicationData = {
  publicKey: string
  address: string
  chains: string[]
  stakedTokens?: number
  jailed?: boolean
  status?: StakingStatus
  maxRelays: number
  relaysUsed: number
  percentageUsed: number
  email?: string
  name: string
  applicationID: string
  dummy: boolean
}

export type DynamoData = {
  id: string
  createdAt: string
  type: 'APP' | 'LB'
  address: string
  publicKey: string
  name: string
  relaysUsed: number
  maxRelays: number
  percentageUsed: number
  email: string
  chains: string[]
  dummy: boolean
  apps: string[]
  gigastake: boolean
  gigastakeRedirect: boolean
}

type ActiveApplications = ApplicationData & { id: string }

export type ExtendedLoadBalancerData = {
  id: string
  userID: string | Types.ObjectId
  name: string
  gigastake?: boolean
  gigastakeRedirect?: boolean
  applicationIDs: string[]
  percentageUsed: number
  maxRelays: number
  relaysUsed: number
  activeApplications: ActiveApplications[]
  notificationSettings: INotificationSettings
  email?: string
  chains: string[]
}

export type ExtendedLoadBalancer = {
  [any: string]: ExtendedLoadBalancerData
}

export function isApplicationData(
  entity: ApplicationData | ExtendedLoadBalancerData
): entity is ApplicationData {
  return (entity as ApplicationData).address !== undefined
}
