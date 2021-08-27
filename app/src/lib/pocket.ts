import { Configuration, HttpRpcProvider, Pocket, PocketRpcProvider, QueryAppResponse, RpcError, typeGuard } from "@pokt-network/pocket-js"
import { getAddressFromPublicKey } from '../utils/conversions';

const blockTime = process.env.BLOCK_TIME

const DEFAULT_DISPATCHER_LIST = 'https://peer-1.nodes.pokt.network:4201'
  .split(',')
  .map((uri) => new URL(uri))
const DEFAULT_HTTP_PROVIDER_NODE = 'https://peer-1.nodes.pokt.network:4201/'
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

export async function getApplicationNetworkData(publicKey: string): Promise<QueryAppResponse | undefined> {
  const rpcProvider = getRPCProvider()
  const pocketInstance = new Pocket(getPocketDispatchers(), undefined, POCKET_CONFIGURATION)

  const address = getAddressFromPublicKey(publicKey)

  const rpcResponse = await pocketInstance.rpc(rpcProvider)?.query.getApp(address)

  if (typeGuard(rpcResponse, RpcError)) {
    throw new Error(rpcResponse.message)
  }

  if (rpcResponse === undefined) {
    console.log({ message: 'Got undefined response on public key ' + publicKey })
    return undefined
  }

  return rpcResponse
}