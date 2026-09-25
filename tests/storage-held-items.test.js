import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  SR5Item
} from '../modules/entities/items/entityItem.js'
import {
  SR5Actor
} from '../modules/entities/actors/entityActor.js'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'

// Foundry's own Item.prepareData is not there under test
Object.getPrototypeOf(SR5Item.prototype).prepareData ??= () => {}

const pool = (base = 0) => ({
  base, value: 0, dicePool: 0, modifiers: []
})

// Only what the weapon branch of prepareData reads for itself: the helpers
// that do not look at the holder are silenced below.
const weaponSystem = (category, type, skill, extra = {
}) => ({
  category, type,
  damageElement: 'physical',
  ammunition: {
    value: 0, max: 0
  },
  itemEffects: {
  },
  isLinkedToFocus: false,
  isUsedAsFocus: false,
  isLinkedToMount: false,
  weaponSkill: {
    ...pool(), category: skill, specialization: false
  },
  accuracy: {
    ...pool(5), isPhysicalLimitBased: false
  },
  damageValue: {
    ...pool(8), isStrengthBased: false
  },
  armorPenetration: pool(),
  recoilCompensation: pool(),
  firingMode: {
    value: []
  },
  choke: {
    value: []
  },
  conditionMonitors: {
    matrix: {
      value: 8, actual: {
        value: 0
      }
    }
  },
  ...extra,
})

const makeItem = (type, system, actor) => {
  const item = Object.create(SR5Item.prototype)
  Object.defineProperty(item, 'actor', {
    value: actor
  })
  Object.defineProperty(item, 'system', {
    value: system
  })
  Object.defineProperty(item, 'type', {
    value: type
  })
  return item
}

// A storage has no skills, attributes, limits nor initiatives: just its own fields
const storage = {
  type: 'actorStorage', system: {
    type: 'stash', capacity: {
      value: 10, used: 0
    }
  }
}
// A Matrix device has a matrix and monitors, but no skills either
const device = {
  type: 'actorDevice', system: {
    matrix: {
    }, conditionMonitors: {
    }
  }
}
const character = {
  type: 'actorPc',
  system: {
    skills: {
      pistols: {
        test: {
          modifiers: [{
            source: 'Pistolets', type: 'skillRating', value: 5
          }]
        }
      },
      blades: {
        test: {
          modifiers: [{
            source: 'Lames', type: 'skillRating', value: 4
          }]
        }
      },
    },
    attributes: {
      strength: {
        augmented: {
          value: 4
        }
      }
    },
    limits: {
      physicalLimit: {
        value: 6
      }
    },
    initiatives: {
      astralInit: {
        isActive: false
      }
    },
    visions: {
      astral: {
        isActive: false
      }
    },
  },
}

const pistol = () => weaponSystem('rangedWeapon', 'heavyPistol', 'pistols')
const knife = () => weaponSystem('meleeWeapon', 'blade', 'blades', {
  damageValue: {
    ...pool(1), isStrengthBased: true
  },
  accuracy: {
    ...pool(0), isPhysicalLimitBased: true
  },
})
const grenade = () => weaponSystem('grenade', 'grenade', 'throwingWeapons')

