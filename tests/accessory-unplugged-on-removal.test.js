import {
  describe, it, expect, vi
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'

// B1: an accessory removed from a weapon with the bin kept isPlugged = true, so it was listed nowhere again.
const host = (type, ids, wirelessTurnedOn = true) => ({
  type, system: {
    wirelessTurnedOn, accessory: ids.map(_id => ({
      _id
    }))
  }
})
const accessory = (id, isPlugged) => ({
  id, type: 'itemWeapon', system: {
    isAccessory: true, isPlugged, wirelessTurnedOn: false
  }
})

describe('accessory plugged state', () => {
  it('an accessory mounted on a weapon is plugged', async () => {
    const lamp = accessory('lamp', false)
    await SR5_UtilityItem._checkIfAccessoryIsPlugged(lamp, {
      items: [host('itemWeapon', ['lamp'])]
    })
    expect(lamp.system.isPlugged).toBe(true)
  })

  it('an orphan accessory still marked plugged is read as unplugged', async () => {
    const lamp = accessory('lamp', true)
    await SR5_UtilityItem._checkIfAccessoryIsPlugged(lamp, {
      items: [host('itemWeapon', [])]
    })
    expect(lamp.system.isPlugged).toBe(false)
  })

  it('a host carrying other accessories does not keep it plugged', async () => {
    const lamp = accessory('lamp', true)
    await SR5_UtilityItem._checkIfAccessoryIsPlugged(lamp, {
      items: [host('itemGear', ['scope']), host('itemWeapon', ['silencer'])]
    })
    expect(lamp.system.isPlugged).toBe(false)
  })

  it('an accessory found after an empty host stays plugged', async () => {
    const lamp = accessory('lamp', false)
    await SR5_UtilityItem._checkIfAccessoryIsPlugged(lamp, {
      items: [host('itemGear', []), host('itemArmor', ['lamp'], false)]
    })
    expect(lamp.system.isPlugged).toBe(true)
    expect(lamp.system.wirelessTurnedOn).toBe(false)
  })
})

// Any change on the weapon sheet submitted the list from the form, which only holds name, slot and free of the
// accessories chosen from the list: the mounted lamp was dropped (and the bin then aimed at a row gone)
describe('accessory list submitted by a sheet form', () => {
  const stored = () => [
    {
      name: 'gasVentSystemTwo', slot: '', isFree: true, price: 400, gameEffects: '<p>vent</p>'
    },
    {
      name: 'smartgunSystemInternal', slot: 'internal', isFree: true, price: 5300
    },
    {
      _id: 'lamp', name: 'Lampe torche', system: {
        weaponAccessory: {
          slot: 'top'
        }
      }
    },
  ]

  it('keeps the mounted item accessory and the fields the form does not hold', () => {
    const merged = SR5_UtilityItem.mergeAccessoryForm(stored(), [
      {
        name: 'gasVentSystemTwo', slot: 'barrel', isFree: false
      },
      {
        name: 'smartgunSystemInternal', slot: 'internal', isFree: true
      },
    ])
    expect(merged.map(a => a._id ?? a.name)).toEqual(['gasVentSystemTwo', 'smartgunSystemInternal', 'lamp'])
    expect(merged[0]).toMatchObject({
      slot: 'barrel', isFree: false, price: 400, gameEffects: '<p>vent</p>'
    })
  })

  it('writes by index when the mounted accessory sits between two others', () => {
    const list = stored()
    const merged = SR5_UtilityItem.mergeAccessoryForm([list[0], list[2], list[1]], {
      0: {
        name: 'gasVentSystemTwo', slot: '', isFree: true
      }, 2: {
        name: 'smartgunSystemInternal', slot: 'under', isFree: true
      }
    })
    expect(merged[1]._id).toBe('lamp')
    expect(merged[2]).toMatchObject({
      slot: 'under', price: 5300
    })
  })

  it('reads a list stored as an object', () => {
    expect(SR5_UtilityItem.mergeAccessoryForm({
      0: {
        name: 'a'
      }
    }, {
      1: {
        name: 'b'
      }
    })).toEqual([{
      name: 'a'
    }, {
      name: 'b'
    }])
  })
})

describe('removing an accessory from its host', () => {
  const actorWith = (...items) => ({
    items: Object.assign(items, {
      get: id => items.find(i => i.id === id)
    })
  })

  it('writes isPlugged = false on the accessory left on no host', async () => {
    const lamp = accessory('lamp', true)
    lamp.update = vi.fn()
    await SR5_UtilityItem.unplugRemovedAccessory(actorWith(lamp, host('itemWeapon', [])), 'lamp')
    expect(lamp.update).toHaveBeenCalledWith({
      'system.isPlugged': false
    })
  })

  it('leaves it plugged when another host still carries it', async () => {
    const lamp = accessory('lamp', true)
    lamp.update = vi.fn()
    await SR5_UtilityItem.unplugRemovedAccessory(actorWith(lamp, host('itemWeapon', ['lamp'])), 'lamp')
    expect(lamp.update).not.toHaveBeenCalled()
  })

  it('does nothing for an accessory no longer in the inventory', async () => {
    await expect(SR5_UtilityItem.unplugRemovedAccessory(actorWith(), 'lamp')).resolves.toBeUndefined()
  })
})
