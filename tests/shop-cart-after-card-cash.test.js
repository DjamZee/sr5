import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  SR5ShopWindow
} from '../modules/interface/shop-window.js'

// Noé, 16/10 (D7): "Cash the purchase" on the availability card paid the Predator V, and the open shop still showed
// it in the cart ("Pay 725 ¥") with the old balance: a second click paid it twice.
describe('the cart once an availability card is cashed', () => {
  const card = (results, content = '<footer class="sr-shop-card-footer"><span class="sr-shop-cashed">x</span></footer>') => [{
    flags: {
      sr5shop: {
        buyerId: 'buyer', results
      }
    }
  }, {
    content
  }]
  let shop

  beforeEach(() => {
    globalThis.game.actors = {
      get: id => (id === 'buyer' ? {
        id: 'buyer'
      } : undefined)
    }
    shop = {
      rendered: true, _buyerId: 'buyer', render: vi.fn(),
      _cart: [{
        uuid: 'pred', grade: null, quantity: 1, name: 'Predator V'
      }, {
        uuid: 'ware', grade: 'alpha', quantity: 1, name: 'Datajack'
      }],
    }
    SR5ShopWindow._instance = shop
  })
  afterEach(() => {
    SR5ShopWindow._instance = null
  })

  it('drops the line paid from the card and redraws', () => {
    SR5ShopWindow.onCardCashed(...card([{
      uuid: 'pred', quantity: 1, obtained: true
    }]))
    expect(shop._cart.map(l => l.uuid)).toEqual(['ware'])
    expect(shop.render).toHaveBeenCalledOnce()
  })

  it('keeps a line not obtained, another grade, and what is left of a larger quantity', () => {
    shop._cart[0].quantity = 3
    SR5ShopWindow.onCardCashed(...card([{
      uuid: 'pred', quantity: 2, obtained: true
    }, {
      uuid: 'ware', grade: 'beta', quantity: 1, obtained: true
    }]))
    expect(shop._cart).toEqual([expect.objectContaining({
      uuid: 'pred', quantity: 1
    }), expect.objectContaining({
      uuid: 'ware', grade: 'alpha', quantity: 1
    })])
  })

  it('leaves the cart of another buyer, and an update that cashes nothing', () => {
    shop._buyerId = 'other'
    SR5ShopWindow.onCardCashed(...card([{
      uuid: 'pred', obtained: true
    }]))
    shop._buyerId = 'buyer'
    SR5ShopWindow.onCardCashed(...card([{
      uuid: 'pred', obtained: true
    }], '<p>retry</p>'))
    expect(shop._cart).toHaveLength(2)
    expect(shop.render).not.toHaveBeenCalled()
  })
})
