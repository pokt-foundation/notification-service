import { InfluxDB } from '@influxdata/influxdb-client'

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
  start: string,
  stop: string,
}) {
  return `
total = from(bucket: "mainnetRelay1d")
|> range(start: ${start}, stop: ${stop})
|> filter(fn: (r) =>
  r._measurement == "relay" and
  r._field == "count" and
  (r.method != "synccheck" and r.method != "chaincheck")
)
|> group(columns: ["host", "nodePublicKey", "region", "result", "method"])
|> keep(columns: ["_value", "applicationPublicKey"])
|> group(columns: ["applicationPublicKey"])
|> sum()
|> yield()
`
}
