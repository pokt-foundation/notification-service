import MailgunService from '../lib/email'
import { ExtendedLoadBalancerData } from '../models/types'
import User from '../models/User'

export async function notifyUserForUsage(lbs: Map<string, ExtendedLoadBalancerData>): Promise<void> {
  const mailgun = new MailgunService()

  for (const [id, extendedLB] of lbs.entries()) {
    const { notificationSettings, percentageUsed, name, userID } = extendedLB
    const { signedUp, quarter, half, threeQuarters, full } = notificationSettings

    if (!signedUp) {
      continue
    }

    // TODO: Check cached thresholds...
    // const cachedThresholds = await redis.get(`${id}-cached-thresholds`)
    let notificationToCache = -1

    if (percentageUsed >= 25 && quarter) {
      notificationToCache = 25
    }

    if (percentageUsed >= 50 && half) {
      notificationToCache = 50
    }

    if (percentageUsed >= 75 && threeQuarters) {
      notificationToCache = 75
    }

    if (percentageUsed >= 100 && full) {
      notificationToCache = 100
    }
    
    const user = await User.findById(userID)

    if (!user) {
      // TODO: Log that user couldn't be found and notified
      continue
    }

    if (notificationToCache !== -1) {
      await mailgun.send({
        templateData: {
          actual_usage: `${percentageUsed}%`,
          usage: `${notificationToCache}%`,
          app_id: id,
          app_name: name
        },
        templateName: 'NotificationThresholdHit',
        toEmail: user.email
      })
    }
  }
}
