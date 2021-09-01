import { getUsageData } from "../../lib/influx";
import connect from "../../lib/db"
import { ApplicationData, ExtendedApplicationData } from "../../models/types";
import User from '../../models/User'
import { getAppsInNetwork } from "../../lib/pocket";
import { Application } from '@pokt-network/pocket-js';
import ApplicationModel, { IApplication } from "../../models/Application";
import LoadBalancerModel, { ILoadBalancer } from "../../models/LoadBalancer";
import Redis from 'ioredis'
import { retryEvery } from "../../utils/retry";
import { Context } from 'aws-lambda';
import logger from '../../lib/logger';
import { getApplicationsUsage, getLoadBalancersUsage } from '../../utils/calculations';
import { getModelFromDBOrCache } from "../../utils/db";
import { convertToMap } from '../../utils/helpers';

const REDIS_HOST = process.env.REDIS_HOST || "";
const REDIS_PORT = process.env.REDIS_PORT || "";

const CACHE_TTL = parseInt(process.env.NETWORK_CACHE_TTL ?? '') || 3600;

const redis = new Redis(parseInt(REDIS_PORT), REDIS_HOST)

async function getUserThresholdExceeded(appData: ApplicationData[]) {
  const extendedAppData = await Promise.allSettled(appData.map(async app => {
    const { address } = app
    const dbApplication = await ApplicationModel.findOne({ "freeTierApplicationAccount.address": address })

    if (!dbApplication) {
      return app
    }

    const appUser = typeof dbApplication.user === 'string' ?
      await User.findOne({ email: dbApplication.user }) :
      await User.findById(dbApplication.user)

    if (!appUser) {
      return app
    }

    // TODO: Compare threshold exceeded with new system

    return {
      ...app,
      email: appUser.email,
      thresholdExceeded: 75
    } as ExtendedApplicationData
  }))

  return extendedAppData
}

exports.handler = async (_: any, context: Context) => {
  await connect()

  logger.requestId = context.awsRequestId

  logger.log('info', 'starting')

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

  const appUsage = getApplicationsUsage(networkApps, usage)

  const lbUsage = await getLoadBalancersUsage(appUsage, apps, loadBalancers, networkApps)

  logger.log('info', 'successfully calculated usage', undefined, undefined, {
    maxLbs: Object.keys(lbUsage).length
  })

  return { 'message': 'ok' }
}