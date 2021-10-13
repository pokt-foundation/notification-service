import {
  Application,
  Configuration,
  HttpRpcProvider,
  Pocket,
  PocketRpcProvider,
  QueryAppResponse,
  RpcError,
  typeGuard,
} from '@pokt-network/pocket-js'
import { getAddressFromPublicKey } from '../utils/crypto'
import axios, { AxiosError } from 'axios'
import log from './logger'

const blockTime = process.env.BLOCK_TIME

const DEFAULT_DISPATCHER_LIST = (process.env.DEFAULT_DISPATCHER_LIST || '')
  .split(',')
  .map((uri) => new URL(uri))
const DEFAULT_HTTP_PROVIDER_NODE = DEFAULT_DISPATCHER_LIST[0]
const DEFAULT_MAX_DISPATCHERS = 1
const DEFAULT_MAX_SESSIONS = 1000000
const DEFAULT_MAX_SESSION_RETRIES = 1
const DEFAULT_REQUEST_TIMEOUT = 60 * 1000

const POCKET_CONFIGURATION = new Configuration(
  DEFAULT_MAX_DISPATCHERS,
  DEFAULT_MAX_SESSIONS,
  0,
  DEFAULT_REQUEST_TIMEOUT,
  false,
  undefined,
  Number(blockTime),
  DEFAULT_MAX_SESSION_RETRIES,
  false,
  false,
  false
)

function getPocketDispatchers() {
  return DEFAULT_DISPATCHER_LIST
}

function getRPCProvider(): HttpRpcProvider | PocketRpcProvider {
  return new HttpRpcProvider(new URL(DEFAULT_HTTP_PROVIDER_NODE))
}

export async function getApplicationNetworkData(
  publicKey: string
): Promise<QueryAppResponse | undefined> {
  const rpcProvider = getRPCProvider()
  const pocketInstance = new Pocket(
    getPocketDispatchers(),
    undefined,
    POCKET_CONFIGURATION
  )

  const address = getAddressFromPublicKey(publicKey)

  const rpcResponse = await pocketInstance
    .rpc(rpcProvider)
    ?.query.getApp(address)

  if (typeGuard(rpcResponse, RpcError)) {
    throw new Error(rpcResponse.message)
  }

  if (rpcResponse === undefined) {
    return undefined
  }

  return rpcResponse
}

// Pocket Rpc Call code commented as is not working at the moment, a direct
// rpc call will be used temporarily
export async function getAppsInNetwork(): Promise<
  Omit<Application, 'toJSON' | 'isValid'>[]
> {
  const page = 1
  const applicationsList: Omit<Application, 'toJSON' | 'isValid'>[] = []
  const perPage = 3000
  // const rpcProvider = getRPCProvider()
  // const pocketInstance = new Pocket(
  //   getPocketDispatchers(),
  //   undefined,
  //   POCKET_CONFIGURATION
  // )

  // const rpcResponse = await pocketInstance
  //   .rpc(rpcProvider)
  //   ?.query.getApps(undefined, BigInt(0), undefined, page, perPage)

  // if (typeGuard(rpcResponse, RpcError)) {
  //   log(
  //     'error',
  //     'failed retrieving applications from network',
  //     rpcResponse.message
  //   )
  //   throw new Error(rpcResponse.message)
  // }

  // const totalPages = rpcResponse?.totalPages || 1

  // const totalPages = 1

  // while (page <= totalPages) {
  //   const response = await pocketInstance
  //     .rpc(rpcProvider)
  //     ?.query.getApps(undefined, BigInt(0), undefined, page, perPage)

  //   page++
  //   if (response instanceof RpcError) {
  //     page = totalPages
  //     break
  //   }
  //   response?.applications.forEach((app) => {
  //     const {
  //       address,
  //       chains,
  //       public_key: publicKey,
  //       jailed,
  //       max_relays: maxRelays,
  //       status,
  //       staked_tokens: stakedTokens,
  //       unstaking_time: unstakingCompletionTime,
  //     } = app.toJSON()

  //     applicationsList.push({
  //       address,
  //       chains,
  //       publicKey,
  //       jailed,
  //       maxRelays: BigInt(maxRelays),
  //       status,
  //       stakedTokens: BigInt(stakedTokens),
  //       unstakingCompletionTime,
  //     })
  //   })
  // }

  try {
    const {
      data: { result: apps },
    } = await axios.post(`${DEFAULT_DISPATCHER_LIST.toString()}v1/query/apps`, {
      opts: {
        page,
        per_page: perPage,
      },
    })

    for (const app of apps) {
      const {
        address,
        chains,
        public_key: publicKey,
        jailed,
        max_relays: maxRelays,
        status,
        staked_tokens: stakedTokens,
        unstaking_time: unstakingCompletionTime,
      } = app
      const networkApp: Omit<Application, 'toJSON' | 'isValid'> = {
        address,
        chains,
        publicKey,
        jailed,
        maxRelays,
        status,
        stakedTokens,
        unstakingCompletionTime,
      }
      applicationsList.push(networkApp)
    }
  } catch (err) {
    log(
      'error',
      'failed retrieving applications from network',
      (err as AxiosError).message
    )
    throw err
  }

  return applicationsList
}
