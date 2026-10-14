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
