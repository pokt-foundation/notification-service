import { influx, buildAppUsageQuery } from "../../lib/influx";
import { getUTCTimestamp, getHoursFromNowUtcDate } from "../../lib/date-utils";
import { ApplicationData, GetUsageDataQuery } from "../../models/types";
import { getApplicationNetworkData } from "../../lib/pocket";
import { QueryAppResponse, StakingStatus } from '@pokt-network/pocket-js';

const redisHost = process.env.REDIS_HOST || "";
const redisPort = process.env.REDIS_PORT || "";

const maxRetries = process.env.MAX_RETRIES || 3;

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
      percertageUsed: parseFloat(((influxApp.relays / maxRelays) * 100).toFixed(2))
    }

    applicationsData.push(applicationData)
  })

  return applicationsData
}

async function getNetworkData(influxData: GetUsageDataQuery[]): Promise<QueryAppResponse[]> {
  const sleep = (seconds: number, factor: number) => new Promise(resolve => setTimeout(resolve, (seconds ** factor) * 1000))

  const networkApps: QueryAppResponse[] = []
  const failedApps: GetUsageDataQuery[] = []

  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) {
      await sleep(2, i)
    }

    const appsToQuery = i === 0 ? influxData : failedApps
    const networkResponse = await Promise.allSettled(
      appsToQuery.map((app) => getApplicationNetworkData(app.applicationPublicKey))
    );

    networkResponse.forEach((app, idx) => {
      if (app.status === 'fulfilled' && app.value !== undefined) {
        networkApps.push(app.value)
      } else {
        failedApps.push(appsToQuery[idx])
      }
    })

    if (networkApps.length === influxData.length) {
      break
    }
  }

  return networkApps
}

exports.handler = async () => {
  const usage = await getUsageData();

  const apps = await getNetworkData(usage)

  return getRelaysUsed(apps, usage);
};
