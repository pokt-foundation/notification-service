import get from 'lodash/get'

export const convertToMap = <T>(
  array: T[],
  fieldKey: string
): Map<string, T> => {
  const result = new Map<string, T>()

  array.forEach((entry: T) => {
    const field = get(entry, fieldKey)
    if (field) result.set(field, entry)
  })

  return result
}

export const formatNumber = (num: number) =>
  new Intl.NumberFormat('en-US').format(num)
