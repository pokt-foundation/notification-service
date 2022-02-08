import get from 'lodash/get'

export const convertToMap = <T>(
  array: T[],
  ...fieldKeys: string[]
): Map<string, T> => {
  const result = new Map<string, T>()

  array.forEach((entry: T) => {
    for (const fieldKey of fieldKeys) {
      const field = get(entry, fieldKey)
      if (field) {
        result.set(field, entry)
        break
      }
    }
  })

  return result
}

export const formatNumber = (num: number): string =>
  new Intl.NumberFormat('en-US').format(num)
