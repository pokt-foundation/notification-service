import axios, { AxiosResponse, AxiosError } from 'axios'
import { DataDogResponse } from '../models/datadog'
import log from './logger'

const AUTHENTICATION_HEADERS = {
  'DD-API-KEY': process.env.DD_API_KEY,
  'DD-APPLICATION-KEY': process.env.DD_APP_KEY,
}

export async function getQueryResults<T>(query: string): Promise<T[]> {
  const results: T[] = []

  const performRequest = async (url: string, body?: object) => {
    try {
      return await axios.post(url, body, { headers: AUTHENTICATION_HEADERS })
    } catch (err) {
      log('error', 'failed retrieving logs from DataDog', (err as unknown as AxiosError).message)
      throw err
    }
  }

  let cursor: string | undefined = ''

  while (cursor !== undefined) {
    const res: AxiosResponse<DataDogResponse<T>> = await performRequest('https://api.datadoghq.eu/api/v2/logs/events/search', {
      filter: {
        from: "now-2h",

        query: `service:notify-endpoint-usage ${query}`,
        to: "now"
      },
      options: {
        timeOffset: 0,
        timezone: "UTC"
      },
      ...(cursor ? {
        page: { cursor }
      } : undefined),
      sort: 'timestamp'
    })

    res.data.data.forEach((entry: any) => {
      results.push(entry.attributes.attributes)
    })

    cursor = res.data.meta?.page?.after
  }

  return results
}
