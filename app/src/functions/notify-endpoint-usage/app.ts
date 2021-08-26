import Redis from 'ioredis'

const redisHost = process.env.REDIS_HOST || ''
const redisPort = process.env.REDIS_PORT || ''

exports.handler = async () => {
  const redis = new Redis(parseInt(redisPort), redisHost)
};