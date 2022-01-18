import Redis from 'ioredis-mock'

const REDIS_HOST = process.env.REDIS_HOST || ''
const REDIS_PORT = process.env.REDIS_PORT || ''

const redis = new Redis()

export default redis
