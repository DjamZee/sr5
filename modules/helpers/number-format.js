/**
 * Numbers and nuyen as the GAME's language writes them, never the browser's: « 1 000 ¥ » in a French world,
 * « 1,000 ¥ » in an English one. A bare `n.toLocaleString()` follows the browser, so a French table on an
 * English browser read « 1,000 ¥ » in its own shop.
 *
 *   import { formatNumber, formatNuyen } from '../helpers/number-format.js'
 *
 * Out of Foundry (the tests), the language falls back to 'en'.
 */

const formats = new Map()

/** The game's language (game.i18n.lang), 'en' when there is none. */
export function gameLang() {
  const lang = globalThis.game?.i18n?.lang
  return typeof lang === 'string' && lang ? lang : 'en'
}

function numberFormat(lang, fraction) {
  const key = `${lang}|${fraction}`
  let format = formats.get(key)
  if (!format) {
    try {
      format = new Intl.NumberFormat(lang, {
        maximumFractionDigits: fraction
      })
    } catch {
      // A language code Intl does not know: the English writing rather than an error on the sheet
      format = new Intl.NumberFormat('en', {
        maximumFractionDigits: fraction
      })
    }
    formats.set(key, format)
  }
  return format
}

/**
 * A number with the game's thousands separator and decimal mark. `fraction`: at most that many decimals
 * (3 by default, as toLocaleString() does). Anything that is not a number is returned as it was written.
 */
export function formatNumber(n, {
  fraction = 3
} = {
}) {
  const value = typeof n === 'number' ? n : Number(n)
  if (n === null || n === undefined || n === '' || Number.isNaN(value)) return n === null || n === undefined ? '' : String(n)
  return numberFormat(gameLang(), fraction).format(value)
}

/** An amount of nuyen: « 1 000 ¥ » (fr), « 1,000 ¥ » (en), two decimals at most. */
export function formatNuyen(n) {
  return `${formatNumber(Number(n) || 0, {
    fraction: 2
  })} ¥`
}

/**
 * A date and time as the game's language writes them: « 21/10/2026 23:40:00 » (fr), « 10/21/2026, 11:40:00 PM » (en).
 * A bare `new Date(…).toLocaleString()` follows the browser. Anything that is not a date is returned as ''.
 */
export function formatDateTime(date) {
  const value = date instanceof Date ? date : new Date(date)
  if (date === null || date === undefined || date === '' || Number.isNaN(value.getTime())) return ''
  try {
    return value.toLocaleString(gameLang())
  } catch {
    // A language code Intl does not know: the English writing rather than an error in the window
    return value.toLocaleString('en')
  }
}
