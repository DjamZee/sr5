import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

// A worn jacket put away in a bag: its source says worn, and the character's
// preparation holds it inactive while it is stored
const jacket = {
  id: 'jacket', _id: 'jacket', type: 'itemArmor', system: {
    storedIn: 'bagItem', isActive: false, wirelessTurnedOn: false
  },
  toObject(source = true) {
    return {
      _id: 'jacket', name: 'Veste', type: 'itemArmor', system: {
        storedIn: 'bagItem', isActive: !source ? false : true, wirelessTurnedOn: !source ? false : true
      }
    }
  },
}

const bagItem = {
  _id: 'bagItem', type: 'itemStorage', name: 'Sac', img: 'bag.svg', system: {
    type: 'bag', capacity: {
      value: 10
    }, description: ''
  },
}

describe('a storage put down on the map (SR5 p. 170: worn armour protects whoever wears it)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.Actor.createDocuments = undefined
  })

  it('carries what is inside it as it is, not as the character held it while stored', async () => {
    const owner = {
      id: 'ownerId', name: 'A',
      items: [jacket],
      getEmbeddedDocument: () => ({
        update: async () => {}
      }),
      deleteEmbeddedDocuments: async () => {},
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(owner)
    let created
    globalThis.Actor.createDocuments = async ([data]) => {
      created = data
      return [{
        id: 'bagActor'
      }]
    }

    await SR5_ActorHelper.createSidekick(bagItem, null, 'ownerId')

    expect(created.items).toHaveLength(1)
    expect(created.items[0].system.isActive).toBe(true)
    expect(created.items[0].system.wirelessTurnedOn).toBe(true)
  })
})
