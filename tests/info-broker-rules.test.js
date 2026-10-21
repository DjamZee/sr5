import {
  describe, it, expect
} from 'vitest'
import {
  INFO_TYPES, infoType, priceRangeLabel, formatNuyen, startingQuote, quoteInRange, nextStatus, sortRequests, forOwner, fileName,
  cleanRequest, requestTurn, requestSteps
} from '../modules/system/info-broker-rules.js'

// Relecture djamz.13, P1-38: who has the next move, and the steps of a request as a strip
describe('the course of a request', () => {
  it('says whose move it is', () => {
    expect(['asked', 'offered', 'paid'].map(requestTurn)).toEqual(['gm', 'gm', 'gm'])
    expect(['quoted', 'bid'].map(requestTurn)).toEqual(['owner', 'owner'])
    expect(['delivered', 'sold', 'notFound', 'declined', 'cancelled', 'refused'].every(s => requestTurn(s) === 'closed')).toBe(true)
  })

  const states = steps => steps.map(s => `${s.key}:${s.state}`).join(' ')
  it('lights the step reached on a purchase', () => {
    expect(states(requestSteps('buy', 'asked'))).toBe('asked:current quoted:todo paid:todo delivered:todo')
    expect(states(requestSteps('buy', 'quoted'))).toBe('asked:done quoted:current paid:todo delivered:todo')
    expect(states(requestSteps('buy', 'delivered'))).toBe('asked:done quoted:done paid:done delivered:done')
  })

  it('stops on the failed step', () => {
    expect(states(requestSteps('buy', 'notFound'))).toBe('asked:done notFound:failed')
    expect(states(requestSteps('buy', 'declined'))).toBe('asked:done quoted:done declined:failed')
    expect(states(requestSteps('sell', 'refused'))).toBe('offered:done refused:failed')
    expect(states(requestSteps('sell', 'bid'))).toBe('offered:done bid:current sold:todo')
  })
})

// Cutting Aces p. 148-149 (VF), checked against the VO table
describe('the price list of p. 149', () => {
  it('has the fifteen kinds of the book, two of them without ceiling', () => {
    expect(INFO_TYPES).toHaveLength(15)
    expect(INFO_TYPES.filter(t => t.max === null).map(t => t.key)).toEqual(['blackmail', 'safehouses'])
    expect(infoType('psychProfile')).toMatchObject({
      min: 750, max: 3000
    })
    expect(infoType('marketScan')).toMatchObject({
      min: 100, max: 300
    })
  })

  it('prints a range as the book does', () => {
    const plain = n => String(n)
    expect(priceRangeLabel(infoType('address'), plain)).toBe('200–750 ¥')
    expect(priceRangeLabel(infoType('blackmail'), plain)).toBe('2000+ ¥')
  })

  it('prints the nuyens in the table\'s language, not always in French', () => {
    expect(formatNuyen(2500, 'en')).toBe('2,500 ¥')
    expect(formatNuyen(2500, 'fr')).toMatch(/^2\s500 ¥$/u)
    expect(formatNuyen(undefined, 'en')).toBe('0 ¥')
    globalThis.game ??= {
    }
    const i18n = globalThis.game.i18n
    globalThis.game.i18n = {
      ...i18n, lang: 'en'
    }
    expect(formatNuyen(750)).toBe('750 ¥')
    expect(priceRangeLabel(infoType('accessCodes'))).toBe('500–2,500 ¥')
    globalThis.game.i18n = i18n
  })

  it('starts the quote at the low end and tells a price out of range', () => {
    expect(startingQuote(infoType('accessCodes'))).toBe(500)
    expect(quoteInRange(infoType('accessCodes'), 2500)).toBe(true)
    expect(quoteInRange(infoType('accessCodes'), 2600)).toBe(false)
    expect(quoteInRange(infoType('safehouses'), 50000)).toBe(true)
  })
})

describe('the life of a request', () => {
  it('lets the gamemaster quote and the buyer pay, never the other way round', () => {
    expect(nextStatus('asked', 'quote', 'gm')).toBe('quoted')
    expect(nextStatus('asked', 'quote', 'owner')).toBe(null)
    expect(nextStatus('quoted', 'accept', 'owner')).toBe('paid')
    expect(nextStatus('asked', 'accept', 'owner')).toBe(null)
    expect(nextStatus('paid', 'deliver', 'gm')).toBe('delivered')
    expect(nextStatus('paid', 'cancel', 'owner')).toBe(null)
  })

  it('sells the other way: offered, bid, sold', () => {
    expect(nextStatus('offered', 'bid', 'gm')).toBe('bid')
    expect(nextStatus('bid', 'sell', 'owner')).toBe('sold')
    expect(nextStatus('bid', 'decline', 'owner')).toBe('declined')
  })

  it('hides the reliability, the note and the undelivered content from the buyer', () => {
    const seen = forOwner({
      id: 'a', status: 'paid', reliability: 'false', gmNote: 'x', content: 'secret'
    })
    expect(seen).toEqual({
      id: 'a', status: 'paid'
    })
    expect(forOwner({
      status: 'delivered', content: 'ok', reliability: 'sound'
    }).content).toBe('ok')
  })

  it('lists the open requests first, newest first', () => {
    const list = sortRequests([{
      id: 1, status: 'delivered', time: 9
    }, {
      id: 2, status: 'asked', time: 1
    }, {
      id: 3, status: 'quoted', time: 5
    }])
    expect(list.map(e => e.id)).toEqual([3, 2, 1])
  })

  it('names the file and checks what a browser sends', () => {
    expect(fileName('Adresse', ' Mr. Johnson ')).toBe('Adresse — Mr. Johnson')
    expect(fileName('Nom', '')).toBe('Nom')
    expect(cleanRequest({
      type: 'nope'
    })).toBe(null)
    expect(cleanRequest({
      type: 'name', subject: 'x'.repeat(300), kind: 'other'
    })).toMatchObject({
      kind: 'buy', type: 'name', fileId: ''
    })
    expect(cleanRequest({
      type: 'name', kind: 'sell', fileId: 'f1', asked: '250'
    })).toMatchObject({
      kind: 'sell', fileId: 'f1', asked: 250
    })
  })
})
