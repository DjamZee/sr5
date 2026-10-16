import {
  describe, it, expect, beforeEach, afterEach
} from 'vitest'
import {
  SR5_SpiritTypes
} from '../modules/entities/items/spirit-types.js'
import {
  weaponRatingModifiers
} from '../modules/entities/items/weapon-ratings.js'
import {
  SR5
} from '../modules/config.js'

// The extraplanar entities are spirit types set at a Force (Howling Shadows p. 128 and following). The Erinye
// (p. 138): CHC P/2, limits (P x 4) / 3, armor (P x 2) against conventional weapons, claws VD (FOR + 2)P PA -FOR,
// wings VD (FOR + 6)E PA -Puissance, Engloutissement (Air) VD (Magie x 2) PA -Magie (SR5 p. 399).

function entity(system = {
}) {
  return {
    name: 'Érinye',
    uuid: 'Item.erinye',
    type: 'itemSpiritType',
    system: {
      key: 'erinye',
      summonable: false,
      edge: 'half',
      essenceModifier: 0,
      limits: 'force',
      armor: {
        forceMultiplier: 0, bonus: 0, kind: ''
      },
      initiative: {
        physicalDice: 2, astralDice: null, astralBonus: 0, physicalBonus: 0
      },
      items: [],
      ...system,
    },
  }
}

function bearer(force, strength) {
  return {
    attributes: {
      strength: {
        augmented: {
          value: strength
        }
      }, charisma: {
        augmented: {
          value: force
        }
      }
    },
    specialAttributes: {
      magic: {
        augmented: {
          value: force
        }
      }
    },
  }
}

describe('extraplanar entities as spirit types', () => {
  beforeEach(() => {
    SR5_SpiritTypes._officialKeys = new Set(Object.keys(SR5.spiritTypes))
    SR5_SpiritTypes.registry = new Map()
  })

  afterEach(() => {
    SR5_SpiritTypes.registry = new Map()
    SR5_SpiritTypes._inject()
  })

  it('is not summonable by default for an entity, but the gamemaster can tick it', () => {
    SR5_SpiritTypes.registry.set('erinye', entity())
    SR5_SpiritTypes.registry.set('ally', entity({
      key: 'ally', summonable: true
    }))
    expect(SR5_SpiritTypes.isSummonable('erinye')).toBe(false)
    expect(SR5_SpiritTypes.isSummonable('ally')).toBe(true)
    expect(SR5_SpiritTypes.isSummonable('air')).toBe(true)
    const offered = SR5_SpiritTypes.summonableOnly({
      air: 'SR5.SpiritAir', erinye: 'Érinye', ally: 'Allié'
    })
    expect(Object.keys(offered)).toEqual(['air', 'ally'])
  })

  it('keeps the types created before the box, which have no value, summonable', () => {
    const older = entity()
    delete older.system.summonable
    SR5_SpiritTypes.registry.set('erinye', older)
    expect(SR5_SpiritTypes.isSummonable('erinye')).toBe(true)
  })

  it('gives its own Edge, P/2 or P, and none to the other types', () => {
    expect(SR5_SpiritTypes.edgeRating(entity(), 4)).toBe(2)
    expect(SR5_SpiritTypes.edgeRating(entity(), 7)).toBe(4)
    expect(SR5_SpiritTypes.edgeRating(entity({
      edge: 'full'
    }), 8)).toBe(8)
    expect(SR5_SpiritTypes.edgeRating(entity({
      edge: ''
    }), 8)).toBeNull()
    expect(SR5_SpiritTypes.edgeRating(null, 8)).toBeNull()
  })

  it('prints (P x 4) / 3 for its limits, rounded up', () => {
    expect(SR5_SpiritTypes.forceLimit(entity(), 4)).toBe(6)
    expect(SR5_SpiritTypes.forceLimit(entity(), 8)).toBe(11)
    expect(SR5_SpiritTypes.forceLimit(entity({
      limits: ''
    }), 8)).toBeNull()
    // Shedim: "Physique (P x 4)/3 + 1" (Dark Terrors p. 52), the others unchanged
    const shedim = entity({
      physicalLimitBonus: 1
    })
    expect(SR5_SpiritTypes.forceLimit(shedim, 5, 'physicalLimit')).toBe(8)
    expect(SR5_SpiritTypes.forceLimit(shedim, 5, 'mentalLimit')).toBe(7)
  })

  it('works out its armor at the Force it is given', () => {
    const shedim = entity({
      armor: {
        forceMultiplier: 2, bonus: 0, kind: 'mystic'
      }
    })
    expect(SR5_SpiritTypes.armor(shedim, 4)).toEqual({
      value: 8, kind: 'mystic'
    })
    expect(SR5_SpiritTypes.armor(shedim, 8)).toEqual({
      value: 16, kind: 'mystic'
    })
    expect(SR5_SpiritTypes.armor(entity({
      armor: {
        forceMultiplier: 0, bonus: 12, kind: 'hardened'
      }
    }), 3)).toEqual({
      value: 12, kind: 'hardened'
    })
    expect(SR5_SpiritTypes.armor(entity(), 6)).toBeNull()
  })

  it('gives copies of its items, without their ids', () => {
    SR5_SpiritTypes.registry.set('erinye', entity({
      items: [{
        _id: 'abc', name: 'Arme naturelle (Griffes)', type: 'itemWeapon', system: {
        }
      }]
    }))
    const given = SR5_SpiritTypes.givenItems('erinye')
    expect(given).toEqual([{
      name: 'Arme naturelle (Griffes)', type: 'itemWeapon', system: {
      }
    }])
    given[0].name = 'changed'
    expect(SR5_SpiritTypes.get('erinye').system.items[0].name).toBe('Arme naturelle (Griffes)')
    expect(SR5_SpiritTypes.givenItems('air')).toEqual([])
  })
})

describe('weapons that follow their bearer', () => {
  const engulf = {
    damageValue: {
      magicMultiplier: 2
    }, armorPenetration: {
      linkedAttribute: 'magic'
    }
  }
  const claws = {
    damageValue: {
      magicMultiplier: 0
    }, armorPenetration: {
      linkedAttribute: 'strength'
    }
  }

  it('gives an engulf VD (Magic x 2) and AP -Magic (SR5 p. 399)', () => {
    expect(weaponRatingModifiers(engulf, bearer(4, 3))).toEqual([
      {
        target: 'damageValue', label: 'SR5.Magic', value: 8
      },
      {
        target: 'armorPenetration', label: 'SR5.Magic', value: -4
      },
    ])
    expect(weaponRatingModifiers(engulf, bearer(8, 7)).map(m => m.value)).toEqual([16, -8])
  })

  it('lowers the AP of the claws by the Strength, P - 1 for an Erinye (Howling Shadows p. 138)', () => {
    expect(weaponRatingModifiers(claws, bearer(4, 4))).toEqual([{
      target: 'armorPenetration', label: 'SR5.Strength', value: -4
    }])
    expect(weaponRatingModifiers(claws, bearer(8, 8), true)).toEqual([{
      target: 'armorPenetration', label: 'SR5.Charisma', value: -8
    }])
  })

  it('leaves an ordinary weapon alone', () => {
    expect(weaponRatingModifiers({
      damageValue: {
      }, armorPenetration: {
      }
    }, bearer(4, 4))).toEqual([])
    expect(weaponRatingModifiers({
    }, {
    })).toEqual([])
  })
})
