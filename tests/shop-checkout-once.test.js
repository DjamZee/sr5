import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  SR5ShopWindow
} from '../modules/interface/shop-window.js'
import {
  SR5ShopVendor
} from '../modules/interface/shop-vendor.js'

// Anomalies de la boutique (djamz.16): the cart showed 1 × AK-98 at a gamemaster's vendor and the till sold 2. The
// cart is emptied only once the till answers; a second click on Pay meanwhile went to the till with the same cart,
// queued behind the first sale (shop-vendor.js #serial), and sold the rifle a second time.
describe('the Pay button of a vendor', () => {
  const checkout = SR5ShopWindow.DEFAULT_OPTIONS.actions.checkoutCart
  const shop = () => ({
    _source: {
      vendor: true, actorUuid: 'Actor.vendor', storageId: 'shop'
    },
    _buyerId: 'buyer', _payWith: '', _equipMode: false, _checkingOut: false, render: vi.fn(),
    _cart: [{
      uuid: 'Actor.vendor.Item.ak98', grade: null, quantity: 1, name: 'AK-98'
    }],
  })

  afterEach(() => vi.restoreAllMocks())

  it('sends the cart to the till once, however many clicks reach it before the answer', async () => {
    let answer
    const purchase = vi.spyOn(SR5ShopVendor, 'purchase').mockImplementation(() => new Promise(resolve => {
      answer = resolve
    }))
    const window = shop()
    const button = {
      disabled: false
    }
    const first = checkout.call(window, {
    }, button)
    const second = checkout.call(window, {
    }, button)
    expect(button.disabled).toBe(true)
    answer(true)
    await Promise.all([first, second])
    expect(purchase).toHaveBeenCalledOnce()
    expect(purchase.mock.calls[0][0].lines).toEqual([expect.objectContaining({
      uuid: 'Actor.vendor.Item.ak98', quantity: 1
    })])
    expect(window._cart).toEqual([])
    expect(window._checkingOut).toBe(false)
  })

  it('lets the buyer pay again once the till said no, the cart kept', async () => {
    const purchase = vi.spyOn(SR5ShopVendor, 'purchase').mockResolvedValue(false)
    const window = shop()
    await checkout.call(window, {
    }, null)
    await checkout.call(window, {
    }, null)
    expect(purchase).toHaveBeenCalledTimes(2)
    expect(window._cart).toHaveLength(1)
    expect(window._checkingOut).toBe(false)
    expect(window.render).toHaveBeenCalledTimes(2)
  })

  it('opens the button again when the till throws', async () => {
    vi.spyOn(SR5ShopVendor, 'purchase').mockRejectedValue(new Error('socket'))
    const window = shop()
    await expect(checkout.call(window, {
    }, null)).rejects.toThrow('socket')
    expect(window._checkingOut).toBe(false)
    expect(window._cart).toHaveLength(1)
  })
})
