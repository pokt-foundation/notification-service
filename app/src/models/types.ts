import { StakingStatus } from "@pokt-network/pocket-js"
import { INotificationSettings } from "./Application";

export type GetUsageDataQuery = {
  relays: number,
  applicationPublicKey: string,
  result: string,
  table: number
}

export type ApplicationData = {
  publicKey: string
  address: string
  chains: string[],
  stakedTokens: number,
  jailed: boolean,
  status: StakingStatus,
  maxRelays: number
  relaysUsed: number,
  percentageUsed: number
  email?: string
  name: string
}

type ActiveApplications = ApplicationData & { id: string }

export type ExtendedLoadBalancerData = {
  id: string
  userID: string,
  name: string,
  applicationIDs: string[]
  percentageUsed: number
  maxRelays: number,
  relaysUsed: number
  activeApplications: ActiveApplications[]
  notificationSettings: INotificationSettings,
  email?: string
}

export type ExtendedLoadBalancer = {
  [any: string]: ExtendedLoadBalancerData
}

export function isApplicationData(entity: ApplicationData | ExtendedLoadBalancerData): entity is ApplicationData {
  return (entity as ApplicationData).address !== undefined;
}