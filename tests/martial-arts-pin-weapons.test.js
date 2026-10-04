import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  canPin, _buildCalledShotList
} = await import('../modules/rolls/roll-prepare-case/rollData-Weapon.js')

const calledShots = (weaponType, ammo) => {
  globalThis.game.i18n = {
    localize: k => k, format: k => k
  }
  const rollData = {
    test: {
      typeSub: "rangedWeapon"
    },
    combat: {
      weaponType, ammo, calledShot: {
        martialArts: {
        }
      }
    },
    lists: {
    },
  }
  _buildCalledShotList(rollData)
  return rollData.lists.calledShots
}

// N94: Run & Gun p. 125, Pin is for "armes de jet et de trait" only, whatever the ammo
describe('Pin called shot', () => {
  it('is offered with a throwing weapon, a bow or a crossbow', () => {
    expect(canPin("throwing")).toBe(true)
    expect(canPin("bow")).toBe(true)
    expect(canPin("heavyCrossbow")).toBe(true)
  })
  it('is refused to firearms and melee weapons', () => {
    expect(canPin("heavyPistol")).toBe(false)
    expect(canPin("blades")).toBe(false)
  })

  it('is listed for a thrown weapon without the technique', () => {
    expect(calledShots("throwing", {
      type: ""
    }).pin).toBeDefined()
  })
  it('is listed for custom ammo tagged "pin" on a bow, without the technique', () => {
    expect(calledShots("bow", {
      type: "custom", effects: {
        calledShotTags: ["pin"]
      }
    }).pin).toBeDefined()
  })
  it('is never listed for a firearm, even with "special" or "pin" tagged ammo', () => {
    expect(calledShots("heavyPistol", {
      type: "special"
    }).pin).toBeUndefined()
    expect(calledShots("heavyPistol", {
      type: "custom", effects: {
        calledShotTags: ["pin"]
      }
    }).pin).toBeUndefined()
  })
})
