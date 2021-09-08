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

const client = new Client()

  ; (async function startClient() {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    client.on('ready', function () { })
    await client.login(DISCORD_TOKEN)
  })()

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
