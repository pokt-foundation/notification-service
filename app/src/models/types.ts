import { StakingStatus } from "@pokt-network/pocket-js"

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
  percertageUsed: number
}
