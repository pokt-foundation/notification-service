import mongoose from 'mongoose'

const connect = (): void =>
  mongoose.connect(process.env.MONGODB_CONN_STR || '', {
    // @ts-ignore
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

export default connect
