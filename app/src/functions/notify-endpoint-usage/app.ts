import { influx, buildAppUsageQuery, getUsageData } from "../../lib/influx";
import { getUTCTimestamp, getHoursFromNowUtcDate } from "../../lib/date-utils";
import connect from "../../lib/db"
import { ApplicationData, ExtendedApplicationData, ExtendedLoadBalancer, ExtendedLoadBalancerData, GetUsageDataQuery } from "../../models/types";
import User from '../../models/User'
import { getAppsInNetwork } from "../../lib/pocket";
import { Application } from '@pokt-network/pocket-js';
import ApplicationModel, { IApplication } from "../../models/Application";
import LoadBalancerModel, { ILoadBalancer } from "../../models/LoadBalancer";
import Redis from 'ioredis'
import { retryEvery } from "../../utils/retry";
import { Context } from 'aws-lambda';
import logger from '../../lib/logger';

const REDIS_HOST = process.env.REDIS_HOST || "";
const REDIS_PORT = process.env.REDIS_PORT || "";

const CACHE_TTL = parseInt(process.env.NETWORK_CACHE_TTL ?? '') || 3600;

const redis = new Redis(parseInt(REDIS_PORT), REDIS_HOST)

const calculateRelaysPercentage = (relays: number, maxRelays: number) => parseFloat(((relays / maxRelays) * 100).toFixed(2))

function getRelaysUsed(networkData: Map<string, Application>, influxData: GetUsageDataQuery[]): ApplicationData[] {
  const applicationsData: ApplicationData[] = []

  const queryData = new Map<string, GetUsageDataQuery>()
    ; influxData.forEach((entry) => {
      queryData.set(entry.applicationPublicKey, entry)
    })

  influxData.forEach(entry => {
    const networkApp = networkData.get(entry.applicationPublicKey)

    if (networkApp === undefined) {
      // TODO: Proper log
      return
    }

    const { publicKey, address, chains, stakedTokens, jailed, status, maxRelays } = networkApp

    const appQuery = queryData.get(publicKey)
    if (appQuery === undefined) {
      return
    }

    const { relays: relaysUsed } = appQuery

    const applicationData: ApplicationData = {
      publicKey,
      address,
      chains,
      stakedTokens: Number(stakedTokens),
      jailed,
      status,
      maxRelays: Number(maxRelays),
      relaysUsed,
      percentageUsed: calculateRelaysPercentage(relaysUsed, Number(maxRelays))
    }

    applicationsData.push(applicationData)
  })

  return applicationsData
}

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

async function getLoadBalancerThreshold(appData: ApplicationData[], dbApps: IApplication[], loadBalancers: ILoadBalancer[], networkApps: Map<string, Application>): Promise<ExtendedLoadBalancer> {
  const extendedLBData: ExtendedLoadBalancer = {}

  const getInactiveAppRelays = (loadBalancer: ExtendedLoadBalancerData): number => {
    const inactiveApps = loadBalancer.applicationIDs.filter(id =>
      !loadBalancer.activeApplications.some(app => app.id === id))

    const maxUnusedRelays = inactiveApps.reduce((acc, curr) => {
      const app = dbApps.find((data => data._id.toString() === curr))
      if (app === undefined) {
        return acc
      }
      const networkInfo = networkApps.get(app?.freeTierApplicationAccount.publicKey ?? '')
      if (networkInfo === undefined) {
        return acc
      }
      return acc + Number(networkInfo.maxRelays)
    }, 0)

    return maxUnusedRelays
  }

  appData.forEach(async app => {
    const dbApp = dbApps.find((data => data.freeTierApplicationAccount?.address === app.address))

    if (dbApp === undefined) {
      return
    }

    const lb = loadBalancers.find((lb) => lb.applicationIDs.findIndex((appID) =>
      appID === dbApp?._id.toString()
    ) > -1)

    // TODO: Define behavior for apps that don't belong to any load balancer
    if (lb === undefined) {
      return
    }

    const { _id: lbID, user: userID, name, applicationIDs } = lb

    if (lbID in extendedLBData) {
      const extendedLB = extendedLBData[lbID]
      extendedLB.maxRelays += app.maxRelays
      extendedLB.relaysUsed += app.relaysUsed
      extendedLB.activeApplications.push({ ...app, id: dbApp._id })
    } else {
      /// @ts-ignore
      extendedLBData[lbID] = { userID, name, applicationIDs, id: lbID }

      const extendedLB = extendedLBData[lbID]
      extendedLB.maxRelays = app.maxRelays
      extendedLB.relaysUsed = app.relaysUsed

      // @ts-ignore
      extendedLB.activeApplications = [{ ...app, id: dbApp._id.toString() }]
    }
  })

  for (const id in extendedLBData) {
    const lb = extendedLBData[id]
    lb.maxRelays += getInactiveAppRelays(lb)
    const { relaysUsed, maxRelays } = lb
    extendedLBData[id].percentageUsed = calculateRelaysPercentage(relaysUsed, maxRelays)
  }

  return extendedLBData
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

  const appData = getRelaysUsed(networkApps, usage)

  const lbData = await getLoadBalancerThreshold(appData, dbApps, loadBalancers, networkApps)

  logger.log('info', 'successfully calculate usage', undefined, undefined, {
    maxLbs: Object.keys(lbData).length
  })

  return { 'message': 'ok' }
}