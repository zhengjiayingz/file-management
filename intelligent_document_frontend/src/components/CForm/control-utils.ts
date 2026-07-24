import type { CFormFieldItem, CFormFieldType } from './types'

export function isSelectLikeType(t: CFormFieldType): boolean {
  return t === 'select' || t === 'select-multiple'
}

export function isDatePickerFieldType(t: CFormFieldType): boolean {
  return t === 'date' || t === 'datetime' || t === 'daterange' || t === 'datetimerange'
}

export function elDatePickerType(item: CFormFieldItem): 'date' | 'datetime' | 'daterange' | 'datetimerange' {
  switch (item.type) {
    case 'datetime':
      return 'datetime'
    case 'daterange':
      return 'daterange'
    case 'datetimerange':
      return 'datetimerange'
    default:
      return 'date'
  }
}

export function defaultValueFormatForDateType(t: CFormFieldType): string | undefined {
  switch (t) {
    case 'date':
    case 'daterange':
      return 'YYYY-MM-DD'
    case 'datetime':
    case 'datetimerange':
      return 'YYYY-MM-DD HH:mm:ss'
    default:
      return undefined
  }
}
