import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// A player who does not own the actor relays the item update to the GM through the updateItem socket,
// which writes its info under `system`. updateItemAfterRoll used to send the whole document: the GM then
// wrote system.type = "itemWeapon" and the grenade launcher lost its 3D6 scatter. Only the system fields
// the roll changed may travel, and the relay writes only what differs from the stored item.
const emitted = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: (type, data) => emitted.push({
      type, data
    }),
  },
}))

// Foundry's diffObject: the keys of `other` whose value differs from `original`, recursively
const diffObject = (original, other) => Object.entries(other).reduce((acc, [k, v]) => {
  const o = original?.[k]
  if (v && typeof v === 'object' && !Array.isArray(v) && o && typeof o === 'object') {
    const d = diffObject(o, v)
    if (Object.keys(d).length) acc[k] = d
  } else if (JSON.stringify(o) !== JSON.stringify(v)) acc[k] = v
  return acc
}, {
})
foundry.utils.diffObject = diffObject
foundry.utils.isEmpty = (o) => !o || Object.keys(o).length === 0

const {
  SR5_RollTestHelper
} = await import('../modules/rolls/roll-test-helper.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

const launcher = () => {
  const source = {
    _id: 'lg', name: 'ArmTech MGL-12', type: 'itemWeapon',
    system: {
      category: 'rangedWeapon', type: 'grenadeLauncher',
      ammunition: {
        value: 12, max: 12, type: ''
      },
      firingMode: {
        current: 'SA'
      },
      choke: {
        current: ''
      },
    },
  }
  const item = {
    uuid: 'Actor.a.Item.lg', type: 'itemWeapon',
    system: structuredClone(source.system),
    toObject: () => structuredClone(source),
    toJSON: () => structuredClone(source),
    update: vi.fn(async (data) => {
      for (const [k, v] of Object.entries(data.system)) {
        source.system[k] = typeof v === 'object' ? Object.assign(source.system[k], v) : v
      }
    }),
    source,
  }
  return item
}
const card = () => ({
  owner: {
    itemUuid: 'Actor.a.Item.lg', actorId: 'a'
  },
  combat: {
    ammo: {
      fired: 1
    }, firingMode: {
      selected: 'SA'
    }, choke: {
      selected: ''
    }
  },
})

beforeEach(() => {
  emitted.length = 0
})

describe('item update after a roll', () => {
  it('sends a player\'s change as system fields only, never the whole document', async () => {
    const item = launcher()
    globalThis.fromUuid = async () => item
    game.user = {
      isGM: false, character: null
    }
    await SR5_RollTestHelper.updateItemAfterRoll(card())
    expect(emitted).toHaveLength(1)
    expect(emitted[0].data.info).toEqual({
      ammunition: {
        value: 11
      }
    })

    // the GM side of the relay: the sender owns the launcher (socket-guard.js)
    item.testUserPermission = () => true
    game.users = {
      get: () => ({
        id: 'p', isGM: false
      })
    }
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: emitted[0].data
    }, 'p')
    expect(item.source.system.type).toBe('grenadeLauncher')
    expect(item.source.system.ammunition.value).toBe(11)
  })

  it('writes only the changed fields when the GM rolls', async () => {
    const item = launcher()
    globalThis.fromUuid = async () => item
    game.user = {
      isGM: true
    }
    await SR5_RollTestHelper.updateItemAfterRoll(card())
    expect(item.update).toHaveBeenCalledWith({
      system: {
        ammunition: {
          value: 11
        }
      }
    })
  })

  it('lets the relay ignore what a caller resent unchanged', async () => {
    const item = launcher()
    globalThis.fromUuid = async () => item
    game.users = {
      get: () => ({
        id: 'gm', isGM: true
      })
    }
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: item.uuid, info: {
          ...structuredClone(item.source.system), firingMode: {
            current: 'BF'
          }
        }
      }
    }, 'gm')
    expect(item.update).toHaveBeenCalledWith({
      system: {
        firingMode: {
          current: 'BF'
        }
      }
    })
  })
})
