import { influx, buildAppUsageQuery } from "../../lib/influx";
import { getUTCTimestamp, getHoursFromNowUtcDate } from "../../lib/date-utils";
import connect from "../../lib/db"
import { ApplicationData, ExtendedApplicationData, ExtendedLoadBalancerData, GetUsageDataQuery } from "../../models/types";
import User from '../../models/User'
import { getApplicationNetworkData, getAppsInNetwork } from "../../lib/pocket";
import { QueryAppResponse, Application } from '@pokt-network/pocket-js';
import ApplicationModel, { IApplication } from "../../models/Application";
import LoadBalancerModel, { ILoadBalancer } from "../../models/LoadBalancer";
import { retryEvery } from "../../utils/retry";

const redisHost = process.env.REDIS_HOST || "";
const redisPort = process.env.REDIS_PORT || "";

const maxRetries = process.env.MAX_RETRIES || 3;

const calculateRelaysPercentage = (relays: BigInt, maxRelays: BigInt) => parseFloat(((Number(relays) / Number(maxRelays)) * 100).toFixed(2))

export async function getUsageData(): Promise<GetUsageDataQuery[]> {
  const usage = (await influx.collectRows(
    buildAppUsageQuery({
      start: getHoursFromNowUtcDate(1),
      stop: getUTCTimestamp(),
    })
  )) as unknown as any[];

  const appData = usage.map((data: any) => ({
    relays: BigInt(data._value),
    applicationPublicKey: data.applicationPublicKey,
    result: data.result,
    table: data.table,
  }));

  return appData as GetUsageDataQuery[];
}

function getRelaysUsed(networkData: Map<string, Application>, influxData: GetUsageDataQuery[]): ApplicationData[] {
  const applicationsData: ApplicationData[] = []

  const influxDataMap: { [any: string]: GetUsageDataQuery } = influxData.reduce((acc, data) => {
    // @ts-ignore
    acc[data.applicationPublicKey] = data
    return acc
  }, {})

  influxData.forEach(entry => {
    const networkApp = networkData.get(entry.applicationPublicKey)

    if (networkApp === undefined) {
      // TODO: Proper log
      return
    }

    const { publicKey, address, chains, stakedTokens, jailed, status, maxRelays } = networkApp

    const { relays: relaysUsed } = influxDataMap[publicKey]

    const applicationData: ApplicationData = {
      publicKey,
      address,
      chains,
      stakedTokens,
      jailed,
      status,
      maxRelays,
      relaysUsed,
      percentageUsed: calculateRelaysPercentage(relaysUsed, maxRelays)
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

async function getLoadBalancerThreshold(appData: ApplicationData[], dbApps: IApplication[], loadBalancers: ILoadBalancer[]): Promise<ExtendedLoadBalancerData> {
  const extendedLBData: ExtendedLoadBalancerData = {}

  appData.forEach(async app => {
    const dbApp = dbApps.find((data => data.freeTierApplicationAccount.address === app.address))

    if (dbApp === undefined) {
      return
    }

    const lb = loadBalancers.find((lb) => lb.applicationIDs.findIndex((appID) =>
      appID === dbApp?._id.toString()
    ) > -1)

    // TODO: Defined behavior for apps that don't belong to any load balancer
    if (lb === undefined) {
      return
    }

    const { _id: lbID, user: userID, name, applicationIDs } = lb

    if (lbID in extendedLBData) {
      const extendedLB = extendedLBData[lbID]
      extendedLB.maxRelays = BigInt(Number(extendedLB.maxRelays) + Number(app.maxRelays))
      extendedLB.relaysUsed = BigInt(Number(extendedLB.relaysUsed) + Number(app.relaysUsed))
      extendedLB.applicationsRelayed.push({ ...app, id: dbApp._id })
    } else {
      /// @ts-ignore
      extendedLBData[lbID] = { userID, name, applicationIDs }

      const extendedLB = extendedLBData[lbID]
      extendedLB.maxRelays = app.maxRelays
      extendedLB.relaysUsed = app.relaysUsed

      // @ts-ignore
      extendedLB.applicationsRelayed = [{ ...app, id: dbApp._id }]
    }
  })

  for (const id in extendedLBData) {
    const lb = extendedLBData[id]
    const { relaysUsed, maxRelays } = lb
    extendedLBData[id].percentageUsed = calculateRelaysPercentage(relaysUsed, maxRelays)
  }

  return extendedLBData
}

exports.handler = async () => {
  await connect()

  const usage = await getUsageData();

  const networkApps: Map<string, Application> = new Map<string, Application>()
    ; (await retryEvery(getAppsInNetwork) as Application[]).forEach(app => networkApps.set(app.publicKey, app))

  const appData = getRelaysUsed(networkApps, usage)

  // // TODO: Cache DB application data 
  const dbApps = await ApplicationModel.find()

  // // TODO: Cache Load Balancer data
  const loadBalancers = await LoadBalancerModel.find()

  const lbData = await getLoadBalancerThreshold(appData, dbApps, loadBalancers)

  return {}
}
