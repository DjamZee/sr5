import {
  describe, it, expect, afterEach, beforeAll
} from 'vitest'

// Foundry's actor sheet, which the storage sheet builds on
globalThis.foundry.applications.sheets ??= {
  ActorSheetV2: class {}
}

// The server answers later than a second click comes
const tick = () => new Promise(resolve => setTimeout(resolve, 5))

const stick = {
  id: 'stick', name: 'Créditube', toObject: () => ({
    _id: 'stick', name: 'Créditube', type: 'itemGear', system: {
      storedIn: '', isCredstick: true, funds: {
        value: 5000
      }
    }
  })
}

// A bag on the map, holding a credstick
const bagOnTheMap = () => {
  const held = new Map([['stick', stick]])
  return {
    id: 'bag', type: 'actorStorage', name: 'Sac',
    items: {
      get: id => held.get(id),
      [Symbol.iterator]: () => held.values(),
    },
    deleteEmbeddedDocuments: async (_type, ids) => {
      await tick()
      for (const id of ids) {
        if (!held.has(id)) throw new Error(`Item ${id} does not exist!`)
      }
      const gone = ids.map(id => held.get(id))
      ids.forEach(id => held.delete(id))
      return gone
    },
  }
}

const runner = () => {
  const actor = {
    id: 'runner', type: 'actorPc', name: 'B', isOwner: true, received: [],
    createEmbeddedDocuments: async (_type, docs) => {
      await tick()
      actor.received.push(...docs)
    },
  }
  return actor
}

// The storage sheet pulls in most of the system: loaded once, outside the test's own time limit,
// since under the full parallel suite this first import alone can pass the 5 s a test is given.
let SR5StorageSheet
beforeAll(async () => {
  ({
    SR5StorageSheet
  } = await import('../modules/entities/actors/storageSheet.js'))
}, 60000)

const click = itemId => ({
  preventDefault: () => {}, currentTarget: {
    dataset: {
      itemId
    }
  }
})

describe('taking from a storage put down (SR5 p. 445: whoever holds a certified credstick holds its money)', () => {
  afterEach(() => {
    delete globalThis.canvas.tokens
  })

  it('hands an item over once on a double click', async () => {
    const bag = bagOnTheMap()
    const taker = runner()
    globalThis.canvas.tokens = {
      controlled: [{
        actor: taker
      }], placeables: []
    }
    const sheet = Object.create(SR5StorageSheet.prototype)
    Object.defineProperty(sheet, 'actor', {
      value: bag
    })

    await Promise.allSettled([sheet._onStorageLoot(click('stick')), sheet._onStorageLoot(click('stick'))])

    expect(taker.received.map(i => i.name)).toEqual(['Créditube'])
    expect(bag.items.get('stick')).toBeUndefined()
  })
})
