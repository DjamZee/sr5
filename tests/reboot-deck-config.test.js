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
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

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
 * An actor's system as Foundry gives it: deviceName and markedItems are prepared from the
 * active device, while a copy (foundry.utils.duplicate, through DataModel#toJSON) only
 * holds the source, where both are empty.
 */
function preparedSystem(activeDeck) {
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
        value1isSet: true, value2isSet: true, value3isSet: true, value4isSet: true
      },
      overwatchScore: 7,
      markedItems: [],
      marks: [],
      deviceName: '',
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
    get: () => activeDeck.system.markedItems, enumerable: true
  })
  system.matrix.deviceName = activeDeck.name
  Object.defineProperty(system, 'toJSON', {
    value: source
  })
  return system
}

let hacker, activeDeck, spareDeck, pc, commlink, server, serverFile
beforeEach(() => {
  vi.clearAllMocks()
  game.user = {
    isGM: true, id: 'gm'
  }
  game.combat = null
  commlink = documentWith({
    type: 'itemDevice', uuid: 'Actor.pc.Item.c', name: 'Commlink', system: {
      isActive: true, marks: [{
        ownerId: 'hacker', value: 2
      }, {
        ownerId: 'other', value: 1
      }]
    }
  })
  pc = documentWith({
    id: 'pc', name: 'PJ', type: 'actorPc', items: [commlink], system: {
      matrix: {
        marks: [], deviceType: 'commlink'
      }
    }
  })
  commlink.parent = pc
  serverFile = documentWith({
    type: 'itemDevice', uuid: 'Actor.srv.Item.f', name: 'Fichier', system: {
      marks: [{
        ownerId: 'hacker', value: 1
      }]
    }
  })
  server = documentWith({
    id: 'srv', name: 'Serveur', type: 'actorDevice', items: [serverFile], system: {
      matrix: {
        marks: [], deviceType: 'device'
      }
    }
  })
  serverFile.parent = server
  // The active deck marked the server file, the spare deck marked the PC commlink before being put away
  activeDeck = documentWith({
    _id: 'deck', type: 'itemDevice', name: 'Hermes Chariot', system: {
      isActive: true, markedItems: [{
        uuid: serverFile.uuid
      }], marks: []
    }
  })
  spareDeck = documentWith({
    _id: 'spare', type: 'itemDevice', name: 'Erika MCD-6', system: {
      isActive: false, markedItems: [{
        uuid: commlink.uuid
      }], marks: []
    }
  })
  hacker = Object.create(SR5Actor.prototype)
  Object.assign(hacker, {
    id: 'hacker', name: 'Hackeuse', type: 'actorPc', isToken: false, items: [activeDeck, spareDeck],
    system: preparedSystem(activeDeck),
    deleteEmbeddedDocuments: vi.fn(),
  })
  // The sheet's update writes the decks back from the copy of the items
  hacker.update = vi.fn(async changes => {
    for (const deck of [activeDeck, spareDeck]) deck.system.markedItems = changes.items.find(i => i._id === deck._id).system.markedItems
  })
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => ({
    hacker, pc, srv: server
  })[id])
  globalThis.fromUuid = vi.fn(async uuid => ({
    [commlink.uuid]: commlink, [serverFile.uuid]: serverFile
  })[uuid] ?? null)
  vi.spyOn(ui.notifications, 'info').mockImplementation(() => {})
})

describe('Rebooting a deck (SR5 p. 244)', () => {
  it('names the rebooted device in the notification', async () => {
    await hacker.rebootDeck()
    expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringMatching(/^Hermes Chariot \S/))
  })

  it('wipes the marks traced on an inactive deck along with the trace', async () => {
    await hacker.rebootDeck()
    expect(spareDeck.system.markedItems).toEqual([])
    expect(commlink.system.marks).toEqual([{
      ownerId: 'other', value: 1
    }])
  })

  it('still wipes the marks of the active deck', async () => {
    await hacker.rebootDeck()
    expect(activeDeck.system.markedItems).toEqual([])
    expect(serverFile.system.marks).toEqual([])
  })

  it('sends the traces of every deck to the GM when a player reboots', async () => {
    game.user = {
      isGM: false, id: 'player'
    }
    await hacker.rebootDeck()
    const call = SR5_SocketHandler.emitForGM.mock.calls.find(c => c[0] === 'deleteMarksOnActor')
    expect(call[1].actorData.matrix.markedItems.map(m => m.uuid)).toEqual([serverFile.uuid, commlink.uuid])
  })

  it('keeps the deck configuration and resets only the Overwatch Score (SR5 p. 229, p. 244)', async () => {
    await hacker.rebootDeck()
    const matrix = hacker.update.mock.calls[0][0].system.matrix
    expect(matrix.overwatchScore).toBe(0)
    expect([matrix.attributes.attack.base, matrix.attributes.sleaze.base, matrix.attributes.dataProcessing.base, matrix.attributes.firewall.base]).toEqual([2, 5, 3, 4])
    expect(matrix.attributesCollection).toEqual({
      value1isSet: true, value2isSet: true, value3isSet: true, value4isSet: true
    })
  })

  it('spends one complex action', async () => {
    await hacker.rebootDeck()
    expect(hacker.update.mock.calls[0][0].system.specialProperties.actions.complex.current).toBe(0)
  })
})
