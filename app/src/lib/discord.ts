import log from "./logger"
import { Client, EmbedFieldData, MessageEmbed, TextChannel, DiscordAPIError } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN_URL || ""
const CHANNEL_ID = process.env.CHANNEL_ID || ""

const client = new Client();

(async function startClient() {
  client.on('ready', function () { })
  await client.login(DISCORD_TOKEN)
})()

export async function sendDiscordThresholdData(title: string, fields: EmbedFieldData[]) {
  try {
    const channel = client.channels.cache.get(CHANNEL_ID)
    const messageEmbed = new MessageEmbed().setColor('#136682').setTitle(title)
      .addFields(fields).setTimestamp()
    return await (channel as TextChannel).send(messageEmbed)
  } catch (err) {
    log('error', 'failed sending embedded message to discord', (err as unknown as DiscordAPIError).message)
    throw err
  }
}

export async function sendMessage(content: string | object) {
  try {
    const channel = client.channels.cache.get(CHANNEL_ID)
    return await (channel as TextChannel).send(content)
  } catch (err) {
    log('error', 'failed sending embedded message to discord', (err as unknown as DiscordAPIError).message)
    throw err
  }
}