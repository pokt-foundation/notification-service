import { influx, buildAppUsageQuery } from "../../lib/influx";
import { getUTCTimestamp, getHoursFromNowUtcDate } from "../../lib/date-utils";
import { ApplicationData, GetUsageDataQuery } from "../../models/types";
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
      percertageUsed: parseFloat(((influxApp.relays / maxRelays) * 100).toFixed(2))
    }

    applicationsData.push(applicationData)
  })

  return applicationsData
}

exports.handler = async () => {
  const usage = await getUsageData();

  const networkApps = Promise.allSettled(
    usage.map((app) => getApplicationNetworkData(app.applicationPublicKey))
  );

  // TODO: Retry on error

  // @ts-ignore
  const apps = (await networkApps).map((data) => data.value)

  return getRelaysUsed(apps, usage);
};
