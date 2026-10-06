import {
  describe, it, expect, beforeEach, vi
} from 'vitest'

// A contact given to a vendor searches for it (SR5 p. 420): dropped on the shop window, it replaces
// the searcher; put on the vendor's sheet, it only fills an empty place. The gamemaster's alone: the
// contact's pool sets the availability test.
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForPlayer: async () => {}, emitForGM: async () => {}
  }
}))

const {
  SR5ShopVendor
} = await import('../modules/interface/shop-vendor.js')

let created, updates

// A vendor carrying a shop, and what it is given
function vendor({
  contactId = '', contacts = []
} = {
}) {
  const items = new Map()
  const actor = {
    id: 'vendor', items: {
      get: id => items.get(id) ?? null,
      filter: fn => [...items.values()].filter(fn),
    },
    createEmbeddedDocuments: async (_type, data, options) => {
      created.push({
        data, options
      })
      return data.map((d, i) => {
        const item = {
          ...d, id: `new${i}`, parent: actor
        }
        items.set(item.id, item)
        return item
      })
    },
  }
  const storage = {
    id: 'shop', type: 'itemStorage', parent: actor, system: {
      type: 'shop', shop: {
        contactId
      }
    },
    update: async data => {
      updates.push(data)
      storage.system.shop.contactId = data['system.shop.contactId']
    },
  }
  items.set(storage.id, storage)
  for (const c of contacts) items.set(c.id, {
    ...c, parent: actor
  })
  return {
    actor, storage
  }
}

const packContact = (name = "Vendeur d'armes") => ({
  id: 'packId', type: 'itemContact', name, parent: null,
  toObject: () => ({
    _id: 'packId', type: 'itemContact', name
  }),
})

beforeEach(() => {
  created = []
  updates = []
  globalThis.game.user = {
    id: 'gm', isGM: true
  }
})

describe('A contact given to a vendor (option C)', () => {
  it('copies a contact from a pack onto the vendor and makes it the searcher', async () => {
    const {
      actor, storage
    } = vendor({
      contactId: 'old', contacts: [{
        id: 'old', type: 'itemContact', name: 'Barman'
      }]
    })
    const own = await SR5ShopVendor.takeContact(actor, storage, packContact())
    expect(created).toHaveLength(1)
    expect(created[0].options.sr5ShopContact).toBe(true)
    expect(own.parent).toBe(actor)
    expect(storage.system.shop.contactId).toBe(own.id)
  })

  it('takes a contact the vendor already carries without copying it', async () => {
    const {
      actor, storage
    } = vendor({
      contacts: [{
        id: 'c1', type: 'itemContact', name: 'Doc'
      }]
    })
    await SR5ShopVendor.takeContact(actor, storage, actor.items.get('c1'))
    expect(created).toHaveLength(0)
    expect(storage.system.shop.contactId).toBe('c1')
  })

  it('keeps a searcher already chosen when asked not to replace it', async () => {
    const {
      actor, storage
    } = vendor({
      contactId: 'old', contacts: [{
        id: 'old', type: 'itemContact', name: 'Barman'
      }, {
        id: 'c2', type: 'itemContact', name: 'Doc'
      }]
    })
    await SR5ShopVendor.takeContact(actor, storage, actor.items.get('c2'), {
      replace: false
    })
    expect(updates).toHaveLength(0)
    expect(storage.system.shop.contactId).toBe('old')
  })

  it('refuses a player, anything but a contact, and a shop of another actor', async () => {
    const {
      actor, storage
    } = vendor()
    globalThis.game.user = {
      id: 'pl', isGM: false
    }
    expect(await SR5ShopVendor.takeContact(actor, storage, packContact())).toBeNull()
    globalThis.game.user = {
      id: 'gm', isGM: true
    }
    expect(await SR5ShopVendor.takeContact(actor, storage, {
      ...packContact(), type: 'itemWeapon'
    })).toBeNull()
    const other = vendor()
    expect(await SR5ShopVendor.takeContact(actor, other.storage, packContact())).toBeNull()
    expect(created).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it("fills an empty place when the gamemaster puts a contact on the vendor's sheet", async () => {
    const {
      actor, storage
    } = vendor({
      contacts: [{
        id: 'c1', type: 'itemContact', name: 'Doc'
      }]
    })
    SR5ShopVendor.onContactAdded(actor.items.get('c1'), {
    }, 'gm')
    await vi.waitFor(() => expect(storage.system.shop.contactId).toBe('c1'))
  })

  it("ignores a contact a player creates on the vendor, and the copy takeContact made itself", async () => {
    const {
      actor, storage
    } = vendor({
      contacts: [{
        id: 'c1', type: 'itemContact', name: 'Doc'
      }]
    })
    // The hook runs on every client: the gamemaster's sees a player's creation too
    SR5ShopVendor.onContactAdded(actor.items.get('c1'), {
    }, 'pl')
    // A player's own client never acts either
    globalThis.game.user = {
      id: 'pl', isGM: false
    }
    SR5ShopVendor.onContactAdded(actor.items.get('c1'), {
    }, 'pl')
    globalThis.game.user = {
      id: 'gm', isGM: true
    }
    SR5ShopVendor.onContactAdded(actor.items.get('c1'), {
      sr5ShopContact: true
    }, 'gm')
    await new Promise(r => setTimeout(r, 0))
    expect(updates).toHaveLength(0)
    expect(storage.system.shop.contactId).toBe('')
  })
})
