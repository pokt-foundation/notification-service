
import { Application } from '@pokt-network/pocket-js';
import { ApplicationData, ExtendedLoadBalancer, ExtendedLoadBalancerData, GetUsageDataQuery } from '../models/types';
import { IApplication } from '../models/Application';
import { ILoadBalancer } from '../models/LoadBalancer';
import { convertToMap } from './helpers';
import log from '../lib/logger';

const calculateRelaysPercentage = (relays: number, maxRelays: number) => parseFloat(((relays / maxRelays) * 100).toFixed(2))

export function getApplicationsUsage(networkData: Map<string, Application>, influxData: GetUsageDataQuery[]): ApplicationData[] {
  const applicationsData: ApplicationData[] = []

  const queryData = convertToMap(influxData, 'applicationPublicKey')

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

    if (applicationData.percentageUsed > 100) {
      const { publicKey: applicationPublicKey, address: applicationAddress, relaysUsed, maxRelays, percentageUsed } = applicationData
      log('warn', 'Application over 100% threshold', undefined, {
        applicationAddress,
        relaysUsed,
        maxRelays,
        percentageUsed,
        applicationPublicKey
      })
    }

    applicationsData.push(applicationData)
  })

  return applicationsData
}

export async function getLoadBalancersUsage(appData: ApplicationData[], dbApps: Map<string, IApplication>, loadBalancers: Map<string, ILoadBalancer>, networkApps: Map<string, Application>): Promise<ExtendedLoadBalancer> {
  const extendedLBData: ExtendedLoadBalancer = {}

  const lbsOfApps = new Map<string, string>()
  for (const loadBalancer of loadBalancers) {
    const [lbID, lb] = loadBalancer
    lb.applicationIDs.forEach(appID => lbsOfApps.set(appID, lbID))
  }

  const getInactiveAppRelays = (loadBalancer: ExtendedLoadBalancerData): number => {
    const inactiveApps = loadBalancer.applicationIDs.filter(id =>
      !loadBalancer.activeApplications.some(app => app.id === id))

    const maxUnusedRelays = inactiveApps.reduce((acc, curr) => {
      const app = dbApps.get(curr)
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
    const dbApp = dbApps.get(app.address)

    if (dbApp === undefined) {
      return
    }

    const lbId = lbsOfApps.get(dbApp?._id.toString())

    // TODO: Define behavior for apps that don't belong to any load balancer
    if (lbId === undefined) {
      return
    }

    const lb = loadBalancers.get(lbId)!

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
    const { relaysUsed, maxRelays, name, activeApplications } = lb
    lb.percentageUsed = calculateRelaysPercentage(relaysUsed, maxRelays)

    if (lb.percentageUsed > 100) {
      log('warn', 'Load Balancer over 100% threshold', undefined, {
        loadBalancerId: id,
        loadBalancerName: name,
        loadBalancerApps: activeApplications.map(app => app.address),
        maxRelays: lb.maxRelays,
        relaysUsed: relaysUsed,
        percentageUsed: lb.percentageUsed
      })
    }
  }

  return extendedLBData
}