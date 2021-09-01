
import { Application } from '@pokt-network/pocket-js';
import { ApplicationData, ExtendedLoadBalancer, ExtendedLoadBalancerData, GetUsageDataQuery } from '../models/types';
import { IApplication } from '../models/Application';
import { ILoadBalancer } from '../models/LoadBalancer';

const calculateRelaysPercentage = (relays: number, maxRelays: number) => parseFloat(((relays / maxRelays) * 100).toFixed(2))

export function getApplicationsUsage(networkData: Map<string, Application>, influxData: GetUsageDataQuery[]): ApplicationData[] {
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

export async function getLoadBalancersUsage(appData: ApplicationData[], dbApps: IApplication[], loadBalancers: ILoadBalancer[], networkApps: Map<string, Application>): Promise<ExtendedLoadBalancer> {
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