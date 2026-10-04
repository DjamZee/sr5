import {
  describe, it, expect
} from 'vitest'
import {
  SR5_Toxins
} from '../modules/entities/items/toxins.js'
import {
  SR5
} from '../modules/config.js'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'

describe('antitoxin (Chrome Flesh p. 154)', () => {
  const withAntitoxin = (...values) => ({
    specialProperties: {
      antitoxin: {
        modifiers: values.map(value => ({
          value
        }))
      }
    }
  })
  it('takes the highest rating, two antitoxins do not add up', () => {
    expect(SR5_Toxins.antitoxinRating(withAntitoxin(2, 4))).toBe(4)
    expect(SR5_Toxins.antitoxinRating(withAntitoxin())).toBe(0)
    expect(SR5_Toxins.antitoxinRating({
    })).toBe(0)
  })
  it('takes its rating off the Power, never below 0', () => {
    expect(SR5_Toxins.effectivePower(12, 4)).toBe(8)
    expect(SR5_Toxins.effectivePower(3, 4)).toBe(0)
    expect(SR5_Toxins.effectivePower(9)).toBe(9)
  })
})

function blankToxin(type = '', custom = null) {
  return {
    type, custom, speed: '', power: 0, penetration: 0, damageType: null,
    vector: {
      contact: true, ingestion: true, inhalation: true, injection: true 
    },
    effect: {
      disorientation: true, nausea: true, paralysis: true, agony: true, arcaneInhibitor: true 
    },
  }
}

describe('book toxins as data (SR5 p. 409-412)', () => {
  it('covers every toxin type of the config', () => {
    expect(Object.keys(SR5_Toxins.BOOK).sort()).toEqual(Object.keys(SR5.toxinTypes).sort())
  })

  it('Seven-7: contact & inhalation, 1 turn, Power 12, Penetration -2, physical', () => {
    const t = blankToxin('seven')
    expect(SR5_Toxins.apply(t, SR5_Toxins.profileOf(t))).toBe(true)
    expect(t.vector).toEqual({
      contact: true, ingestion: false, inhalation: true, injection: false 
    })
    expect(t).toMatchObject({
      speed: 1, power: 12, penetration: -2, damageType: 'physical' 
    })
    expect(t.effect).toEqual({
      disorientation: true, nausea: true, paralysis: false, agony: false, arcaneInhibitor: false 
    })
  })

  it('Gamma-scopolamine has no damage, only paralysis', () => {
    const t = blankToxin('gamma')
    SR5_Toxins.apply(t, SR5_Toxins.profileOf(t))
    expect(t.damageType).toBe(null)
    expect(t.effect.paralysis).toBe(true)
  })

  it('Noxious Breath: Power = Magic, nothing without an actor (SR5 p. 403)', () => {
    const t = blankToxin('noxiousBreath')
    expect(SR5_Toxins.apply(t, SR5_Toxins.profileOf(t), undefined)).toBe(false)
    expect(SR5_Toxins.apply(t, SR5_Toxins.profileOf(t), 5)).toBe(true)
    expect(t.power).toBe(5)
    expect(t.penetration).toBe(0)
  })

  it('Air engulf: Power = Magic x2, Penetration = -Magic', () => {
    const t = blankToxin('airEngulf')
    SR5_Toxins.apply(t, SR5_Toxins.profileOf(t), 4)
    expect(t.power).toBe(8)
    expect(t.penetration).toBe(-4)
  })

  it('an unknown type has no profile', () => {
    expect(SR5_Toxins.profileOf(blankToxin('nope'))).toBe(null)
  })
})

describe('GM-authored toxin items', () => {
  const item = {
    name: 'Venin de Shiva',
    uuid: 'Item.abc',
    system: {
      vector: {
        contact: false, ingestion: false, inhalation: false, injection: true 
      },
      speed: 2, power: 9, powerFromMagic: false, penetration: -3, damageType: 'stun', special: 'Hallucinations',
      effect: {
        disorientation: false, nausea: true, paralysis: false, agony: false, arcaneInhibitor: false 
      },
    },
  }

  it('is copied onto a weapon as a profile, and read back from it', () => {
    const profile = SR5_Toxins.profileFromItem(item)
    expect(profile).toMatchObject({
      name: 'Venin de Shiva', uuid: 'Item.abc', vector: ['injection'], effect: ['nausea'], powerMagic: 0, special: 'Hallucinations' 
    })
    const t = blankToxin('custom', profile)
    SR5_Toxins.apply(t, SR5_Toxins.profileOf(t))
    expect(t).toMatchObject({
      speed: 2, power: 9, penetration: -3, damageType: 'stun' 
    })
    expect(t.vector.contact).toBe(false)
    expect(SR5_Toxins.nameOf(t)).toBe('Venin de Shiva')
  })

  it('takes the Magic of the bearer when its Power says so', () => {
    const profile = SR5_Toxins.profileFromItem({
      ...item, system: {
        ...item.system, powerFromMagic: true 
      } 
    })
    const t = blankToxin('custom', profile)
    SR5_Toxins.apply(t, profile, 6)
    expect(t.power).toBe(6)
  })

  it('a dropped toxin with no damage keeps damageType null', () => {
    const profile = SR5_Toxins.profileFromItem({
      ...item, system: {
        ...item.system, damageType: '' 
      } 
    })
    const t = blankToxin('custom', profile)
    SR5_Toxins.apply(t, profile)
    expect(t.damageType).toBe(null)
  })

  it('a book toxin becomes an editable item with the same profile', () => {
    const data = SR5_Toxins.bookItemData('neuroStunTen')
    expect(data.type).toBe('itemToxin')
    expect(data.system).toMatchObject({
      speed: 1, power: 15, penetration: -2, damageType: 'stun' 
    })
    const back = SR5_Toxins.profileFromItem({
      name: 'x', system: data.system 
    })
    const a = blankToxin(), b = blankToxin('neuroStunTen')
    SR5_Toxins.apply(a, back)
    SR5_Toxins.apply(b, SR5_Toxins.profileOf(b))
    expect(a).toMatchObject({
      vector: b.vector, effect: b.effect, power: b.power, penetration: b.penetration, damageType: b.damageType, speed: b.speed
    })
  })

  it('Gamma-scopolamine carries its truth serum as special text (SR5 p. 411)', () => {
    expect(SR5_Toxins.bookItemData('gamma').system.special).toBe('SR5.ToxinGammaTruthSerum')
  })

  it('a book toxin name is trimmed, so the button does not create it twice', () => {
    expect(SR5_Toxins.bookItemData('novaScorpionVenom', () => 'Venin de novascorpion ').name).toBe('Venin de novascorpion')
  })
})

describe('a toxin weapon carried by an actor without Magic', () => {
  it('a drone with a Narcoject weapon: P15 injection, no error', () => {
    const drone = {
      system: {
      }
    }
    const itemData = {
      toxin: blankToxin('narcoject')
    }
    expect(() => SR5_UtilityItem._handleWeaponToxin(itemData, drone)).not.toThrow()
    expect(itemData.toxin).toMatchObject({
      power: 15, damageType: 'stun'
    })
    expect(itemData.toxin.vector.injection).toBe(true)
  })
})
