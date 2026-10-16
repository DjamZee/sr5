import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// S0 (ticket 4 d'Adrore): a generic host posed as an unlinked token, one instance per scene. Each instance is a host of
// its own: its marks and its slaves are never shared with the other instances of the same world actor

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}

const {
  SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  panMasterKeysOf, decorSlavesOf
} = await import('../modules/canvas/pan-crown/pan-graph.js')

function documentWith(data) {
  const doc = {
    ...data,
    update: vi.fn(async changes => {
      for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(doc, path, value)
    }),
  }
  return doc
}

/** One instance of the generic host "h": an unlinked token's actor shares the world actor's id */
function hostInstance(scene, token) {
  const uuid = token ? `Scene.${scene}.Token.${token}.Actor.h` : 'Actor.h'
  const device = documentWith({
    id: 'd', type: 'itemDevice', name: 'Serveur', uuid: `${uuid}.Item.d`, system: {
      isActive: true, marks: [], markedItems: []
    }
  })
  const actor = {
    id: 'h', uuid, name: 'Serveur générique', type: 'actorDevice', isToken: !!token, token: token ? {
      id: token
    } : null,
    items: [device], system: {
      matrix: {
        deviceType: 'host'
      }
    },
  }
  device.parent = actor
  return actor
}

const camera = (id, panMaster, isToken = true) => ({
  id, uuid: `Scene.s.Token.${id}.Actor.cam`, isToken, type: 'actorDevice', items: [], system: {
    matrix: {
      deviceType: 'device', panMaster
    }
  }
})

describe('what an instance of a host answers to', () => {
  it('a world host answers to its uuid in both spellings', () => {
    const world = hostInstance()
    expect(panMasterKeysOf(world, world.items[0])).toEqual(['Actor.h', 'Actor.h', 'Actor.h.Item.d', 'Actor.h.Item.d'])
  })
  it('an unlinked instance answers to its own uuids only, never to the world actor', () => {
    const a = hostInstance('s1', 't1')
    expect(panMasterKeysOf(a, a.items[0])).toEqual(['Scene.s1.Token.t1.Actor.h', 'Scene.s1.Token.t1.Actor.h.Item.d'])
  })
})

describe('the slaves of two instances of one generic host', () => {
  beforeEach(() => {
    game.settings = {
      get: () => false
    }
  })
  it('each instance takes only the devices slaved to it', () => {
    const a = hostInstance('s1', 't1'), b = hostInstance('s2', 't2')
    const camA = camera('ca', a.uuid), camB = camera('cb', b.uuid), camWorld = camera('cw', 'Actor.h')
    const actors = [a, b, camA, camB, camWorld]
    expect(decorSlavesOf(a, a.items[0], actors)).toEqual([camA])
    expect(decorSlavesOf(b, b.items[0], actors)).toEqual([camB])
  })
})

describe('marking one instance of a generic host', () => {
  let a, b, hacker, deck, actors
  beforeEach(() => {
    vi.restoreAllMocks()
    SR5_SocketHandler.emitForGM.mockClear()
    game.user = {
      isGM: true, id: 'gm'
    }
    a = hostInstance('s1', 't1')
    b = hostInstance('s2', 't2')
    deck = documentWith({
      type: 'itemDevice', name: 'Deck', system: {
        isActive: true, markedItems: []
      }
    })
    hacker = {
      id: 'hacker', name: 'Hackeuse', items: [deck], system: {
        matrix: {
          deviceType: 'cyberdeck'
        }
      }
    }
    actors = {
      t1: a, t2: b, hacker
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
    globalThis.fromUuid = vi.fn(async uuid => [a, b].flatMap(x => x.items).find(i => i.uuid === uuid) ?? null)
  })
  it('puts the marks on the instance named by its token, and on no other', async () => {
    await SR5_MarkHelpers.markItem('t1', 'hacker', 2)
    expect(a.items[0].system.marks).toEqual([expect.objectContaining({
      ownerId: 'hacker', value: 2
    })])
    expect(b.items[0].system.marks).toEqual([])
    expect(b.items[0].update).not.toHaveBeenCalled()
    expect(deck.system.markedItems).toEqual([expect.objectContaining({
      uuid: a.items[0].uuid, value: 2
    })])
  })
  it('D4: an AI outside any device, as an unlinked token, is marked on its own persona, not on its base actor', async () => {
    const persona = (id) => documentWith({
      id: 'ai', uuid: `Scene.s.Token.${id}.Actor.ai`, name: 'IA', isToken: true, token: {
        id
      }, items: [], system: {
        activeSpecialAttribute: 'depth', matrix: {
          marks: []
        }
      }
    })
    const token = persona('tai'), base = persona('base')
    actors.tai = token
    actors.ai = base
    globalThis.fromUuid = vi.fn(async uuid => uuid === token.uuid ? token : null)
    await SR5_MarkHelpers.markItem('tai', 'hacker', 1)
    expect(token.system.matrix.marks).toEqual([expect.objectContaining({
      ownerId: 'hacker', value: 1
    })])
    expect(base.update).not.toHaveBeenCalled()
  })
  it('sends nothing to copy the marks onto other tokens', async () => {
    game.user = {
      isGM: false, id: 'p'
    }
    await SR5_MarkHelpers.markItem('t1', 'hacker', 1)
    expect(SR5_SocketHandler.emitForGM.mock.calls.map(c => c[0])).not.toContain('markSlavedDevice')
  })
})
