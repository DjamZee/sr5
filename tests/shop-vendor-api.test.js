import {
  describe, it, expect, vi
} from 'vitest'

// game.sr5.vendors (lot 43): what the Concepteur's NPC generator reads to list the templates and create a vendor
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForPlayer: async () => {}, emitForGM: async () => {}
  }
}))

const {
  SR5ShopVendor, vendorsApi
} = await import('../modules/interface/shop-vendor.js')
const {
  VENDOR_TEMPLATES, VENDOR_FAMILIES
} = await import('../modules/interface/shop-vendor-templates.js')

describe('game.sr5.vendors (lot 43)', () => {
  it('lists the templates and their families as the shop has them', () => {
    const api = vendorsApi()
    expect(api.templates).toBe(VENDOR_TEMPLATES)
    expect(api.families).toBe(VENDOR_FAMILIES)
  })

  it('creates through the shop own function, with the options as given', async () => {
    const spy = vi.spyOn(SR5ShopVendor, 'createFromTemplate').mockResolvedValue('created')
    const options = {
      templateKey: 'streetDoc', name: 'Doc', linked: false
    }
    expect(await vendorsApi().create(options)).toBe('created')
    expect(spy).toHaveBeenCalledWith(options)
    spy.mockRestore()
  })
})

// game.sr5.vendors.open (après djamz.13): the Landing Page's deck opens a vendor's shop
describe('game.sr5.vendors.open', () => {
  const shop = isOpen => ({
    id: 'st1', type: 'itemStorage', system: {
      type: 'shop', shop: {
        isOpen
      }
    }
  })
  const setup = (storage, isGM) => {
    const actor = {
      uuid: 'Actor.v1', items: new Map([[storage.id, storage]])
    }
    globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null
    globalThis.game = {
      user: {
        isGM
      }
    }
    const spy = vi.spyOn(SR5ShopVendor, 'openShop').mockResolvedValue('window')
    return {
      actor, spy
    }
  }

  it('opens an open shop to a player, in the shop own window', async () => {
    const storage = shop(true)
    const {
      actor, spy
    } = setup(storage, false)
    expect(await vendorsApi().open('Actor.v1', 'st1')).toBe('window')
    expect(spy).toHaveBeenCalledWith(actor, storage)
    spy.mockRestore()
  })

  it('refuses a closed shop to a player, opens it to the gamemaster', async () => {
    let {
      spy
    } = setup(shop(false), false)
    expect(await vendorsApi().open('Actor.v1', 'st1')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore();
    ({
      spy
    } = setup(shop(false), true))
    expect(await vendorsApi().open('Actor.v1', 'st1')).toBe('window')
    spy.mockRestore()
  })

  it('gives null for an unknown vendor or a storage that is no shop', async () => {
    const {
      spy
    } = setup({
      id: 'st1', type: 'itemStorage', system: {
        type: 'bag'
      }
    }, true)
    expect(await vendorsApi().open('Actor.gone', 'st1')).toBeNull()
    expect(await vendorsApi().open('Actor.v1', 'st1')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
