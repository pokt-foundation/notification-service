import { InfluxDB } from '@influxdata/influxdb-client'
import { GetUsageDataQuery } from '../models/types'
import { getHoursFromNowUtcDate, getUTCTimestamp } from './date-utils'
import log from './logger'

const QUERY_START_TIME =
  parseInt(process.env.INFLUX_QUERY_START_TIME ?? '') || 0

const BUCKET_NAME = process.env.BUCKET_NAME || ''

const DEFAULT_INFLUX_TIMEOUT = 20000

export const influx = new InfluxDB({
  url: process.env.INFLUX_ENDPOINT ?? '',
  token: process.env.INFLUX_TOKEN ?? '',
  timeout: DEFAULT_INFLUX_TIMEOUT,
}).getQueryApi(process.env.INFLUX_ORG ?? '')

export function buildAppUsageQuery({
  start,
  stop,
}: {
  start: string
  stop: string
}): string {
  return `
total = from(bucket: "${BUCKET_NAME}")
|> range(start: ${start}, stop: ${stop})
|> filter(fn: (r) =>
  r._measurement == "relay" and
  r._field == "count"
)
|> keep(columns: ["_value", "applicationPublicKey"])
|> group(columns: ["applicationPublicKey"])
|> sum()
|> yield()
`
}

export async function getUsageData(): Promise<GetUsageDataQuery[]> {
  let usage: any[] = []

  try {
    usage = (await influx.collectRows(
      buildAppUsageQuery({
        start: getHoursFromNowUtcDate(QUERY_START_TIME),
        stop: getUTCTimestamp(),
      })
    )) as unknown as any[]
  } catch (err) {
    log(
      'error',
      'failed retrieving relays data from influx',
      (err as Error).message
    )
    throw err
  }

  const appData = usage.map((data: any) => ({
    relays: data._value,
    applicationPublicKey: data.applicationPublicKey,
    result: data.result,
    table: data.table,
  }))

  return appData as GetUsageDataQuery[]
}
