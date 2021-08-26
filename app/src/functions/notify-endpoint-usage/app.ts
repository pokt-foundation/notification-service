import Redis from 'ioredis'
import { influx, buildAppUsageQuery } from '../../lib/influx'
import { getUTCTimestamp, getHoursFromNowUtcDate } from '../../lib/date-utils'

const redisHost = process.env.REDIS_HOST || ''
const redisPort = process.env.REDIS_PORT || ''

export async function getUsageData() {
  const usage = influx.collectRows(buildAppUsageQuery({
    start: getHoursFromNowUtcDate(0),
    stop: getUTCTimestamp()
  }))

  console.log(usage)

  return usage
}

exports.handler = async () => {
  const redis = new Redis(parseInt(redisPort), redisHost)
  await getUsageData()
};
