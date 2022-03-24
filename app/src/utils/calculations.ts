import { Application } from '@pokt-network/pocket-js'
import {
  ApplicationData,
  ExtendedLoadBalancerData,
  GetUsageDataQuery,
  isApplicationData,
} from '../models/types'
import { IApplication } from '../models/Application'
import { ILoadBalancer } from '../models/LoadBalancer'
import log from '../lib/logger'
import User from '../models/User'
import redis from '../lib/redis'
import {
  getHoursFromNowUtcDate,
  getSecondsForNextHour,
} from '../lib/date-utils'
import {
  DynamoDBClient,
  PutItemCommand,
  PutItemCommandInput,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

const table = process.env.TABLE_NAME

// Values are only log at most twice per hour, the first time they trigger and
// within the last minutes of the variable, this is to not log the same warning many
// times as we're only interested on the maximum value per hour
const SECONDS_TO_RELOG = 360 // 6 min

// When caching an app/lb, a small exceedent is needed so the db have time to
// reindex the values of the next hour
const EXCEEDED_TIME = 120 // 2 min

const THRESHOLD_LIMIT = parseFloat(process.env.THRESHOLD_LIMIT || '100')

async function logEntityThreshold(
  entity: ApplicationData | ExtendedLoadBalancerData,
  dynamoClient: DynamoDBClient
) {
  const remainingSecondsOnHour = getSecondsForNextHour()
  let dynamoInput: PutItemCommandInput | undefined = undefined

  if (isApplicationData(entity)) {
    const {
      address,
      publicKey,
      relaysUsed,
      maxRelays,
      percentageUsed,
      email,
      name,
      chains,
      applicationID,
      dummy,
    } = entity
    const cached = await redis.get(`nt-app-${address}`)

    if (!cached || remainingSecondsOnHour <= SECONDS_TO_RELOG) {
      dynamoInput = {
        TableName: table,
        Item: marshall(
          {
            id: applicationID,
            createdAt: getHoursFromNowUtcDate(0),
            type: 'APP',
            address,
            publicKey,
            name,
            relaysUsed,
            maxRelays,
            percentageUsed,
            email,
            chains,
            dummy,
          },
          {
            removeUndefinedValues: true,
          }
        ),
      }

      log(
        'warn',
        `Application over ${THRESHOLD_LIMIT}% threshold (Dummy: ${Boolean(
          dummy
        )})`,
        undefined,
        {
          applicationAddress: address,
          applicationPublicKey: publicKey,
          applicationName: name,
          applicationID,
          relaysUsed,
          maxRelays,
          percentageUsed,
          email,
          chains,
          dummy,
        }
      )

      if (!cached) {
        await redis.set(
          `nt-app-${address}`,
          'true',
          'EX',
          remainingSecondsOnHour + EXCEEDED_TIME
        )
      }
    }
  } else {
    const {
      id,
      name,
      chains,
      activeApplications,
      relaysUsed,
      maxRelays,
      email,
      percentageUsed,
      gigastake,
      gigastakeRedirect,
    } = entity
    const cached = await redis.get(`nt-lb-${id}`)

    if (!cached || remainingSecondsOnHour <= SECONDS_TO_RELOG) {
      dynamoInput = {
        TableName: table,
        Item: marshall(
          {
            id,
            type: 'LB',
            createdAt: getHoursFromNowUtcDate(0),
            name,
            apps: activeApplications.map((app) => app.publicKey),
            relaysUsed,
            maxRelays,
            percentageUsed,
            email,
            chains,
            gigastake,
            gigastakeRedirect,
          },
          {
            removeUndefinedValues: true,
          }
        ),
      }

      log(
        'warn',
        `Load Balancer over ${THRESHOLD_LIMIT}% threshold (Gigastake: ${Boolean(
          gigastake
        )} (GigastakeRedirect: ${Boolean(gigastakeRedirect)}))`,
        undefined,
        {
          loadBalancerId: id,
          loadBalancerName: name,
          loadBalancerApps: activeApplications.map((app) => app.publicKey),
          relaysUsed,
          maxRelays,
          percentageUsed,
          email,
          chains,
          gigastake,
          gigastakeRedirect,
        }
      )

      if (!cached) {
        await redis.set(
          `nt-lb-${id}`,
          'true',
          'EX',
          remainingSecondsOnHour + EXCEEDED_TIME
        )
      }
    }
  }

  if (dynamoInput !== undefined) {
    try {
      await dynamoClient.send(new PutItemCommand(dynamoInput))
    } catch (err) {
      log('error', `dynamodb error: ${(err as Error).message}`)
    }
  }
}

const calculatePercentageOf = (relays: number, maxRelays: number) =>
  parseFloat(((relays / maxRelays) * 100).toFixed(2))

const getUserEmail = async (id: string | undefined): Promise<string> => {
  if (id == undefined || id.length <= 1) {
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
    log(
      'error',
      `failure trying to fetch email for app/lb on value: ${id}`,
      (e as Error).message
    )
    return ''
  }
}

export async function getApplicationsUsage(
  networkData: Map<string, Application>,
  influxData: GetUsageDataQuery[],
  dbApps: Map<string, IApplication>,
  dynamoClient: DynamoDBClient
): Promise<ApplicationData[]> {
  const applicationsData: ApplicationData[] = []

  for (const {
    applicationPublicKey: publicKey,
    relays: relaysUsed,
  } of influxData) {
    const dbApp = dbApps.get(publicKey)
    if (dbApp === undefined) {
      log('error', `${publicKey} not found in the db`)
      continue
    }
    const user = dbApp.user || ''
    const email = await getUserEmail(user.toString())

    let applicationData: ApplicationData

    const {
      freeTierApplicationAccount,
      publicPocketAccount,
      maxRelays,
      chain,
      dummy = false,
    } = dbApp
    const address = freeTierApplicationAccount?.address
      ? freeTierApplicationAccount.address
      : publicPocketAccount?.address

    // Is part of gigastake, which only has a symbolic limit from the db
    if (dummy) {
      applicationData = {
        publicKey,
        address,
        chains: [chain],
        relaysUsed,
        email,
        dummy,
        applicationID: dbApp._id,
        name: dbApp.name,
        maxRelays: Number(maxRelays),
        percentageUsed: calculatePercentageOf(relaysUsed, Number(maxRelays)),
      }
    } else {
      const networkApp = networkData.get(publicKey)
      if (networkApp === undefined) {
        log('info', `${publicKey} is not staked`)
        continue
      }

      const { address, chains, stakedTokens, jailed, status, maxRelays } =
        networkApp

      applicationData = {
        publicKey,
        address,
        chains,
        jailed,
        status,
        relaysUsed,
        email,
        // @ts-ignore
        dummy,
        applicationID: dbApp._id,
        name: dbApp.name,
        stakedTokens: Number(stakedTokens),
        maxRelays: Number(maxRelays),
        percentageUsed: calculatePercentageOf(relaysUsed, Number(maxRelays)),
      }
    }

    if (applicationData.percentageUsed > THRESHOLD_LIMIT) {
      logEntityThreshold(applicationData, dynamoClient)
    }

    applicationsData.push(applicationData)
  }

  return applicationsData
}

export async function getLoadBalancersUsage(
  appData: ApplicationData[],
  dbApps: Map<string, IApplication>,
  loadBalancers: Map<string, ILoadBalancer>,
  networkApps: Map<string, Application>,
  dynamoClient: DynamoDBClient
): Promise<Map<string, ExtendedLoadBalancerData>> {
  const extendedLBData: Map<string, ExtendedLoadBalancerData> = new Map<
    string,
    ExtendedLoadBalancerData
  >()

  const lbsOfApps = new Map<string, string>()
  for (const loadBalancer of loadBalancers) {
    const [lbID, lb] = loadBalancer
    lb.applicationIDs.forEach((appID) => lbsOfApps.set(appID, lbID))
  }

  const getInactiveAppRelays = (
    loadBalancer: ExtendedLoadBalancerData
  ): number => {
    const inactiveApps = loadBalancer.applicationIDs.filter(
      (id) => !loadBalancer.activeApplications.some((app) => app.id === id)
    )

    const maxUnusedRelays = inactiveApps.reduce((acc, curr) => {
      const app = dbApps.get(curr)
      if (app === undefined || app?.dummy === true) {
        return acc
      }
      const networkInfo = networkApps.get(
        app?.freeTierApplicationAccount.publicKey ?? ''
      )
      if (networkInfo === undefined) {
        return acc
      }
      return acc + Number(networkInfo.maxRelays)
    }, 0)

    return maxUnusedRelays
  }

  for (const app of appData) {
    const { maxRelays, relaysUsed, chains, publicKey } = app

    const dbApp = dbApps.get(publicKey)
    if (dbApp === undefined) {
      continue
    }

    const lbId = lbsOfApps.get(dbApp?._id.toString())
    // TODO: Define behavior for apps that don't belong to any load balancer
    if (lbId === undefined) {
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lb = loadBalancers.get(lbId)!

    const {
      _id: lbID,
      user: userID,
      name,
      applicationIDs,
      gigastake = false,
      gigastakeRedirect = false,
    } = lb

    if (extendedLBData.has(lbID)) {
      const extendedLB = extendedLBData.get(lbID) as ExtendedLoadBalancerData

      extendedLB.maxRelays += maxRelays
      extendedLB.relaysUsed += relaysUsed
      extendedLB.activeApplications.push({ ...app, id: dbApp._id })

      extendedLBData.set(lbID, extendedLB)
    } else {
      let email = ''

      if (userID) {
        email = await getUserEmail(userID.toString())
      } else {
        email = 'no user associated'
        log('warn', 'LB does not have an user associated', undefined, {
          loadBalancerId: lbID,
          applicationID: dbApp._id,
        })
      }

      // TODO: Change chain to chains when the Application schema is updated
      /// @ts-ignore
      extendedLBData.set(lbID, {
        chains: chains,
        userID,
        name,
        email,
        applicationIDs,
        id: lbID,
        gigastake,
        gigastakeRedirect,
      })

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
    lb.percentageUsed = calculatePercentageOf(relaysUsed, maxRelays)

    extendedLBData.set(id, lb)

    if (lb.percentageUsed > THRESHOLD_LIMIT) {
      logEntityThreshold(lb, dynamoClient)
    }
  }

  return extendedLBData
}
