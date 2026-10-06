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
  type = 'actorPc', metatype = 'troll', strength = [], natural = 5, items = []
} = {
}) {
  const attributes = {
  }
  for (const key of KEYS) attributes[key] = {
    natural: {
      base: key === 'strength' ? natural : 5, value: 0, modifiers: []
    },
    augmented: {
      base: 0, value: 0, modifiers: key === 'strength' ? strength : []
    },
  }
  return {
    type, items, system: {
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

  //The spell and the adept power arrive as an itemEffect named after them (applyExternalEffect)
  const boost = (name, castBy = 'itemSpell') => ({
    type: 'itemEffect', name, system: {
      type: castBy, customEffects: {
        0: {
          target: 'system.attributes.strength.augmented', value: 0
        }
      }
    }
  })
  //Seen in game: the modifier carries the type of the casting item, not itemEffect
  const fromEffect = (name, value, type = 'itemSpell') => ({
    source: name, type, value
  })

  it('bounds the Increase Attribute spell at the augmented maximum even without a cap (SR5 p. 290)', () => {
    settings.sr5AugmentationCap = 'none'
    const a = actor({
      metatype: 'human', natural: 6, items: [boost('Augmentation de Force')],
      strength: [mod(3), fromEffect('Augmentation de Force', 4)]
    })
    //6 + 3 + 4 = 13, human augmented maximum 6 + 4 = 10: only the spell's points are cut
    expect(strengthOf(a)).toBe(10)
  })

  it('bounds the Attribute Boost adept power the same way (SR5 p. 312)', () => {
    settings.sr5AugmentationCap = 'none'
    expect(strengthOf(actor({
      metatype: 'human', natural: 6, items: [boost("Augmentation d'attribut (Force)", 'itemAdeptPower')],
      strength: [fromEffect("Augmentation d'attribut (Force)", 6, 'itemAdeptPower')]
    }))).toBe(10)
  })

  //Improved Physical Attribute (SR5 p. 312): "jusqu'à son maximum augmenté (maximum naturel + 4)", whatever the choice.
  //An active adept power whose own custom effect raises the attribute, as in the compendium
  const improvedPhysical = (name, isActive = true) => ({
    type: 'itemAdeptPower', name, system: {
      isActive, customEffects: {
        0: {
          target: 'system.attributes.strength.augmented', type: 'rating'
        }
      }
    }
  })

  it('bounds Improved Physical Attribute at the augmented maximum even without a cap (SR5 p. 312)', () => {
    settings.sr5AugmentationCap = 'none'
    expect(strengthOf(actor({
      metatype: 'human', natural: 6, items: [improvedPhysical('Attribut physique amélioré (Force)')],
      strength: [mod(2), fromEffect('Attribut physique amélioré (Force)', 4, 'itemAdeptPower')]
    }))).toBe(10)
  })

  it('leaves an inactive Improved Physical Attribute out of the bound', () => {
    settings.sr5AugmentationCap = 'none'
    expect(strengthOf(actor({
      metatype: 'human', natural: 6, items: [improvedPhysical('Attribut physique amélioré (Force)', false)],
      strength: [mod(6)]
    }))).toBe(12)
  })

  it('never cuts more than the spell brought', () => {
    settings.sr5AugmentationCap = 'none'
    expect(strengthOf(actor({
      metatype: 'human', natural: 6, items: [boost('Augmentation de Force')],
      strength: [mod(6), fromEffect('Augmentation de Force', 2)]
    }))).toBe(12)
  })

  it('leaves possession out of the cap: it is not an augmentation of SR5 p. 96', () => {
    expect(strengthOf(actor({
      strength: [mod(7, 'possession')]
    }))).toBe(12)
  })

  it('raises the metatype maximum by 1 with Exceptional Attribute (SR5 p. 68)', () => {
    settings.sr5AugmentationCap = 'augmentedMax'
    expect(strengthOf(actor({
      metatype: 'human', natural: 6, strength: [mod(8)], items: [{
        type: 'itemQuality', name: 'Attribut exceptionnel (Force)', system: {
          customEffects: [{
            target: 'system.attributes.strength.maximum', value: 1
          }]
        }
      }]
    }))).toBe(11)
  })

  it('caps nothing for a metatype the table does not know, and says so', () => {
    settings.sr5AugmentationCap = 'augmentedMax'
    const a = actor({
      metatype: '', strength: [mod(8)]
    })
    expect(strengthOf(a)).toBe(13)
    expect(a.system.attributes.strength.augmented.modifiers.find(m => m.type === 'augmentationCap')?.source)
      .toBe('SR5.AugmentationCapUnknownMetatype')
  })
})

describe('metatype modifiers of a grunt (SR5 p. 68)', () => {
  it('gives the troll its -1 in Intuition', () => {
    vi.spyOn(SR5_CharacterUtility, 'grantMetatypeVision').mockImplementation(() => {})
    const a = actor({
      type: 'actorGrunt', metatype: 'troll'
    })
    a.system.reach = {
      modifiers: []
    }
    a.system.resistances = {
      physicalDamage: {
        modifiers: []
      }
    }
    SR5_CharacterUtility.applyRacialModifers(a)
    expect(a.system.attributes.intuition.natural.modifiers.map(m => m.value)).toEqual([-1])
  })
})

describe('reload without spending an action (house rule, off by default)', () => {
  function weapon(...quantities) {
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
      items: quantities.map(quantity => ({
        type: 'itemAmmunition', system: {
          type: 'regular', class: 'heavyPistol', quantity
        }, update: vi.fn()
      })),
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

  it('draws from a pile that holds rounds, not from an empty one listed first', async () => {
    settings.sr5FreeReload = true
    const item = weapon(0, 30)
    await item.reloadAmmo('insert')
    expect(item.update).toHaveBeenCalled()
    const [empty, full] = item.actor.items
    expect(empty.update).not.toHaveBeenCalled()
    expect(full.update.mock.calls[0][0].system.quantity).toBe(15)
  })

  it('keeps the action cost without rounds in the inventory', async () => {
    settings.sr5FreeReload = true
    const item = weapon(0)
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalled()
    expect(item.update).not.toHaveBeenCalled()
  })

  //M2-4, SR5 p. 167: a clip is removed from a ready weapon in a simple action, full or not
  it('ejects a full clip', async () => {
    const item = weapon(30)
    item.actor.system.specialProperties.actions.simple.current = 2
    item.system.ammunition.value = 15
    item.system.ammunition.clipInserted = true
    await item.reloadAmmo('remove')
    expect(item.update.mock.calls[0][0].system.ammunition.value).toBe(0)
    expect(SR5Combat.changeActionInCombat).toHaveBeenCalled()
  })

  it('says why a full weapon is not reloaded', async () => {
    globalThis.ui.notifications.info = vi.fn()
    const item = weapon(30)
    item.system.ammunition.value = 15
    await item.reloadAmmo('insert')
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.INFO_AmmoAlreadyFull')
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
