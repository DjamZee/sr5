import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// The server answers later than the other browser's click comes
const tick = () => new Promise(resolve => setTimeout(resolve, 5))

const gm = {
  id: 'gm', isGM: true
}
const player = {
  id: 'player', isGM: false
}

// Who is at the keyboard of the browser running now
const at = user => {
  globalThis.game.user = user
}

const seller = (...items) => {
  const owned = new Map(items.map(item => [item.id, item]))
  const actor = {
    id: 'sellerId', name: 'B', isOwner: true, paid: [],
    items: {
      get: id => owned.get(id)
    },
    testUserPermission: user => user.isGM || user.id === player.id,
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

// A sale card, and the server's rule that only its author or a game master
// may write on it
const saleCard = (author, lines) => {
  const message = {
    id: 'card',
    author,
    content: '<footer class="sr-shop-card-footer"><button data-fence-action="sell"></button></footer>',
    flags: {
      sr5fence: {
        buyerId: 'sellerId', results: lines,
        total: lines.reduce((sum, line) => sum + line.total, 0),
      }
    },
    getFlag: (scope, key) => message.flags[scope]?.[key],
    canUserModify: user => user.isGM || user.id === author.id,
    update: async changes => {
      if (!message.canUserModify(game.user)) {
        throw new Error(`User ${game.user.id} lacks permission to update ChatMessage`)
      }
      await tick()
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'content') message.content = value
        else foundry.utils.setProperty(message, key, value)
      }
    },
  }
  return message
}

// One browser: its own copy of the system's code, as each client loads it
async function browser() {
  vi.resetModules()
  const {
    SR5ShopFence
  } = await import('../modules/interface/shop-fence.js')
  return SR5ShopFence
}

const clickOn = (fence, message) => {
  const button = {
    disabled: false, listeners: [],
    addEventListener(_type, fn) {
      this.listeners.push(fn)
    },
  }
  fence.chatListeners({
    querySelectorAll: () => [button]
  }, message)
  return button.listeners[0]?.({
    preventDefault: () => {}
  })
}

const sent = []
const world = (actor, message) => {
  globalThis.game.actors = {
    get: () => actor
  }
  globalThis.game.messages = {
    get: () => message
  }
  globalThis.game.users = {
    get: id => [gm, player].find(user => user.id === id),
    get activeGM() {
      return {
        ...gm, isSelf: game.user.id === gm.id
      }
    },
  }
  globalThis.game.socket = {
    emit: async (_channel, payload) => {
      sent.push(payload)
    }
  }
}

describe('cashing a sale through the designated game master (SR5 p. 421: the fence pays for the goods it takes)', () => {
  afterEach(() => {
    sent.length = 0
    for (const key of ['actors', 'messages', 'users', 'socket', 'user']) delete globalThis.game[key]
  })

  it('lets a player cash a card the game master posted', async () => {
    const actor = seller({
      id: 'vest', system: {
      }
    })
    const message = saleCard(gm, [{
      itemId: 'vest', name: 'Gilet', quantity: 1, total: 200
    }])
    world(actor, message)
    const playerBrowser = await browser()
    const gmBrowser = await browser()

    at(player)
    await clickOn(playerBrowser, message)
    at(gm)
    // The server stamps the sender: here, the player's browser
    for (const request of sent) await gmBrowser.socketCash(request, player.id)

    expect(actor.paid).toEqual([200])
    expect(actor.items.get('vest')).toBeUndefined()
  })

  it('pays a part of a stack once when a player and the game master cash it together', async () => {
    const actor = seller({
      id: 'grenades', system: {
        quantity: 5
      }
    })
    const message = saleCard(player, [{
      itemId: 'grenades', name: 'Grenade', quantity: 1, total: 20
    }])
    world(actor, message)
    const playerBrowser = await browser()
    const gmBrowser = await browser()

    // Both click before either browser has heard of the other's click
    at(player)
    const fromPlayer = clickOn(playerBrowser, message)
    at(gm)
    const fromGm = clickOn(gmBrowser, message)
    await Promise.allSettled([fromPlayer, fromGm])
    // The server stamps the sender: here, the player's browser
    for (const request of sent) await gmBrowser.socketCash(request, player.id)

    expect(actor.paid).toEqual([20])
    expect(actor.items.get('grenades').system.quantity).toBe(4)
  })

  it('cashes nothing for a player who does not own the seller', async () => {
    const actor = seller({
      id: 'vest', system: {
      }
    })
    actor.testUserPermission = user => user.isGM
    const message = saleCard(gm, [{
      itemId: 'vest', name: 'Gilet', quantity: 1, total: 200
    }])
    world(actor, message)
    const gmBrowser = await browser()

    at(gm)
    await gmBrowser.socketCash({
      data: {
        messageId: 'card', actorId: 'sellerId'
      }
    }, player.id)

    expect(actor.paid).toEqual([])
    expect(actor.items.get('vest')).toBeDefined()
  })

  it('believes the sender the server stamps, not a requester written in the message', async () => {
    const actor = seller({
      id: 'vest', system: {
      }
    })
    const message = saleCard(gm, [{
      itemId: 'vest', name: 'Gilet', quantity: 1, total: 200
    }])
    world(actor, message)
    const gmBrowser = await browser()

    at(gm)
    // A stranger, who does not own the seller, writes the owner's id in the request
    await gmBrowser.socketCash({
      data: {
        messageId: 'card', actorId: 'sellerId', requesterId: player.id
      }
    }, 'stranger')
    // ...or sends nothing the server could vouch for
    await gmBrowser.socketCash({
      data: {
        messageId: 'card', actorId: 'sellerId', requesterId: player.id
      }
    })

    expect(actor.paid).toEqual([])
    expect(actor.items.get('vest')).toBeDefined()
  })
})
