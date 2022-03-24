import {
  ApplicationLog,
  isApplicationLog,
  LambdaLog,
  LoadBalancerLog,
  MaxUsage,
} from '../../models/datadog'
import {
  getHourFromUtcDate,
  getTodayISODate,
  getYesterdayISODate,
} from '../../lib/date-utils'
import { formatNumber } from '../../utils/helpers'
import { sendEmbedMessage, sendMessage, splitEmbeds } from '../../lib/discord'
import { EmbedFieldData } from 'discord.js'
import LoadBalancerModel from '../../models/LoadBalancer'
import connect from '../../lib/db'
import log from '../../lib/logger'
import {
  AttributeValue,
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb'
import { DynamoData } from '../../models/types'
import { unmarshall } from '@aws-sdk/util-dynamodb'

const table = process.env.TABLE_NAME

const dynamoClient = new DynamoDBClient({ region: process.env.REGION })

const EMBED_VALUE_CHARACTERS_LIMIT = 1024

type availableLogs = LoadBalancerLog | ApplicationLog

/**
 * Goes through all the values and constantly updates the map with the most recent one
 * as the logs already come sorted, thereby only keeping the latest log of each hour
 * @param logs log to filter values from
 * @returns
 */
function filterMinimunDuplicates<T extends LambdaLog>(logs: T[]): T[] {
  const filtered: T[] = []

  const filter = new Map<string, T>()
  logs.forEach((lb) => filter.set(lb.hourstamp, lb))

  for (const [_, lb] of filter.entries()) {
    filtered.push(lb)
  }

  return filtered
}

// Returns a map of exceeded logs based on their hourstamp
function mapExceededThresholds(
  logs: availableLogs[]
): Map<string, availableLogs[]> {
  const logsMap = new Map<string, availableLogs[]>()

  logs.forEach((log) =>
    logsMap.set(log.id, [...(logsMap.get(log.id) || []), log])
  )

  for (const [id, logs] of logsMap.entries()) {
    const filtered = filterMinimunDuplicates(logs)
    logsMap.set(id, filtered)
  }
  return logsMap
}

function buildEmbedMessages(
  data: Map<string, availableLogs[]>
): Map<string, EmbedFieldData[]> {
  const messages = new Map<string, EmbedFieldData[]>()

  for (const [_, logs] of data) {
    const message: EmbedFieldData[] = []

    // Possibly empty variables have  a default dash as values
    // cannot be an empty string
    if (isApplicationLog(logs[0])) {
      const {
        applicationName: name = '-',
        applicationPublicKey: publicKey,
        applicationAddress: adddress,
        chains = ['-'],
        email = '-',
        applicationID,
        dummy = false,
      } = logs[0]

      message.push(
        { name: 'ID', value: applicationID, inline: false },
        { name: 'Dummy', value: dummy, inline: false },
        { name: 'Public Key', value: publicKey, inline: false },
        { name: 'Chains', value: chains.join(', '), inline: false },
        { name: 'Address', value: adddress, inline: true },
        { name: 'Email', value: email !== '' ? email : '-', inline: true }
      )
      for (const log of logs) {
        const { relaysUsed, maxRelays, percentageUsed, hourstamp } = log
        message.push(
          { name: 'Hour', value: getHourFromUtcDate(hourstamp), inline: false },
          {
            name: 'Relays used',
            value: formatNumber(relaysUsed),
            inline: true,
          },
          { name: 'Max relays', value: formatNumber(maxRelays), inline: true },
          {
            name: 'Percentage used',
            value: formatNumber(percentageUsed),
            inline: true,
          }
        )
      }
      messages.set(name, message)
    } else {
      const {
        loadBalancerId: id,
        loadBalancerName: name,
        loadBalancerApps,
        chains = ['-'],
        email,
        gigastake = false,
        gigastakeRedirect = false,
      } = logs[0]

      let apps = loadBalancerApps.join('\n')

      if (apps.length > EMBED_VALUE_CHARACTERS_LIMIT) {
        apps = `${apps.slice(0, 1020)}...`
      }
      message.push(
        { name: 'Email', value: email, inline: false },
        { name: 'ID', value: id, inline: true },
        { name: 'Chains', value: chains.join('\n'), inline: false },
        { name: 'Gigastake', value: gigastake, inline: false },
        { name: 'Gigastake redirect', value: gigastakeRedirect, inline: false },
        { name: 'Apps', value: apps, inline: false }
      )
      for (const log of logs) {
        const { relaysUsed, maxRelays, percentageUsed, hourstamp } = log
        message.push(
          { name: 'Hour', value: getHourFromUtcDate(hourstamp), inline: false },
          {
            name: 'Relays used',
            value: formatNumber(relaysUsed),
            inline: true,
          },
          { name: 'Max relays', value: formatNumber(maxRelays), inline: true },
          {
            name: 'Percentage used',
            value: formatNumber(percentageUsed),
            inline: true,
          }
        )
      }
      messages.set(name, message)
    }
  }

  return messages
}

async function buildMaxUsageMsg(): Promise<EmbedFieldData[]> {
  let dailyMaximum = {
    hour: '',
    apps: 0,
    lbs: 0,
  }

  const maxAppsQuery: ScanCommandInput = {
    TableName: table,
    FilterExpression: 'id = :id AND begins_with (createdAt, :createdAt)',
    ExpressionAttributeValues: {
      ':createdAt': {
        S: getYesterdayISODate(),
      },
      ':id': {
        S: 'maxUsage'
      }
    },
  }

  let hourlyMaximums: MaxUsage[] = []

  try {
    const command = new ScanCommand(maxAppsQuery)
    hourlyMaximums = (await dynamoClient.send(command)).Items?.map((it) => unmarshall(it) as MaxUsage) || []

  } catch (err) {
    log('error', `error getting max app usage: ${(err as Error).message}`)
  }

  for (const currHour of hourlyMaximums) {
    const { createdAt: hour, maxApps, maxLbs } = currHour
    const { apps, lbs } = dailyMaximum
    if (maxApps > apps && maxLbs > lbs) {
      const newMaximum = {
        hour: getHourFromUtcDate(hour),
        apps: maxApps,
        lbs: maxLbs,
      }
      dailyMaximum = newMaximum
    }
  }

  const { hour, apps, lbs } = dailyMaximum

  return [
    { name: 'Hour', value: hour, inline: true },
    { name: 'Apps', value: formatNumber(apps), inline: true },
    { name: 'Lbs', value: formatNumber(lbs), inline: true },
  ]
}

exports.handler = async () => {
  await connect()

  const lbOfApps = new Map<string, string>()

  const loadBalancers = await LoadBalancerModel.find()

  loadBalancers.forEach((lb) =>
    lb.applicationIDs.forEach((app) => lbOfApps.set(app, lb.id))
  )

  let items: DynamoData[] = []
  let lastEvaluatedKey:
    | {
      [key: string]: AttributeValue
    }
    | undefined = undefined

  do {
    const input: ScanCommandInput = {
      TableName: table,
      FilterExpression: 'begins_with (createdAt, :createdAt)',
      ExpressionAttributeValues: {
        ':createdAt': {
          S: getYesterdayISODate(),
        },
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }
    try {
      const command = new ScanCommand(input)
      const response = await dynamoClient.send(command)
      items = [
        ...items,
        ...(response.Items?.map((item) =>
          unmarshall(item)
        ) as unknown as DynamoData[]),
      ]
      lastEvaluatedKey = response.LastEvaluatedKey
    } catch (err) {
      log('error', `dynamo db error ${(err as Error).message}`)
    }
    // eslint-disable-next-line no-constant-condition
  } while (lastEvaluatedKey)

  const lbs = items
    .filter((it) => it.type === 'LB')
    .map(
      ({
        id,
        apps,
        createdAt,
        name,
        gigastake,
        gigastakeRedirect,
        email,
        relaysUsed,
        maxRelays,
        percentageUsed,
        chains,
      }) =>
      ({
        id: id,
        level: 'info',
        timestamp: createdAt,
        hourstamp: createdAt,
        relaysUsed,
        maxRelays,
        percentageUsed,
        email,
        chains,
        loadBalancerName: name,
        loadBalancerApps: apps,
        loadBalancerId: id,
        gigastake,
        gigastakeRedirect,
      } as LoadBalancerLog)
    )

  const apps = items
    .filter((it) => it.type === 'APP')
    .map(
      ({
        id,
        createdAt,
        name,
        email,
        relaysUsed,
        maxRelays,
        percentageUsed,
        chains,
        address,
        publicKey,
        dummy,
      }) =>
      ({
        id: id,
        level: 'info',
        timestamp: createdAt,
        hourstamp: createdAt,
        relaysUsed,
        maxRelays,
        percentageUsed,
        email,
        chains,
        applicationAddress: address,
        applicationName: name,
        applicationPublicKey: publicKey,
        applicationID: id,
        dummy: dummy,
      } as ApplicationLog)
    )

  const date = getTodayISODate()

  if (apps.length == 0 && lbs.length == 0) {
    await sendMessage(`No apps/lbs exceeded their relays on [${date}]`)
    return
  }

  const lbsResult = mapExceededThresholds(lbs)
  const appResult = mapExceededThresholds(apps)

  const appsMessages = buildEmbedMessages(appResult)
  const lbsMessages = buildEmbedMessages(lbsResult)

  await sendMessage(`Exceeded Application/Load Balancer Relays of [${date}]`)

  const messagesToSend = []
  for (const [name, app] of appsMessages) {
    // Don't publish apps belonging to a Load Balancer
    // const id = app[0].value
    // if (!id || lbOfApps.get(id)) {
    //   continue
    // }

    const embeds = splitEmbeds(app)
    for (const embed of embeds) {
      messagesToSend.push(sendEmbedMessage(`App: ${name}`, embed))
    }
  }
  for (const [name, lb] of lbsMessages) {
    const embeds = splitEmbeds(lb)
    for (const embed of embeds) {
      messagesToSend.push(sendEmbedMessage(`LB: ${name}`, embed))
    }
  }

  await Promise.allSettled(messagesToSend)

  const maxUsage = await buildMaxUsageMsg()
  await sendEmbedMessage(
    'Time of day with maximum number of apps/lbs',
    maxUsage
  )

  // FIXME: Calculations don't reflect actual real-world values
  // await sendEmbedMessage('Top Greedy Lbs',
  //   getTopUsedMsg(lbsResult as Map<string, LoadBalancerLog[]>, 5))

  return { message: 'ok' }
}
