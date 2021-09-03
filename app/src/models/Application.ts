import { Schema, model, Model, Document, Types } from 'mongoose'

export interface IFreeTierApplicationAccount {
  address: string
  publicKey: string
  privateKey: string
  passPhrase: string
}

export interface IGatewayAAT {
  version: string
  clientPublicKey: string
  applicationPublicKey: string
  applicationSignature: string
}

export interface IGatewaySettings {
  secretKey: string
  secretKeyRequired: boolean
  whitelistOrigins: string[]
  whitelistuserAgents: string[]
}

export interface INotificationSettings {
  signedUp: boolean
  quarter: boolean
  quarterLastSent?: Date | number
  half: boolean
  halfLastSent?: Date | number
  threeQuarters: boolean
  threeQuartersLastSent?: Date | number
  full: boolean
  fullLastSent?: Date | number
  createdAt?: Date | number
}

export interface IApplication extends Document {
  chain: string
  name: string
  user: Types.ObjectId | string
  freeTier: boolean
  status: string
  lastChangedStatusAt: Date | number
  freeTierApplicationAccount: IFreeTierApplicationAccount
  gatewayAAT: IGatewayAAT
  gatewaySettings: IGatewaySettings
  notificationSettings: INotificationSettings
  createdAt?: Date | number
  updatedAt?: Date | number
  encryptPrivateKey: (privateKey: string) => string
  decryptPrivateKey: (privateKey: string) => string
  validateMetadata: ({
    name,
    owner,
    user,
    contactEmail,
  }: {
    name: string
    owner: string
    user: string
    contactEmail: string
  }) => string
}

const applicationSchema = new Schema<IApplication>(
  {
    chain: String,
    name: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    freeTier: Boolean,
    status: String,
    lastChangedStatusAt: Date,
    freeTierApplicationAccount: {
      address: String,
      publicKey: String,
      privateKey: String,
      passPhrase: String,
    },
    gatewayAAT: {
      version: String,
      clientPublicKey: String,
      applicationPublicKey: String,
      applicationSignature: String,
    },
    gatewaySettings: {
      secretKey: String,
      secretKeyRequired: Boolean,
      whitelistOrigins: [],
      whitelistUserAgents: [],
    },
    notificationSettings: {
      signedUp: Boolean,
      quarter: Boolean,
      quarterLastSent: Date,
      half: Boolean,
      halfLastSent: Date,
      threeQuarters: Boolean,
      threeQuartersLastSent: Date,
      full: Boolean,
      fullLastSent: Date,
    },
    createdAt: {
      type: Date,
      default: new Date(Date.now()),
    },
    updatedAt: {
      type: Date,
      default: new Date(Date.now()),
    },
  },
  { collection: 'Applications' }
)

const ApplicationModel: Model<IApplication> = model(
  'Application',
  applicationSchema
)

export default ApplicationModel
