import log from "./logger"
import axios, { AxiosError } from 'axios';

const WEBHOOK_URL = process.env.WEBHOOK_URL || ""

export async function sendDiscordMessage(data: object | string) {
  try {
    return await axios.post(WEBHOOK_URL, { username: 'Notifications Bot', content: data })
  } catch (err) {
    log('error', 'failed sending message to discord webhook', (err as unknown as AxiosError).message)
    throw err
  }
}