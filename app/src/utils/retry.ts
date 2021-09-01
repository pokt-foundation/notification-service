import logger from '../lib/logger';

/*
 * Calls `callback` exponentially, everytime `retry()` is called.
 * Returns a promise that resolves with the callback's result if it (eventually) succeeds.
 *
 * Usage:
 *
 * retryEvery(retry => {
 *  // do something
 *
 *  if (condition) {
 *    // retry in 1, 2, 4, 8 seconds‚Ä¶ as long as the condition passes.
 *    retry()
 *  }
 * }, 1000, 2)
 *
 */
export const retryEvery = async <T extends Function>(
  callback: T,
  { initialRetryTimer = 1000, increaseFactor = 3, maxRetries = 3 } = {}
): Promise<any> => {
  const sleep = (time: number) => new Promise(resolve => setTimeout(resolve, time))

  let retryNum = 0
  const attempt: any = async (retryTimer = initialRetryTimer) => {
    try {
      return await callback()
    } catch (err) {
      if (retryNum === maxRetries) {
        throw err
      }
      ++retryNum

      // Exponentially backoff attempts
      const nextRetryTime = retryTimer * increaseFactor
      logger.log('warn', `Operation failed. Retrying in ${nextRetryTime}s... (attempt ${retryNum} of ${maxRetries})`, (err as Error).message)
      await sleep(nextRetryTime)
      return attempt(nextRetryTime)
    }
  }

  return attempt()
}