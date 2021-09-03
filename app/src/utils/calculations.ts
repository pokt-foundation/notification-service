
import { Application } from '@pokt-network/pocket-js';
import { ApplicationData, ExtendedLoadBalancer, ExtendedLoadBalancerData, GetUsageDataQuery } from '../models/types';
import { IApplication } from '../models/Application';
import { ILoadBalancer } from '../models/LoadBalancer';
import { convertToMap } from './helpers';
import log from '../lib/logger';
import User, { IUser } from '../models/User';
import { Types } from 'mongoose';

const THRESHOLD_LIMIT = parseInt(process.env.THRESHOLD_LIMIT || '100')

const calculateRelaysPercentage = (relays: number, maxRelays: number) => parseFloat(((relays / maxRelays) * 100).toFixed(2))

const getUserEmail = async (id: string | undefined): Promise<string> => {
  if (id === undefined) {
    return ''
  }
  try {
    // old apps have the user field as email instead of ObjectID
    const isEmailID = id.indexOf('@') > -1
    let email = ''
    if (isEmailID) {
      email = id
    } else {
      const user = await User.findById(id)
      if (user) {
        email = user.email
      }
    }

    return email
  } catch (e) {
    if (id as any instanceof Types.ObjectId) {
    }
    log('error', `failure trying to fetch email for app/lb on value: ${id}`, (e as Error).message)
    return ''
  }
}

export async function getApplicationsUsage(networkData: Map<string, Application>, influxData: GetUsageDataQuery[], dbApps: Map<string, IApplication>): Promise<ApplicationData[]> {
  const applicationsData: ApplicationData[] = []

  const queryData = convertToMap(influxData, 'applicationPublicKey')

  let i = 0
  influxData.forEach(async entry => {
    const networkApp = networkData.get(entry.applicationPublicKey)

    if (networkApp === undefined) {
      log('info', `${entry.applicationPublicKey} does not have an associated LB`)
      return
    }

    const { publicKey, address, chains, stakedTokens, jailed, status, maxRelays } = networkApp

    const appQuery = queryData.get(publicKey)
    if (appQuery === undefined) {
      log('error', `${address} not found in the db`)
      return
    }

    const { relays: relaysUsed } = appQuery

    const dbApp = dbApps.get(address) || <IApplication>{}

    const user = dbApp.user || ''
    const email = await getUserEmail(user.toString())
    const applicationData: ApplicationData = {
      publicKey,
      address,
      chains,
      jailed,
      status,
      relaysUsed,
      email,
      stakedTokens: Number(stakedTokens),
      maxRelays: Number(maxRelays),
      percentageUsed: calculateRelaysPercentage(relaysUsed, Number(maxRelays))
    }

    if (applicationData.percentageUsed > 100) {

      const { publicKey: applicationPublicKey, address: applicationAddress, relaysUsed, maxRelays, percentageUsed, email } = applicationData
      log('warn', `Application over ${THRESHOLD_LIMIT}% threshold`, undefined, {
        applicationAddress,
        applicationPublicKey,
        relaysUsed,
        maxRelays,
        percentageUsed,
        email,
      })
    }

    applicationsData.push(applicationData)
  })

  return applicationsData
}

export async function getLoadBalancersUsage(appData: ApplicationData[], dbApps: Map<string, IApplication>, loadBalancers: Map<string, ILoadBalancer>, networkApps: Map<string, Application>): Promise<Map<string, ExtendedLoadBalancerData>> {
  let extendedLBData: Map<string, ExtendedLoadBalancerData> = new Map<string, ExtendedLoadBalancerData>()

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

  for (const app of appData) {
    const dbApp = dbApps.get(app.address)

    if (dbApp === undefined) {
      continue
    }

    const lbId = lbsOfApps.get(dbApp?._id.toString())

    // TODO: Define behavior for apps that don't belong to any load balancer
    if (lbId === undefined) {
      continue
    }

    const lb = loadBalancers.get(lbId)!

    const { _id: lbID, user: userID, name, applicationIDs } = lb

    if (extendedLBData.has(lbID)) {
      const extendedLB = extendedLBData.get(lbID) as ExtendedLoadBalancerData

      extendedLB.maxRelays += app.maxRelays
      extendedLB.relaysUsed += app.relaysUsed
      extendedLB.activeApplications.push({ ...app, id: dbApp._id })

      extendedLBData.set(lbID, extendedLB)
    } else {
      const email = await getUserEmail(userID.toString())

      /// @ts-ignore
      extendedLBData.set(lbID, { userID, name, email, applicationIDs, id: lbID })

      const extendedLB = extendedLBData.get(lbID) as ExtendedLoadBalancerData
      extendedLB.maxRelays = app.maxRelays
      extendedLB.relaysUsed = app.relaysUsed
      extendedLB.notificationSettings = dbApp.notificationSettings

      // @ts-ignore
      extendedLB.activeApplications = [{ ...app, id: dbApp._id.toString() }]

      extendedLBData.set(lbID, extendedLB)
    }
  }

  for (const [id, _] of extendedLBData.entries()) {
    const lb = extendedLBData.get(id) as ExtendedLoadBalancerData
    lb.maxRelays += getInactiveAppRelays(lb)
    const { relaysUsed, maxRelays, name, activeApplications } = lb
    lb.percentageUsed = calculateRelaysPercentage(relaysUsed, maxRelays)

    extendedLBData.set(id, lb)

    if (lb.percentageUsed > 100) {
      log('warn', `Load Balancer over ${THRESHOLD_LIMIT}% threshold`, undefined, {
        loadBalancerId: id,
        loadBalancerName: name,
        loadBalancerApps: activeApplications.map(app => app.address),
        maxRelays: lb.maxRelays,
        relaysUsed: relaysUsed,
        percentageUsed: lb.percentageUsed,
        email: lb.email,
      })
    }
  }

  return extendedLBData
}
