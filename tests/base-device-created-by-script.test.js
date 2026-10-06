import {
  describe, it, expect, vi
} from 'vitest'

// An IC created by script with an empty item list (Actor.create({..., items: []})) skipped the
// creation dialog that adds its base device: no matrix was computed and it attacked with 0 dice.
// _preCreate now adds the base device to any device, drone or agent that has none.

vi.mock('../modules/system/effectsList.js', () => ({
  _getSRStatusEffect: vi.fn(async status => ({
    name: status, statuses: [status]
  })),
}))

const {
  missingBaseDevice
} = await import('../modules/entities/actors/base-device.js')
const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')

// Foundry's own Actor._preCreate is not there under test
Object.getPrototypeOf(SR5Actor.prototype)._preCreate ??= async () => {}
globalThis.CONST ??= {
  TOKEN_DISPLAY_MODES: {
    OWNER: 30
  }
}
globalThis.CONFIG.ActiveEffect ??= {
}
globalThis.CONFIG.ActiveEffect.documentClass ??= class {
  constructor(data) {
    this.data = data
  }

  toObject() {
    return {
      ...this.data
    }
  }
}

describe('base device of an actor created by script', () => {
  it('is added to a device, a drone or an agent without one', () => {
    for (const type of ['actorDevice', 'actorDrone', 'actorAgent']) {
      expect(missingBaseDevice(type, [])).toMatchObject({
        type: 'itemDevice', system: {
          isActive: true, type: 'baseDevice'
        }
      })
    }
  })

  it('goes into the source through _preCreate, with the matrix initiative, once', async () => {
    const created = async (type, items = [], effects = []) => {
      const actor = Object.create(SR5Actor.prototype)
      Object.assign(actor, {
        type, name: 'CI', system: {
        }, img: 'ice.svg'
      })
      actor._source = {
        items, effects
      }
      actor.updateSource = data => {
        for (const [key, value] of Object.entries(data)) {
          if (key === 'items' || key === 'effects') actor._source[key] = value
        }
      }
      await actor._preCreate({
      }, {
      }, {
      })
      return actor._source
    }
    const ice = await created('actorDevice')
    expect(ice.items.map(i => `${i.type}:${i.system.type}`)).toEqual(['itemDevice:baseDevice'])
    expect(ice.effects.map(e => e.statuses)).toEqual([['matrixInit']])
    // Through the creation dialog: the device and the effect are already there
    const dialog = await created('actorDevice', [{
      type: 'itemDevice', system: {
        type: 'baseDevice'
      }
    }], [{
      statuses: ['matrixInit']
    }])
    expect(dialog.items).toHaveLength(1)
    expect(dialog.effects).toHaveLength(1)
    // Another actor is left alone
    expect((await created('actorSprite')).items).toEqual([])
  })

  it('is not added twice, nor to other actors', () => {
    expect(missingBaseDevice('actorDevice', [{
      type: 'itemDevice'
    }])).toBeNull()
    expect(missingBaseDevice('actorPc', [])).toBeNull()
    expect(missingBaseDevice('actorSprite', [])).toBeNull()
  })
})