describe('a weapon nobody holds', () => {
  beforeEach(() => {
    // Helpers that never look at the holder, or are covered elsewhere
    for (const name of ['_resetItemModifiers', '_handleWeaponToxin', '_checkIfWeaponIsFocus', '_handleWeaponFocus',
      '_handleWeaponMount', '_checkIfWeaponIsMount', 'applyItemEffects', '_handleBow', '_handleWeaponAccessory',
      '_handleWeaponAmmunition', '_generateWeaponRange', '_handleMatrixMonitor', '_handleItemPrice',
      '_handleItemAvailability', '_handleItemConcealment']) {
      vi.spyOn(SR5_UtilityItem, name).mockImplementation(() => {})
    }
    vi.spyOn(SR5_EntityHelpers, 'GenerateMonitorBoxes').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  for (const [label, holder] of [['a storage', storage], ['a Matrix device', device]]) {
    it(`prepares a pistol, a knife and a grenade kept in ${label} without a dice pool`, () => {
      for (const system of [pistol(), knife(), grenade()]) {
        const item = makeItem('itemWeapon', system, holder)
        expect(() => item.prepareData()).not.toThrow()
        expect(system.weaponSkill.dicePool).toBe(0)
      }
    })
  }

  it('still gives the dice pool back once a character holds it again', () => {
    const gun = pistol()
    makeItem('itemWeapon', gun, character).prepareData()
    expect(gun.weaponSkill.dicePool).toBe(5)

    const blade = knife()
    makeItem('itemWeapon', blade, character).prepareData()
    expect(blade.weaponSkill.dicePool).toBe(4)
    expect(blade.accuracy.base).toBe(6)
  })
})

describe('an accessory nobody holds', () => {
  beforeEach(() => {
    for (const name of ['_resetItemModifiers', 'applyItemEffects', '_handleArmorValue', '_handleAugmentation',
      '_handleItemCapacity', '_handleItemPrice', '_handleItemAvailability', '_handleItemConcealment',
      '_handleMatrixMonitor']) {
      vi.spyOn(SR5_UtilityItem, name).mockImplementation(() => {})
    }
    vi.spyOn(SR5_EntityHelpers, 'GenerateMonitorBoxes').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  const accessory = () => ({
    isAccessory: true, isPlugged: false, isActive: true, wirelessTurnedOn: true,
    systemEffects: {
    }, itemEffects: {
    }, accessory: [], canRollTest: false,
    conditionMonitors: {
      matrix: {
        value: 8, actual: {
          value: 0
        }
      }
    },
  })

  for (const [label, holder] of [['a storage', storage], ['a Matrix device', device]]) {
    for (const type of ['itemGear', 'itemArmor', 'itemAugmentation']) {
      it(`still finds whether a ${type} kept in ${label} is plugged`, async () => {
        // The host it is plugged into is carried alongside it
        const host = {
          type: 'itemGear', system: {
            wirelessTurnedOn: false, accessory: [{
              _id: 'scope'
            }]
          }
        }
        const actor = {
          ...holder, items: [host]
        }
        const item = makeItem(type, accessory(), actor)
        Object.defineProperty(item, 'id', {
          value: 'scope'
        })
        const original = SR5_UtilityItem._checkIfAccessoryIsPlugged
        let checked
        vi.spyOn(SR5_UtilityItem, '_checkIfAccessoryIsPlugged').mockImplementation((...args) => {
          checked = original.apply(SR5_UtilityItem, args)
          return checked
        })

        item.prepareData()
        await expect(checked).resolves.toBeUndefined()
        expect(item.system.isPlugged).toBe(true)
      })
    }
  }
})

describe('a storage put down on the map', () => {
  afterEach(() => vi.restoreAllMocks())

  const stash = (items) => {
    const actor = Object.create(SR5Actor.prototype)
    Object.defineProperty(actor, 'type', {
      value: 'actorStorage'
    })
    Object.defineProperty(actor, 'system', {
      value: storage.system
    })
    Object.defineProperty(actor, 'items', {
      value: items
    })
    return actor
  }
  const carried = (type, system) => ({
    type, name: type, uuid: type, system, prepareData: vi.fn()
  })

  it('gives no bonus from what it carries, and reads no attribute of its own', () => {
    const applyCustomEffects = vi.spyOn(SR5_CharacterUtility, 'applyCustomEffects').mockImplementation(() => {})
    const vest = carried('itemArmor', {
      isActive: true, customEffects: {
        0: {
          target: 'system.attributes.body'
        }
      }, accessory: []
    })
    const spell = carried('itemSpell', {
    })
    const actor = stash([vest, spell])

    expect(() => actor.prepareEmbeddedDocuments()).not.toThrow()
    expect(() => actor.updateItems(actor)).not.toThrow()
    expect(applyCustomEffects).not.toHaveBeenCalled()
    expect(vest.prepareData).toHaveBeenCalled()
    // Left as it was: whoever picks it up gets it as it was put away
    expect(vest.system.isActive).toBe(true)
  })
})
