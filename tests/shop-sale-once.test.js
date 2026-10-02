import {
  describe, it, expect, afterEach
} from 'vitest'
import {
  SR5ShopFence
} from '../modules/interface/shop-fence.js'

// The server answers later than a second click comes
const tick = () => new Promise(resolve => setTimeout(resolve, 5))

const seller = (...items) => {
  const owned = new Map(items.map(item => [item.id, item]))
  const actor = {
    id: 'sellerId', name: 'A', isOwner: true, paid: [],
    items: {
      get: id => owned.get(id)
    },
    deleteEmbeddedDocuments: async (_type, ids) => {
      await tick()
      for (const id of ids) {
        if (!owned.has(id)) throw new Error(`Item ${id} does not exist!`)
      }
      const gone = ids.map(id => owned.get(id))
      ids.forEach(id => owned.delete(id))
      return gone
    },
    updateEmbeddedDocuments: async (_type, changes) => {
      await tick()
      return changes.map(change => {
        const item = owned.get(change._id)
        item.system.quantity = change['system.quantity']
        return item
      })
    },
    createEmbeddedDocuments: async (_type, docs) => {
      await tick()
      actor.paid.push(...docs.map(doc => doc.system.amount))
    },
  }
  return actor
}

const item = (id, quantity) => ({
  id, system: quantity === undefined ? {
  } : {
    quantity
  }
})

// A sale card, as a contact's offer leaves it in the chat
const saleCard = (lines) => {
  const message = {
    id: `card${Math.random()}`,
    content: '<footer class="sr-shop-card-footer"><button data-fence-action="sell"></button></footer>',
    flags: {
      sr5fence: {
        buyerId: 'sellerId',
        results: lines,
        total: lines.reduce((sum, line) => sum + line.total, 0),
      }
    },
    getFlag: (scope, key) => message.flags[scope]?.[key],
    update: async changes => {
      await tick()
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'content') message.content = value
        else foundry.utils.setProperty(message, key, value)
      }
    },
  }
  return message
}

// The card's button, with what a click on it runs
const wire = message => {
  const button = {
    disabled: false,
    listeners: [],
    addEventListener(_type, fn) {
      this.listeners.push(fn)
    },
  }
  SR5ShopFence.chatListeners({
    querySelectorAll: () => [button]
  }, message)
  const click = () => button.listeners[0]?.({
    preventDefault: () => {}
  })
  return {
    button, click
  }
}

const line = (itemId, total, quantity = 1) => ({
  itemId, name: itemId, quantity, total
})

describe('cashing a sale (SR5 p. 421: the fence pays for the goods it takes)', () => {
  afterEach(() => {
    delete globalThis.game.actors
    delete globalThis.game.user
  })

  const sellerOf = actor => {
    globalThis.game.actors = {
      get: () => actor
    }
    globalThis.game.user = {
      id: 'userId'
    }
  }

  it('pays once on a double click', async () => {
    const actor = seller(item('jacket'))
    sellerOf(actor)
    const {
      click 
    } = wire(saleCard([line('jacket', 150)]))

    await Promise.all([click(), click()])

    expect(actor.paid).toEqual([150])
    expect(actor.items.get('jacket')).toBeUndefined()
  })

  it('pays nothing when the item has gone since the card was dealt', async () => {
    const actor = seller()
    sellerOf(actor)
    const {
      click 
    } = wire(saleCard([line('medkit', 38)]))

    await click()

    expect(actor.paid).toEqual([])
  })

  it('pays only for the lines whose goods did leave the sheet', async () => {
    const actor = seller(item('jacket'), item('ammo', 3))
    sellerOf(actor)
    // Ten rounds were offered, three are left: that line is not sold
    const {
      click 
    } = wire(saleCard([line('jacket', 150), line('ammo', 40, 10)]))

    await click()

    expect(actor.paid).toEqual([150])
    expect(actor.items.get('ammo').system.quantity).toBe(3)
  })

  it('takes only the quantity sold, and pays for it', async () => {
    const actor = seller(item('ammo', 30))
    sellerOf(actor)
    const {
      click 
    } = wire(saleCard([line('ammo', 40, 10)]))

    await click()

    expect(actor.paid).toEqual([40])
    expect(actor.items.get('ammo').system.quantity).toBe(20)
  })

  it('cannot be cashed again once the card is redrawn', async () => {
    const actor = seller(item('jacket'))
    sellerOf(actor)
    const message = saleCard([line('jacket', 150)])
    await wire(message).click()

    const again = wire(message)
    await again.click()

    expect(again.button.disabled).toBe(true)
    expect(actor.paid).toEqual([150])
  })
})
