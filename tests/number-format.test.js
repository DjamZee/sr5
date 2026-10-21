import {
  describe, it, expect, afterEach
} from 'vitest'
import {
  formatNumber, formatNuyen, gameLang, formatDateTime
} from '../modules/helpers/number-format.js'
import {
  priceRangeLabel, infoType
} from '../modules/system/info-broker-rules.js'

// Nuyen follow the GAME's language (game.i18n.lang), never the browser's: « 1 000 ¥ » / « 1,000 ¥ »
const lang = globalThis.game.i18n.lang
const play = l => { globalThis.game.i18n.lang = l }
// Intl writes the French thousands with a narrow no-break space (U+202F) or a no-break space, as it chooses
const spaces = s => s.replace(/[\u202f\u00a0]/g, ' ')

describe('numbers in the language of the game', () => {
  afterEach(() => { globalThis.game.i18n.lang = lang })

  it('writes 1234567.5 the French way in a French game', () => {
    play('fr')
    expect(spaces(formatNumber(1234567.5))).toBe('1 234 567,5')
    expect(formatNumber(1234567.5)).toBe(new Intl.NumberFormat('fr').format(1234567.5))
    expect(spaces(formatNuyen(1000))).toBe('1 000 ¥')
  })

  it('writes it the English way in an English game', () => {
    play('en')
    expect(formatNumber(1234567.5)).toBe('1,234,567.5')
    expect(formatNuyen(1000)).toBe('1,000 ¥')
  })

  it('falls back to English out of Foundry or on an unknown language', () => {
    play(undefined)
    expect(gameLang()).toBe('en')
    expect(formatNumber(2500)).toBe('2,500')
    play('not a language!')
    expect(formatNumber(2500)).toBe('2,500')
  })

  it('caps the decimals as asked, and leaves a non-number as written', () => {
    play('en')
    expect(formatNumber(0.105)).toBe('0.105')
    expect(formatNumber(1.234, {
      fraction: 2
    })).toBe('1.23')
    expect(formatNuyen(12.345)).toBe('12.35 ¥')
    expect(formatNuyen(null)).toBe('0 ¥')
    expect(formatNumber('—')).toBe('—')
    expect(formatNumber(Infinity)).toBe('∞')
  })

  it('prints the information broker’s ranges in the game’s language, English included', () => {
    play('en')
    expect(priceRangeLabel(infoType('accessCodes'))).toBe('500–2,500 ¥')
    expect(priceRangeLabel(infoType('safehouses'))).toBe('1,000+ ¥')
    play('fr')
    expect(spaces(priceRangeLabel(infoType('accessCodes')))).toBe('500–2 500 ¥')
  })
})

// The last run of the Negotiation repair (negotiation-repair.js) was dated in the browser's language (djamz.16)
describe('dates in the language of the game', () => {
  afterEach(() => { globalThis.game.i18n.lang = lang })
  const date = '2026-10-21T21:40:05Z'

  it('writes the date as the game\'s language does', () => {
    play('fr')
    expect(formatDateTime(date)).toBe(new Date(date).toLocaleString('fr'))
    play('en')
    expect(formatDateTime(date)).toBe(new Date(date).toLocaleString('en'))
    expect(formatDateTime(new Date(date))).toBe(new Date(date).toLocaleString('en'))
  })

  it('falls back to English on an unknown language, and writes nothing for no date', () => {
    play('not a language!')
    expect(formatDateTime(date)).toBe(new Date(date).toLocaleString('en'))
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('not a date')).toBe('')
  })
})
