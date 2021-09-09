import log from './logger'
import {
  Client,
  EmbedFieldData,
  MessageEmbed,
  TextChannel,
  DiscordAPIError,
  Message,
} from 'discord.js'

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || ''
const CHANNEL_ID = process.env.CHANNEL_ID || ''
const EMBED_COLOR = '#136682'
const EMBED_FIELDS_LIMIT = 25

const client = new Client()

;(async function startClient() {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  client.on('ready', function () {})
  await client.login(DISCORD_TOKEN)
})()

/**
 * Split embed fields to be lower than the allowed limit by discord
 * @param fields number of fields in the embedded message
 * @returns array of array of fields, each with a maximun length of the embed limit
 */
export function splitEmbeds(fields: EmbedFieldData[]): EmbedFieldData[][] {
  if (fields.length <= EMBED_FIELDS_LIMIT) {
    return [fields]
  }
  const result: EmbedFieldData[][] = []
  const iterations = Math.ceil(fields.length / EMBED_FIELDS_LIMIT)

  for (let i = 0; i < iterations; i++) {
    const start = i * EMBED_FIELDS_LIMIT

    const maxEnd = start + EMBED_FIELDS_LIMIT
    const end = maxEnd <= fields.length ? maxEnd : fields.length

    const segment = fields.slice(start, end)

    result.push(segment)
  }

  return result
}

export async function sendEmbedMessage(
  title: string,
  fields: EmbedFieldData[]
): Promise<Message> {
  try {
    const channel = client.channels.cache.get(CHANNEL_ID)
    const messageEmbed = new MessageEmbed()
      .setColor(EMBED_COLOR)
      .setTitle(title)
      .addFields(fields)
      .setTimestamp()
    return await (channel as TextChannel).send(messageEmbed)
  } catch (err) {
    log(
      'error',
      'failed sending embedded message to discord',
      (err as unknown as DiscordAPIError).message
    )
    throw err
  }
}

export async function sendMessage(content: string | object): Promise<Message> {
  try {
    const channel = client.channels.cache.get(CHANNEL_ID)
    return await (channel as TextChannel).send(content)
  } catch (err) {
    log(
      'error',
      'failed sending embedded message to discord',
      (err as unknown as DiscordAPIError).message
    )
    throw err
  }
}
