import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')
const {
  SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

/** A document whose update merges the flattened changes the way Foundry does */
function documentWith(data) {
  const doc = {
    ...data,
    update: vi.fn(async changes => {
      for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(doc, path, value)
    }),
  }
  Object.defineProperty(doc, '_source', {
    get: () => doc
  })
  return doc
}

/**
 * An actor's system as Foundry gives it: the prepared values are read on it, but a copy
 * (foundry.utils.duplicate, through DataModel#toJSON) only holds the source, where
 * matrix.markedItems is always empty; preparation copies it from the active device.
 */
function preparedSystem(deck) {
  const source = () => ({
    matrix: {
      attributes: {
        attack: {
          base: 2
        }, dataProcessing: {
          base: 3
        }, firewall: {
          base: 4
        }, sleaze: {
          base: 5
        }
      },
      attributesCollection: {
      },
      overwatchScore: 7,
      markedItems: [],
      marks: [],
      deviceName: 'Deck',
      deviceType: 'cyberdeck',
    },
    specialProperties: {
      actions: {
        complex: {
          current: 1
        }
      }
    },
  })
  const system = source()
  Object.defineProperty(system.matrix, 'markedItems', {
    get: () => deck.system.markedItems, enumerable: true
  })
  Object.defineProperty(system, 'toJSON', {
    value: source
  })
  return system
}

let hacker, deck, pc, commlink, ai, actors
beforeEach(() => {
  vi.clearAllMocks()
  game.user = {
    isGM: true, id: 'gm'
  }
  game.combat = null
  deck = documentWith({
    _id: 'deck', type: 'itemDevice', name: 'Deck', system: {
      isActive: true, markedItems: [], marks: []
    }
  })
  hacker = Object.create(SR5Actor.prototype)
  Object.assign(hacker, {
    id: 'hacker', name: 'Hackeuse', type: 'actorPc', isToken: false, items: [deck],
    system: preparedSystem(deck),
    deleteEmbeddedDocuments: vi.fn(),
  })
  // The sheet's update writes the deck back from the copy of the items
  hacker.update = vi.fn(async changes => {
    deck.system.markedItems = changes.items.find(i => i._id === 'deck').system.markedItems
  })
  commlink = documentWith({
    type: 'itemDevice', uuid: 'Actor.pc.Item.c', name: 'Commlink', system: {
      isActive: true, marks: []
    }
  })
  pc = documentWith({
    id: 'pc', name: 'PJ', type: 'actorPc', items: [commlink], system: {
      activeSpecialAttribute: 'magic', matrix: {
        marks: [], deviceType: 'commlink'
      }
    }
  })
  commlink.parent = pc
  ai = documentWith({
    id: 'ai', uuid: 'Actor.ai', name: 'IA', documentName: 'Actor', type: 'actorPc', items: [],
    system: {
      activeSpecialAttribute: 'depth', matrix: {
        marks: []
      }
    },
  })
  actors = {
    hacker, pc, ai
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
  globalThis.fromUuid = vi.fn(async uuid => ({
    [commlink.uuid]: commlink, [ai.uuid]: ai
  })[uuid] ?? null)
})

async function markBoth() {
  await SR5_MarkHelpers.markItem('pc', 'hacker', 1)
  await SR5_MarkHelpers.markItem('ai', 'hacker', 2)
  // Someone else's mark must survive the reboot
  ai.system.matrix.marks.push({
    ownerId: 'other', value: 1
  })
}

describe('Rebooting the hacker deck wipes the marks it had placed (SR5 p. 244)', () => {
  it('reads the marked items on the prepared data, not on the source copy', async () => {
    await markBoth()
    expect(hacker.system.matrix.markedItems).toHaveLength(2)
    expect(foundry.utils.duplicate(hacker.system).matrix.markedItems).toEqual([])
  })

  it('off a PC commlink and the persona of an AI, when the GM reboots', async () => {
    await markBoth()
    await hacker.rebootDeck()
    expect(commlink.system.marks).toEqual([])
    expect(ai.system.matrix.marks).toEqual([{
      ownerId: 'other', value: 1
    }])
    expect(deck.system.markedItems).toEqual([])
    const system = hacker.update.mock.calls[0][0].system
    expect(system.matrix.overwatchScore).toBe(0)
    // The deck keeps its configuration (SR5 p. 229)
    expect(system.matrix.attributes.sleaze.base).toBe(5)
  })

  it('through the GM, when the player who owns the hacker reboots', async () => {
    await markBoth()
    game.user = {
      isGM: false, id: 'player'
    }
    await hacker.rebootDeck()
    const call = SR5_SocketHandler.emitForGM.mock.calls.find(c => c[0] === 'deleteMarksOnActor')
    expect(call[1].actorId).toBe('hacker')
    expect(call[1].actorData.matrix.markedItems.map(m => m.uuid)).toEqual(['Actor.pc.Item.c', 'Actor.ai'])
    // The active GM's client runs what the socket carries, for the player who owns the hacker (security pass, Olympe)
    game.user = {
      isGM: true, id: 'gm'
    }
    game.users = {
      activeGM: game.user, get: id => ({
        id, isGM: id === 'gm'
      })
    }
    hacker.testUserPermission = user => user?.id === 'player'
    await SR5_ActorHelper._socketDeleteMarksOnActor({
      data: call[1]
    }, 'stranger')
    expect(commlink.system.marks).not.toEqual([])
    await SR5_ActorHelper._socketDeleteMarksOnActor({
      data: call[1]
    }, 'player')
    expect(commlink.system.marks).toEqual([])
    expect(ai.system.matrix.marks).toEqual([{
      ownerId: 'other', value: 1
    }])
  })

  it('sends nothing when the hacker had marked nothing', async () => {
    game.user = {
      isGM: false, id: 'player'
    }
    await hacker.rebootDeck()
    expect(SR5_SocketHandler.emitForGM.mock.calls.some(c => c[0] === 'deleteMarksOnActor')).toBe(false)
  })
})
