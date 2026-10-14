import {
  describe, it, expect
} from 'vitest'
import {
  workshopFamily, weaponSlots, slotLines, slotRefusal, toolsFor, installNeedsTest, capacityGauge, capacityRefusal,
  workshopTotals
} from '../modules/system/item-workshop.js'

// The workshop of an item (lot 12, C9): Armurerie, Personnalisation, Clinique, Établi
const acc = (name, slot, type = 'accessory') => ({
  name, slot, system: {
    weaponAccessory: {
      slot, type
    }
  }
})

describe('workshop families', () => {
  it('opens on a ranged weapon only, never on an accessory itself', () => {
    expect(workshopFamily({
      type: 'itemWeapon', system: {
        category: 'rangedWeapon'
      }
    })).toBe('weapon')
    expect(workshopFamily({
      type: 'itemWeapon', system: {
        category: 'meleeWeapon'
      }
    })).toBe(null)
    expect(workshopFamily({
      type: 'itemWeapon', system: {
        category: 'weaponAccessory', isAccessory: true
      }
    })).toBe(null)
  })

  it('opens on an armor, an implant or a piece of gear with a Capacity (SR5 p. 418)', () => {
    const cap = v => ({
      capacity: {
        value: v
      }
    })
    expect(workshopFamily({
      type: 'itemArmor', system: cap(6)
    })).toBe('armor')
    expect(workshopFamily({
      type: 'itemAugmentation', system: cap(15)
    })).toBe('augmentation')
    expect(workshopFamily({
      type: 'itemGear', system: cap(3)
    })).toBe('gear')
    expect(workshopFamily({
      type: 'itemGear', system: cap(0)
    })).toBe(null)
    expect(workshopFamily({
      type: 'itemDevice', system: cap(4)
    })).toBe(null)
  })
})

describe('weapon slots (RG p. 67)', () => {
  it('reads the table: none on a hold-out, no underneath on a light pistol, all on a rifle, the GM on a bow', () => {
    expect(weaponSlots('holdOut')).toEqual([])
    expect(weaponSlots('lightPistol')).not.toContain('underneath')
    expect(weaponSlots('assaultRifle')).toHaveLength(6)
    expect(weaponSlots('bow')).toBe(null)
  })

  it('takes one accessory per slot', () => {
    const on = [acc('Smartgun', 'top')]
    expect(slotRefusal('assaultRifle', on, acc('Lunette', 'top'))).toBe('slotTaken')
    expect(slotRefusal('assaultRifle', on, acc('Silencieux', 'barrel'))).toBe(null)
    expect(slotLines('assaultRifle', [...on, acc('Laser', 'top')]).find(l => l.key === 'top').over).toBe(true)
  })

  it('refuses a slot the weapon has not, and a trait at any time', () => {
    expect(slotRefusal('lightPistol', [], acc('Bipied', 'underneath'))).toBe('noSlot')
    expect(slotRefusal('assaultRifle', [], acc('Canon long', 'barrel', 'trait'))).toBe('trait')
    // The gamemaster's discretion: any slot
    expect(slotRefusal('bow', [], acc('Viseur', 'underneath'))).toBe(null)
  })

  it('asks for a kit and no test on top, a shop and a test inside or for a modification', () => {
    expect(toolsFor(acc('Laser', 'top'))).toBe('kit')
    expect(installNeedsTest(acc('Laser', 'underneath'))).toBe(false)
    expect(toolsFor(acc('Crosse', 'stock'))).toBe('shop')
    expect(installNeedsTest(acc('Gecko grip', 'side', 'modification'))).toBe(true)
  })
})

describe('Capacity', () => {
  it('counts the Capacity the accessories take, and refuses past it', () => {
    expect(capacityGauge(6, [2, 3])).toMatchObject({
      used: 5, free: 1, over: false
    })
    expect(capacityRefusal(6, [2, 3], 2)).toEqual({
      needed: 2, free: 1
    })
    expect(capacityRefusal(6, [2, 3], 1)).toBe(null)
  })
})

describe('the whole', () => {
  it('adds the parts to the item, built-in ones free, the highest availability and the strictest legality', () => {
    expect(workshopTotals({
      price: 1000, availability: 4, legality: ''
    }, [{
      price: 500, availability: 8, legality: 'R'
    }, {
      price: 300, free: true, availability: 2
    }])).toEqual({
      host: 1000, accessories: 500, total: 1500, availability: 8, legality: 'R'
    })
  })

  it('keeps a weapon\'s price, which already counts its accessories', () => {
    expect(workshopTotals({
      price: 1500
    }, [{
      price: 500
    }], {
      hostIncludes: true
    })).toMatchObject({
      host: 1000, accessories: 500, total: 1500
    })
  })
})
