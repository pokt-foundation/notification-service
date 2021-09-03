import Redis from 'ioredis'
import { Application } from '@pokt-network/pocket-js';
import { getUsageData } from "../../lib/influx";
import connect from "../../lib/db"
import { getAppsInNetwork } from "../../lib/pocket";
import ApplicationModel, { IApplication } from "../../models/Application";
import LoadBalancerModel, { ILoadBalancer } from "../../models/LoadBalancer";
import { retryEvery } from "../../utils/retry";
import log from '../../lib/logger';
import { getApplicationsUsage, getLoadBalancersUsage } from '../../utils/calculations';
import { getModelFromDBOrCache } from "../../utils/db";
import { convertToMap } from '../../utils/helpers';

const REDIS_HOST = process.env.REDIS_HOST || "";
const REDIS_PORT = process.env.REDIS_PORT || "";

const CACHE_TTL = parseInt(process.env.NETWORK_CACHE_TTL ?? '') || 3600;

const redis = new Redis(parseInt(REDIS_PORT), REDIS_HOST)

exports.handler = async () => {
  await connect()

  log('info', 'starting')

  const usage = await retryEvery(getUsageData);

  let networkData: Application[]

  const cachedNetworkData = await redis.get('nt-network-apps')
  if (!cachedNetworkData) {
    networkData = await retryEvery(getAppsInNetwork)
    await redis.set('nt-network-apps', JSON.stringify(networkData, (_, value) =>
      typeof value === 'bigint'
        ? value.toString()
        : value
    ), 'EX', CACHE_TTL)
  } else {
    networkData = JSON.parse(cachedNetworkData)
  }

  const networkApps = convertToMap(networkData, 'publicKey')

  const apps: Map<string, IApplication> = convertToMap(await retryEvery(
    // @ts-ignore
    getModelFromDBOrCache.bind(null, redis, ApplicationModel, 'nt-applications')),
    'freeTierApplicationAccount.address')

  const loadBalancers: Map<string, ILoadBalancer> = convertToMap(await
    // @ts-ignore
    retryEvery(getModelFromDBOrCache.bind(null, redis, LoadBalancerModel, 'nt-loadBalancers')), '_id')

  const appUsage = await getApplicationsUsage(networkApps, usage, apps)

  const lbUsage = await getLoadBalancersUsage(appUsage, apps, loadBalancers, networkApps)

  log('info', 'successfully calculated usage', undefined, undefined, {
    maxLbs: lbUsage.size,
    maxApps: appUsage.length
  })

  return { message: 'ok' }
}
