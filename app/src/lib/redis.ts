import Redis from 'ioredis'

const REDIS_HOST = process.env.REDIS_HOST || "";
const REDIS_PORT = process.env.REDIS_PORT || "";

const redis = new Redis(parseInt(REDIS_PORT), REDIS_HOST)

export default redis