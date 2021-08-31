import { StakingStatus } from "@pokt-network/pocket-js"
import { ILoadBalancer } from './LoadBalancer';

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
}

export type ExtendedApplicationData = ApplicationData & {
  email: string
  thresholdExceeded: number
}

export type ExtendedLoadBalancerData = {
  [any: string]: {
    id: string
    userID: string,
    name: string,
    applicationIDs: string[]
    percentageUsed: number
    maxRelays: number,
    relaysUsed: number
    applicationsRelayed: ApplicationData & { id: string }[]
  }
}