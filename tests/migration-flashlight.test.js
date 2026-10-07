import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.hoisted(() => {
  globalThis.foundry.utils.isEmpty = (obj) => !obj || Object.keys(obj).length === 0
})

import Migration from '../modules/migration.js'

// The standard flashlight is recognised by its specialEffect only (Run & Gun p. 69): the lamps created while the
// catalog entry had no effect get it once per world, on the item and on the copy a weapon keeps of it.

const lamp = (name = 'Lampe torche', specialEffect = '') => ({
  _id: 'lamp1', name, type: 'itemWeapon', system: {
    weaponAccessory: {
      type: 'accessory', specialEffect
    }
  }
})

function doc(data){
  const d = {
    ...data,
    update: vi.fn(async (u) => {
      for (const [path, value] of Object.entries(u)) foundry.utils.setProperty(d, path, value)
    }),
  }
  return d
}

let settings
function world({
  items = [], actors = []
} = {
}){
  settings = {
  }
  globalThis.game.settings = {
    get: (ns, key) => settings[key],
    set: vi.fn(async (ns, key, value) => {
      settings[key] = value
    }),
  }
  globalThis.game.items = {
    contents: items
  }
  globalThis.game.actors = {
    contents: actors
  }
  globalThis.game.scenes = {
    contents: []
  }
  globalThis.game.packs = []
}

beforeEach(() => {
  globalThis.game.i18n = {
    localize: k => (k === 'SR5.AccessoryFlashLight' ? 'Lampe torche' : k)
  }
})

describe('flashlight migration (specialEffect "flashLight")', () => {
  it('gives the effect to a standard flashlight that has none, and to no other accessory', () => {
    expect(Migration.migrateFlashlightData(lamp())).toEqual({
      'system.weaponAccessory.specialEffect': 'flashLight'
    })
    expect(Migration.migrateFlashlightData(lamp('Flash Light'))).toEqual({
      'system.weaponAccessory.specialEffect': 'flashLight'
    })
    expect(Migration.migrateFlashlightData(lamp('Lampe torche (vision nocturne)', 'flashLightLowLight'))).toEqual({
    })
    expect(Migration.migrateFlashlightData(lamp('Crosse pliable'))).toEqual({
    })
    // Already migrated: left alone
    expect(Migration.migrateFlashlightData(lamp('Lampe torche', 'flashLight'))).toEqual({
    })
  })

  it('fixes the copy a weapon keeps of a mounted lamp', () => {
    const weapon = {
      name: 'Ares Predator', type: 'itemWeapon', system: {
        weaponAccessory: {
          type: '', specialEffect: ''
        },
        accessory: [lamp(), {
          name: 'speedLoader'
        }],
      }
    }
    const update = Migration.migrateFlashlightData(weapon)
    expect(update['system.accessory'][0].system.weaponAccessory.specialEffect).toBe('flashLight')
    expect(update['system.accessory'][1]).toEqual({
      name: 'speedLoader'
    })
    // The weapon itself is not a flashlight
    expect(update['system.weaponAccessory.specialEffect']).toBeUndefined()
  })

  it('runs once per world, on world items and on the items of actors', async () => {
    const worldLamp = doc(lamp())
    const ownedLamp = doc(lamp())
    const actor = {
      name: 'Ork', items: {
        contents: [ownedLamp]
      }
    }
    world({
      items: [worldLamp], actors: [actor]
    })
    expect(await new Migration().migrateFlashlightEffect()).toBe(true)
    expect(worldLamp.system.weaponAccessory.specialEffect).toBe('flashLight')
    expect(ownedLamp.system.weaponAccessory.specialEffect).toBe('flashLight')
    expect(settings.migrationFlashlightEffect).toBe(true)
    ownedLamp.update.mockClear()
    ownedLamp.system.weaponAccessory.specialEffect = ''
    expect(await new Migration().migrateFlashlightEffect()).toBe(true)
    expect(ownedLamp.update).not.toHaveBeenCalled()
  })

  it('leaves the flag unset after a failure, so the next load retries', async () => {
    const worldLamp = doc(lamp())
    worldLamp.update.mockRejectedValueOnce(new Error('offline'))
    world({
      items: [worldLamp]
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await new Migration().migrateFlashlightEffect()).toBe(false)
    expect(settings.migrationFlashlightEffect).toBeUndefined()
    expect(await new Migration().migrateFlashlightEffect()).toBe(true)
    expect(worldLamp.system.weaponAccessory.specialEffect).toBe('flashLight')
  })
})
