import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// E4 (DjamZ's ruling, 2026-10-06, SR5 p. 231): switching off the device a character in VR is connected
// through, or equipping another one, throws them out of the Matrix with dumpshock. The wireless of a spare
// device is no exit: it must leave the active device on (Lars's review, measured in game).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  ActorSheetSR5
} = await import('../modules/entities/actors/baseSheet.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')

const device = (id, name, isActive) => ({
  _id: id, id, name, type: 'itemDevice',
  system: {
    isActive, wirelessTurnedOn: true, pan: {
      content: []
    }
  },
})

function actorIn(userMode) {
  const pool = () => ({
    base: 0
  })
  const action = () => ({
    value: 2, current: 2
  })
  return {
    id: 'pc', name: 'Hackeuse', type: 'actorPc', isToken: false, effects: [],
    items: [device('deck', 'Little Hornet', true), device('spare', 'Evotech Himitsu', false)],
    system: {
      matrix: {
        userMode, attributes: {
          attack: pool(), sleaze: pool(), dataProcessing: pool(), firewall: pool()
        }, attributesCollection: {
        }
      },
      specialProperties: {
        actions: {
          free: action(), simple: action(), complex: action()
        }
      },
    },
    update: vi.fn(async () => {}),
    rollTest: vi.fn(),
  }
}

async function click(actor, itemId, binding) {
  const sheet = Object.create(ActorSheetSR5.prototype)
  Object.defineProperty(sheet, 'actor', {
    value: actor
  })
  await sheet._onEditItemValue({
    currentTarget: {
      closest: () => ({
        dataset: {
          itemId
        }
      }),
      dataset: {
        binding, dtype: 'Boolean'
      },
    },
    target: {
      value: ''
    },
  })
  const items = actor.update.mock.calls.at(-1)?.[0].items ?? []
  const dumpshocks = actor.rollTest.mock.calls.filter(c => c[0] === 'resistanceCard' && c[2]?.damage?.resistanceType === 'dumpshock').length
  return {
    deckOn: items.find(i => i._id === 'deck')?.system.isActive, dumpshocks
  }
}

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  game.settings = {
    get: () => false
  }
  game.combat = null
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    damage: {
    }
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('device switches on the sheet and dumpshock (SR5 p. 231)', () => {
  it('the wireless of a spare device leaves the active deck on, and deals no dumpshock in VR', async () => {
    expect(await click(actorIn('hotsim'), 'spare', 'system.wirelessTurnedOn')).toEqual({
      deckOn: true, dumpshocks: 0
    })
  })

  // SR5 p. 229, DjamZ's ruling of 03/10: the deck keeps its configuration (Lars's measure: Firewall 3 -> 0)
  it('the wireless of a spare device keeps the configuration of the active deck', async () => {
    const actor = actorIn('ar')
    actor.system.matrix.attributes.firewall.base = 3
    actor.system.matrix.attributesCollection = {
      value4: 3, value4isSet: true
    }
    await click(actor, 'spare', 'system.wirelessTurnedOn')
    const matrix = actor.update.mock.calls.at(-1)[0].system.matrix
    expect(matrix.attributes.firewall.base).toBe(3)
    expect(matrix.attributesCollection).toEqual({
      value4: 3, value4isSet: true
    })
  })

  it('equipping another device still clears the configuration for it', async () => {
    const actor = actorIn('ar')
    actor.system.matrix.attributes.firewall.base = 3
    await click(actor, 'spare', 'system.isActive')
    expect(actor.update.mock.calls.at(-1)[0].system.matrix.attributes.firewall.base).toBe(0)
  })

  it('the wireless of the active deck deals no dumpshock either (a deck may be wired)', async () => {
    expect((await click(actorIn('hotsim'), 'deck', 'system.wirelessTurnedOn')).dumpshocks).toBe(0)
  })

  it('equipping another device in VR switches the deck off with one dumpshock', async () => {
    expect(await click(actorIn('hotsim'), 'spare', 'system.isActive')).toEqual({
      deckOn: false, dumpshocks: 1
    })
  })

  it('switching the deck off in cold sim deals one dumpshock, none in AR', async () => {
    expect((await click(actorIn('coldsim'), 'deck', 'system.isActive')).dumpshocks).toBe(1)
    expect((await click(actorIn('ar'), 'deck', 'system.isActive')).dumpshocks).toBe(0)
  })
})
