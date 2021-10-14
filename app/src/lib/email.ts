import mailgun, { Mailgun, messages } from 'mailgun-js'
import path from 'path'

const FROM_EMAIL = 'Pocket Portal <portal@pokt.network>'
const DOMAIN = 'pokt.network'

const WHITELISTED_TEMPLATES = new Map([
  [
    'NotificationThresholdHit',
    [
      'pocket-dashboard-notifications-threshold-hit',
      'Pocket Portal: App notification',
    ],
  ],
])

export interface INotificationTemplate {
  actual_usage: string
  app_id: string
  app_name: string
  usage: string
}


export default class MailgunService {
  private mailService: Mailgun

  constructor() {
    this.mailService = mailgun({
      apiKey: process.env.EMAIL_API_KEY ?? '',
      domain: DOMAIN,
    })
  }

  send({
    templateData,
    templateName = '',
    toEmail = '',
  }: {
    templateData?: INotificationTemplate
    templateName: string
    toEmail: string
  }): Promise<messages.SendResponse> {
    // @ts-ignore
    const [template, subject] = WHITELISTED_TEMPLATES.get(templateName)
    const message = {
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      template,
      inline: path.join(__dirname, 'portal_logo.png'),
    }

    if (templateData) {
      // @ts-ignore
      message['h:X-Mailgun-Variables'] = JSON.stringify(templateData)
    }

    return this.mailService.messages().send(message)
  }
}
