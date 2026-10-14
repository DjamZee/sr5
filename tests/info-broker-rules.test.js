import {
  describe, it, expect
} from 'vitest'
import {
  INFO_TYPES, infoType, priceRangeLabel, startingQuote, quoteInRange, nextStatus, sortRequests, forOwner, fileName,
  cleanRequest
} from '../modules/system/info-broker-rules.js'

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
