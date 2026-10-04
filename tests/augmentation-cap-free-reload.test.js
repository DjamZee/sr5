import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  SR5Item
} from '../modules/entities/items/entityItem.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5
} from '../modules/config.js'
import {
  METATYPE_ATTRIBUTE_MAX
} from '../modules/entities/actors/augmentationCap.js'

const KEYS = ['body', 'agility', 'reaction', 'strength', 'willpower', 'logic', 'intuition', 'charisma']
const mod = (value, type = 'cyberware') => ({
  source: type, type, value
})

let settings
beforeEach(() => {
  settings = {
    sr5AugmentationCap: 'bonus', sr5FreeReload: false
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.combat
})

/** A character whose Strength is natural 5 with the given augmented modifiers */
function actor({
  type = 'actorPc', metatype = 'troll', strength = []
} = {
}) {
  const attributes = {
  }
  for (const key of KEYS) attributes[key] = {
    natural: {
      base: 5, value: 0, modifiers: []
    },
    augmented: {
      base: 0, value: 0, modifiers: key === 'strength' ? strength : []
    },
  }
  return {
    type, system: {
      biography: {
        metatype
      }, attributes, initiatives: {
      }
    }
  }
}
const strengthOf = a => {
  SR5_CharacterUtility.updateAttributes(a)
  return a.system.attributes.strength.augmented.value
}

describe('augmentation cap (SR5 p. 96 by default, arbitrage de DjamZ for the other choices)', () => {
  it('keeps +4 at most over the natural rating, and says the real value', () => {
    const a = actor({
      strength: [mod(3), mod(2, 'bioware'), mod(2, 'magic')]
    })
    expect(strengthOf(a)).toBe(9)
    const cut = a.system.attributes.strength.augmented.modifiers.find(m => m.type === 'augmentationCap')
    expect(cut.value).toBe(-3)
    //the help of the attribute names the kind of every modifier: this one must have its label
    expect(SR5.modifiersTypes[cut.type]).toBeDefined()
  })

  it('never cuts a penalty: it applies under the cap', () => {
    expect(strengthOf(actor({
      strength: [mod(7), mod(-2, 'armorEncumbrance')]
    }))).toBe(7)
  })

  it('does not stack its cut when the attributes are updated twice', () => {
    const a = actor({
      strength: [mod(7)]
    })
    strengthOf(a)
    expect(strengthOf(a)).toBe(9)
  })

  it('caps at the metatype maximum + 4 when the table chose it (SR5 p. 68)', () => {
    settings.sr5AugmentationCap = 'augmentedMax'
    expect(strengthOf(actor({
      strength: [mod(7)]
    }))).toBe(12)
    expect(strengthOf(actor({
      metatype: 'human', strength: [mod(7)]
    }))).toBe(10)
  })

  it('lets everything through without a cap', () => {
    settings.sr5AugmentationCap = 'none'
    expect(strengthOf(actor({
      strength: [mod(7)]
    }))).toBe(12)
  })

  it('reads the metatype table of SR5 p. 68', () => {
    expect(METATYPE_ATTRIBUTE_MAX.troll).toEqual({
      body: 10, agility: 5, reaction: 6, strength: 10, willpower: 6, logic: 5, intuition: 5, charisma: 4
    })
    expect(METATYPE_ATTRIBUTE_MAX.dwarf.reaction).toBe(5)
    expect(METATYPE_ATTRIBUTE_MAX.elf.charisma).toBe(8)
    expect(METATYPE_ATTRIBUTE_MAX.ork.body).toBe(9)
  })
})

describe('reload without spending an action (house rule, off by default)', () => {
  function weapon(ammoQuantity) {
    const owner = {
      id: 'a1', isToken: false, name: 'Runner',
      system: {
        attributes: {
          agility: {
            augmented: {
              value: 4
            }
          }
        },
        specialProperties: {
          actions: {
            free: {
              current: 0
            }, simple: {
              current: 0
            }, complex: {
              current: 0
            }
          },
          smartlink: {
            value: 0
          }
        },
      },
      items: [{
        type: 'itemAmmunition', system: {
          type: 'regular', class: 'heavyPistol', quantity: ammoQuantity
        }, update: vi.fn()
      }],
    }
    const item = Object.create(SR5Item.prototype)
    Object.defineProperty(item, 'actor', {
      value: owner
    })
    item.system = {
      type: 'heavyPistol', isWireless: false, accessory: [],
      ammunition: {
        casing: 'clip', type: 'regular', value: 0, max: 15, clipInserted: false
      }
    }
    item.update = vi.fn()
    item.toObject = () => ({
      system: item.system
    })
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(owner)
    vi.spyOn(foundry.utils, 'duplicate').mockImplementation(o => structuredClone(o.toObject ? o.toObject() : o))
    return item
  }

  beforeEach(() => {
    globalThis.game.combat = {
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
    vi.spyOn(SR5Combat, 'changeActionInCombat').mockImplementation(() => {})
  })

  it('follows the book by default: no action left, no reload', async () => {
    const item = weapon(30)
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalled()
    expect(item.update).not.toHaveBeenCalled()
  })

  it('reloads for free when the rounds are in the inventory', async () => {
    settings.sr5FreeReload = true
    const item = weapon(30)
    await item.reloadAmmo('insert')
    expect(item.update).toHaveBeenCalled()
    expect(SR5Combat.changeActionInCombat).not.toHaveBeenCalled()
  })

  it('keeps the action cost without rounds in the inventory', async () => {
    settings.sr5FreeReload = true
    const item = weapon(0)
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalled()
    expect(item.update).not.toHaveBeenCalled()
  })

  it('keeps the cost of ejecting a clip alone', async () => {
    settings.sr5FreeReload = true
    const item = weapon(30)
    item.system.ammunition.value = 5
    await item.reloadAmmo('remove')
    expect(ui.notifications.warn).toHaveBeenCalled()
  })
})
