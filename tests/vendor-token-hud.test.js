import {
  describe, expect, it
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  hudShopOfToken, vendorShopOfToken
} from '../modules/interface/shop-vendor-rules.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const shop = (id, isOpen) => ({
  id, type: 'itemStorage', system: {
    type: 'shop', shop: {
      isOpen
    }
  }
})
const token = (items, isOwner) => ({
  actor: {
    isOwner, items
  }
})

// Relecture djamz.13, lot R6: the right-click on a vendor's token opens its shop
describe('the shop of a vendor token, from the right-click', () => {
  it('the gamemaster opens any shop the actor carries, the open one first', () => {
    const closed = shop('a', false)
    const open = shop('b', true)
    expect(hudShopOfToken(token([closed, open], true), true).storage).toBe(open)
    expect(hudShopOfToken(token([closed], true), true).storage).toBe(closed)
    expect(hudShopOfToken(token([], true), true)).toBeNull()
  })

  it('anyone else only an open shop of an actor they do not own', () => {
    expect(hudShopOfToken(token([shop('a', false)], false), false)).toBeNull()
    expect(hudShopOfToken(token([shop('a', true)], true), false)).toBeNull()
    expect(hudShopOfToken(token([shop('a', true)], false), false)).toEqual(vendorShopOfToken(token([shop('a', true)], false)))
  })

  it('the token lets the player\'s right-click through and keeps the double-click', () => {
    const source = read('../modules/interface/token.js')
    expect(source).toMatch(/_canHUD[\s\S]{0,900}vendorShopOfToken\(this\.document\)/)
    expect(source).toMatch(/_onClickRight[\s\S]{0,900}SR5ShopVendor\.openShop\(vendor\.actor, vendor\.storage\)/)
    expect(source).toMatch(/_onClickLeft2[\s\S]{0,400}SR5ShopVendor\.openShop/)
  })
})
