import type { AppData } from './types'
import { DEFAULT_CALENDAR_URL } from './constants'

export function isStoredAppData(x: unknown): x is AppData {
  if (!x || typeof x !== 'object') return false
  const obj = x as Record<string, unknown>
  return (
    typeof obj.profile_name === 'string' &&
    typeof obj.year === 'number' &&
    typeof obj.lcb === 'number' &&
    typeof obj.dependents === 'number' &&
    typeof obj.months === 'object' &&
    typeof obj.settings === 'object' &&
    typeof obj.lastUpdated === 'number'
  )
}

export function hasMeaningfulData(data: AppData): boolean {
  if (data.lcb > 0 || data.dependents > 0) return true
  for (const m of Object.values(data.months)) {
    if (m.other > 0 || Object.keys(m.ot).length > 0) return true
  }
  return false
}

export function getMergedCalendarUrl(settingsUrl: string | undefined): string {
  let finalUrl = settingsUrl || DEFAULT_CALENDAR_URL

  if (!finalUrl.startsWith('http')) {
    finalUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(finalUrl)}&src=578s5hnkj9o8u4pg1sre0g83fk%40group.calendar.google.com&src=vi.vietnamese%23holiday%40group.v.calendar.google.com&ctz=Asia%2FHo_Chi_Minh&showTitle=0&showCalendars=0&showTz=0`
  } else if (finalUrl.startsWith('http')) {
    try {
      const urlObj = new URL(finalUrl)
      urlObj.searchParams.set('showTitle', '0')
      urlObj.searchParams.set('showCalendars', '0')
      urlObj.searchParams.set('showTz', '0')
      const sources = urlObj.searchParams.getAll('src')
      if (!sources.includes('578s5hnkj9o8u4pg1sre0g83fk@group.calendar.google.com')) {
        urlObj.searchParams.append('src', '578s5hnkj9o8u4pg1sre0g83fk@group.calendar.google.com')
      }
      if (!sources.includes('vi.vietnamese#holiday@group.v.calendar.google.com')) {
        urlObj.searchParams.append('src', 'vi.vietnamese#holiday@group.v.calendar.google.com')
      }
      finalUrl = urlObj.toString()
    } catch {
      if (!finalUrl.includes('showTitle=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'showTitle=0'
      }
      if (!finalUrl.includes('showCalendars=')) {
        finalUrl += '&showCalendars=0'
      }
      if (!finalUrl.includes('showTz=')) {
        finalUrl += '&showTz=0'
      }
    }
  }

  return finalUrl
}

export function isValidPassphrase(passphrase: string): boolean {
  return passphrase.length >= 6
}

export async function hashGuestCode(name: string, passphrase: string): Promise<string> {
  const combined = `${name.trim().toLowerCase()}:${passphrase}`
  const encoder = new TextEncoder()
  const data = encoder.encode(combined)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.slice(0, 16)
}
