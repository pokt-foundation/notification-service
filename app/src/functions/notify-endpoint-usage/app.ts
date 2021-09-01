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

  const networkApps: Map<string, Application> = new Map<string, Application>()
  networkData.forEach(app => networkApps.set(app.publicKey, app))

  let dbApps: IApplication[] = []
  let loadBalancers: ILoadBalancer[] = []

  try {
    const cachedApps = await redis.get('nt-applications')
    if (!cachedApps) {
      dbApps = await ApplicationModel.find()
      await redis.set('nt-applications', JSON.stringify(dbApps), 'EX', CACHE_TTL)
    } else {
      dbApps = JSON.parse(cachedApps)
    }

    const cachedLoadBalancers = await redis.get('nt-loadBalancers')
    if (!cachedLoadBalancers) {
      loadBalancers = await LoadBalancerModel.find()
      await redis.set('nt-loadBalancers', JSON.stringify(loadBalancers), 'EX', CACHE_TTL)
    } else {
      loadBalancers = JSON.parse(cachedLoadBalancers)
    }
  } catch (err) {
    logger.log('error', 'failed retrieving database models', (err as Error).message)
    return err
  }

  const appUsage = getApplicationsUsage(networkApps, usage)

  const lbUsage = await getLoadBalancersUsage(appUsage, dbApps, loadBalancers, networkApps)

  logger.log('info', 'successfully calculate usage', undefined, undefined, {
    maxLbs: Object.keys(lbUsage).length
  })

  return { 'message': 'ok' }
}