
import { Application } from '@pokt-network/pocket-js';
import { ApplicationData, ExtendedLoadBalancerData, GetUsageDataQuery, isApplicationData } from '../models/types';
import { IApplication } from '../models/Application';
import { ILoadBalancer } from '../models/LoadBalancer';
import { convertToMap } from './helpers';
import log from '../lib/logger';
import User from '../models/User';
import { Types } from 'mongoose';
import redis from '../lib/redis';
import { getSecondsForNextHour } from '../lib/date-utils';

// Values are only log at most twice per hour, the first time they trigger and
// within the last minutes of the variable, this is to not log the same warning many
// times as we're only interested on the maximum value per hour
const SECONDS_TO_RELOG = 360 // 6 min

const THRESHOLD_LIMIT = parseInt(process.env.THRESHOLD_LIMIT || '100')

async function logEntityThreshold(entity: ApplicationData | ExtendedLoadBalancerData) {
  const remainingSecondsOnHour = getSecondsForNextHour()

  if (isApplicationData(entity)) {
    const { address, publicKey, relaysUsed, maxRelays, percentageUsed, email, name } = entity
    const cached = await redis.get(`nt-app-${address}`)

    if (!cached || remainingSecondsOnHour <= SECONDS_TO_RELOG) {
      log('warn', `Application over ${THRESHOLD_LIMIT}% threshold`, undefined, {
        applicationAddress: address,
        applicationPublicKey: publicKey,
        applicationName: name,
        relaysUsed,
        maxRelays,
        percentageUsed,
        email,
      })

      if (!cached) {
        await redis.set(`nt-app-${address}`, 'true', 'EX', remainingSecondsOnHour)
      }
    }
  } else {
    const { id, name, activeApplications, relaysUsed, maxRelays, email, percentageUsed } = entity
    const cached = await redis.get(`nt-lb-${id}`)

    if (!cached || remainingSecondsOnHour <= SECONDS_TO_RELOG) {
      log('warn', `Load Balancer over ${THRESHOLD_LIMIT}% threshold`, undefined, {
        loadBalancerId: id,
        loadBalancerName: name,
        loadBalancerApps: activeApplications.map(app => app.address),
        relaysUsed,
        maxRelays,
        percentageUsed,
        email,
      })

      if (!cached) {
        await redis.set(`nt-lb-${id}`, 'true', 'EX', remainingSecondsOnHour)
      }
    }
  }
}

const calculateRelaysPercentage = (relays: number, maxRelays: number) => parseFloat(((relays / maxRelays) * 100).toFixed(2))

const getUserEmail = async (id: string | undefined): Promise<string> => {
  if (id === undefined || id.length <= 1) {
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
      name: dbApp.name,
      stakedTokens: Number(stakedTokens),
      maxRelays: Number(maxRelays),
      percentageUsed: calculateRelaysPercentage(relaysUsed, Number(maxRelays))
    }

    if (applicationData.percentageUsed > THRESHOLD_LIMIT) {
      logEntityThreshold(applicationData)
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
    const { relaysUsed, maxRelays } = lb
    lb.percentageUsed = calculateRelaysPercentage(relaysUsed, maxRelays)

    extendedLBData.set(id, lb)

    if (lb.percentageUsed > THRESHOLD_LIMIT) {
      logEntityThreshold(lb)
    }
  }

  return extendedLBData
}
