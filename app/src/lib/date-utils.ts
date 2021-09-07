import dayjs from 'dayjs'
import dayJsutcPlugin from 'dayjs/plugin/utc'

export function getUTCTimestamp(): string {
  const timestamp = new Date()

  return timestamp.toISOString()
}

export function getHoursFromNowUtcDate(hoursAgo: number): string {
  dayjs.extend(dayJsutcPlugin)

  const dayAgo = dayjs.utc().subtract(hoursAgo, 'hour')

  const formattedTimestamp = `${dayAgo.year()}-0${dayAgo.month() + 1}-${
    dayAgo.date() < 10 ? `0${dayAgo.date()}` : dayAgo.date()
  }T${
    dayAgo.hour() + 1 === 24
      ? '00'
      : dayAgo.hour() + 1 < 10
      ? `0${dayAgo.hour() + 1}`
      : dayAgo.hour() + 1
  }:00:00+00:00`

  return formattedTimestamp
}

export function getTodayUtcDate(): string {
  dayjs.extend(dayJsutcPlugin)

  const today = dayjs.utc()

  const todayBucket = `${today.year()}-0${today.month() + 1}-${
    today.date() < 10 ? `0${today.date()}` : today.date()
  }T00:00:00+00:00`

  return todayBucket
}

export function getHourFromUtcDate(date: string): string {
  dayjs.extend(dayJsutcPlugin)

  const time = dayjs(date)

  return time.format('HH:mm')
}

// Returns today's date in the format of `DD/MM/YYYY`
export function getTodayStringTime(): string {
  dayjs.extend(dayJsutcPlugin)

  const time = dayjs()

  return time.format('DD/MM/YYYY')
}

export function getSecondsForNextHour(): number {
  const ms = 3600000 - new Date().getTime() % 3600000;
  return Math.floor(ms * 0.001)
}