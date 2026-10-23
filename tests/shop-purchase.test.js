import {
  describe, it, expect
} from 'vitest'
import {
  purchaseStamp, stampAll, withoutPurchase, PURCHASE_FLAG
} from '../modules/interface/shop-purchase.js'

// Lot 12: one purchase id on the debit and on every piece, the same in play and in creation
describe('purchase trace', () => {
  const stamp = purchaseStamp({
    buyer: {
      id: 'pc1'
    }, recipient: {
      id: 'drone1'
    }, userId: 'u1', place: 'creation', worldTime: 120, randomID: () => 'abc123', now: new Date('2085-01-02T03:04:05Z'),
  })

  it('says who bought, for what, where and when', () => {
    expect(stamp).toEqual({
      id: 'abc123', buyer: 'pc1', recipient: 'drone1', user: 'u1', place: 'creation', vendor: null,
      date: '2085-01-02T03:04:05.000Z', worldTime: 120,
    })
  })

  it('shares a line\'s price among its pieces, the last taking what is left', () => {
    const datas = stampAll([{
      name: 'a'
    }, {
      name: 'b', flags: {
        sr5: {
          shopSource: 'x'
        }
      }
    }, {
      name: 'c'
    }], stamp, 100)
    expect(datas.map(d => d.flags.sr5[PURCHASE_FLAG].price)).toEqual([33, 33, 34])
    expect(datas.every(d => d.flags.sr5[PURCHASE_FLAG].id === 'abc123')).toBe(true)
    // What the piece already carried stays
    expect(datas[1].flags.sr5.shopSource).toBe('x')
  })

  it('reads the trace back, and drops it from what a vendor puts on its counter', () => {
    const [data] = stampAll([{
    }], stamp, 50)
    expect(data.flags.sr5[PURCHASE_FLAG]).toMatchObject({
      id: 'abc123', price: 50
    })
    expect(withoutPurchase(data).flags.sr5[PURCHASE_FLAG]).toBeUndefined()
    expect(withoutPurchase({
    })).toEqual({
    })
  })
})
