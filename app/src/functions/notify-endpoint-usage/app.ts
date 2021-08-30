import { influx, buildAppUsageQuery } from "../../lib/influx";
import { getUTCTimestamp, getHoursFromNowUtcDate } from "../../lib/date-utils";
import connect from "../../lib/db"
import { ApplicationData, ExtendedApplicationData, GetUsageDataQuery } from "../../models/types";
import Application from '../../models/Application'
import User from '../../models/User'
import { getApplicationNetworkData } from "../../lib/pocket";
import { QueryAppResponse, StakingStatus } from '@pokt-network/pocket-js';

const redisHost = process.env.REDIS_HOST || "";
const redisPort = process.env.REDIS_PORT || "";

export async function getUsageData(): Promise<GetUsageDataQuery[]> {
  const usage = (await influx.collectRows(
    buildAppUsageQuery({
      start: getHoursFromNowUtcDate(1),
      stop: getUTCTimestamp(),
    })
  )) as unknown as any[];

  const appData = usage.map((data: any) => ({
    relays: data._value,
    applicationPublicKey: data.applicationPublicKey,
    result: data.result,
    table: data.table,
  }));

  return appData as GetUsageDataQuery[];
}

function getRelaysUsed(networkData: QueryAppResponse[], influxData: GetUsageDataQuery[]): ApplicationData[] {
  const applicationsData: ApplicationData[] = []

  networkData.forEach(network => {
    const { public_key: publicKey, address, chains, staked_tokens: stakedTokens, jailed, status, max_relays: maxRelays } = network.toJSON()

    const influxApp = influxData.find(data => data.applicationPublicKey === publicKey)

    if (influxApp === undefined) {
      return
    }

    const applicationData: ApplicationData = {
      publicKey,
      address,
      chains,
      stakedTokens,
      jailed,
      status,
      maxRelays,
      relaysUsed: influxApp.relays,
      percentageUsed: parseFloat(((influxApp.relays / maxRelays) * 100).toFixed(2))
    }

    applicationsData.push(applicationData)
  })

  return applicationsData
}

async function getUserThresholdExceeded(appData: ApplicationData[]) {
  const extendedAppData = await Promise.allSettled(appData.map(async app => {
    const { address } = app
    const dbApplication = await Application.findOne({ "freeTierApplicationAccount.address": address })

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


exports.handler = async () => {
  await connect()

  const usage = await getUsageData();

  const networkApps = Promise.allSettled(
    usage.map((app) => getApplicationNetworkData(app.applicationPublicKey))
  );

  // TODO: Retry on error

  // @ts-ignore
  const apps = (await networkApps).map((data) => data.value)

  const appData = getRelaysUsed(apps, usage);

  return await getUserThresholdExceeded(appData)
};
