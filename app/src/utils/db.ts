import { Model } from 'mongoose';
import get from 'lodash/get'
import logger from '../lib/logger';

const CACHE_TTL = parseInt(process.env.NETWORK_CACHE_TTL ?? '') || 3600;

export async function getModelFromDbOrCache<T>(redis: any, model: Model<T, {}, {}>, cacheKey: string, fieldKey: string): Promise<Map<string, T>> {
  const result = new Map<string, T>()

  try {
    let db: T[]
    const cached = await redis.get(cacheKey)
    if (!cached) {
      db = await model.find()
      await redis.set(cacheKey, JSON.stringify(db), 'EX', CACHE_TTL)
    } else {
      db = JSON.parse(cached)
    }

    db.forEach((entry) => {
      const field = get(entry, fieldKey)
      if (field)
        result.set(field, entry)
    })
  } catch (err) {
    logger.log('error', 'failed retrieving database model', (err as Error).message)
    throw err
  }

  return result
}