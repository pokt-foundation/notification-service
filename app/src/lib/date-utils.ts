import dayjs from 'dayjs'
import dayJsutcPlugin from 'dayjs/plugin/utc'

const ISO_FORMAT = 'YYYY-MM-DD'

export function getUTCTimestamp(): string {
  const timestamp = new Date()

  return timestamp.toISOString()
}

export function getHoursFromNowUtcDate(hoursAgo: number): string {
  dayjs.extend(dayJsutcPlugin)

  const dayAgo = dayjs.utc().subtract(hoursAgo, 'hour')

  const year = dayAgo.year()
  const month = (dayAgo.month() + 1).toString().padStart(2, '0')
  const day = dayAgo.date().toString().padStart(2, '0')
  const hour = dayAgo.hour().toString().padStart(2, '0')

  const formattedTimestamp = `${year}-${month}-${day}T${hour}:00:00+00:00`

  return formattedTimestamp
}

export function getTodayUtcDate(): string {
  dayjs.extend(dayJsutcPlugin)

  const today = dayjs.utc().format()

  return today
}

export function getYesterdayISODate(): string {
  dayjs.extend(dayJsutcPlugin)

  const today = dayjs.utc()

  const yesterday = today.subtract(1, 'day')

  return yesterday.format(ISO_FORMAT)
}

export function getYesterdayUtcDate(): string {
  dayjs.extend(dayJsutcPlugin)

  const today = dayjs.utc()

  const yesterday = today.subtract(1, 'day')

  const year = yesterday.year()
  const month = (yesterday.month() + 1).toString().padStart(2, '0')
  const day = yesterday.date().toString().padStart(2, '0')

  const formattedTimestamp = `${year}-${month}-${day}T00:00:00+00:00`

  return formattedTimestamp
}

export function getHourFromUtcDate(date: string): string {
  dayjs.extend(dayJsutcPlugin)

  const time = dayjs(date)

  return time.format('HH:mm')
}

// Returns today's date in the format of `DD/MM/YYYY`
export function getTodayISODate(): string {
  dayjs.extend(dayJsutcPlugin)

  const time = dayjs()

  return time.format(ISO_FORMAT)
}

export function getSecondsForNextHour(): number {
  const ms = 3600000 - (new Date().getTime() % 3600000)
  return Math.floor(ms * 0.001)
}
