import { Schema, model, Model, Document } from 'mongoose'

export interface IUser extends Document {
  provider?: string
  email: string
  username: string
  password: string
  lastLogin: string
  validated: boolean
  v2: boolean
}

const userSchema = new Schema<IUser>(
  {
    provider: String,
    email: String,
    username: String,
    password: String,
    lastLogin: String,
    validated: Boolean,
    v2: Boolean,
  },
  { collection: 'Users' }
)

const User: Model<IUser> = model('User', userSchema)

export default User
