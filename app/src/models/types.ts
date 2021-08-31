import { StakingStatus } from "@pokt-network/pocket-js"
import { ILoadBalancer } from './LoadBalancer';

export type GetUsageDataQuery = {
  relays: BigInt,
  applicationPublicKey: string,
  result: string,
  table: number
}

export type ApplicationData = {
  publicKey: string
  address: string
  chains: string[],
  stakedTokens: BigInt,
  jailed: boolean,
  status: StakingStatus,
  maxRelays: BigInt
  relaysUsed: BigInt,
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
    maxRelays: BigInt,
    relaysUsed: BigInt
    applicationsRelayed: ApplicationData & { id: string }[]
  }
}