import { Model } from 'mongoose';
import log from '../lib/logger';

const CACHE_TTL = parseInt(process.env.NETWORK_CACHE_TTL ?? '') || 3600;

export async function getModelFromDBOrCache<T>(redis: any, model: Model<T, {}, {}>, cacheKey: string): Promise<T[]> {
  let result: T[] = [];

  try {
    const cached = await redis.get(cacheKey)
    if (!cached) {
      result = await model.find()
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL)
    } else {
      result = JSON.parse(cached)
    }
  } catch (err) {
    log('error', 'failed retrieving database model', (err as Error).message)
    throw err
  }

  return result
}