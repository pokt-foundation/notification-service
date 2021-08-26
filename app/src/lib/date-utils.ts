import dayjs from 'dayjs'
import dayJsutcPlugin from 'dayjs/plugin/utc'

export function getUTCTimestamp(): string {
  const timestamp = new Date()

  return timestamp.toISOString()
}

export function getDaysFromNowUtcDate(daysAgo: number): string {
  dayjs.extend(dayJsutcPlugin)

  const dateDaysAgo = dayjs.utc().subtract(daysAgo, 'day')

  const formattedTimestamp = `${dateDaysAgo.year()}-0${
    dateDaysAgo.month() + 1
  }-${
    dateDaysAgo.date() < 10 ? `0${dateDaysAgo.date()}` : dateDaysAgo.date()
  }T00:00:00+00:00`

  return formattedTimestamp
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
