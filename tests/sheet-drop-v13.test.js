import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// The V13 migration lost the sheets' drop rules: ActorSheetV2._onDropItem creates a dropped item itself and never
// calls _onDropItemCreate (Wandrille, then Prosper, measured in game, Foundry 13.351). Types were no longer refused,
// a second tradition was accepted, nothing came switched on. ActorSheetSR5._onDropItem wires them back.

const foundryDrops = vi.hoisted(() => {
  const drops = []
  globalThis.foundry.applications.sheets ??= {
  }
  // Foundry's ActorSheetV2: its own drop (the sort within a sheet) is only recorded
  globalThis.foundry.applications.sheets.ActorSheetV2 = class {
    async _onDropItem(event, item){
      drops.push(item)
      return item
    }
  }
  return drops
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5ActorSheet
} = await import('../modules/entities/actors/characterSheet.js')
const {
  SR5GruntSheet
} = await import('../modules/entities/actors/gruntSheet.js')
const {
  SR5SpiritSheet
} = await import('../modules/entities/actors/spiritSheet.js')
const {
  SR5SpriteSheet
} = await import('../modules/entities/actors/spriteSheet.js')
const {
  SR5DroneSheet
} = await import('../modules/entities/actors/droneSheet.js')
const {
  SR5AppareilSheet
} = await import('../modules/entities/actors/deviceSheet.js')
const {
  SR5AgentSheet
} = await import('../modules/entities/actors/agentSheet.js')

let created, info, warn
beforeEach(() => {
  created = []
  foundryDrops.length = 0
  info = vi.fn()
  warn = vi.fn()
  globalThis.ui = {
    notifications: {
      info, warn
    }
  }
  globalThis.game.i18n = {
    localize: key => key
  }
  globalThis.Item = {
    implementation: {
      create: vi.fn(async (data, options) => {
        created.push({
          data, options
        })
        return {
          ...data, documentName: 'Item'
        }
      })
    }
  }
})

/** A sheet of that class on an actor that owns these items */
const sheetOf = (SheetClass, owned = []) => {
  const items = new Map(owned.map(i => [i.id, i]))
  items[Symbol.iterator] = function* () {
    yield* Map.prototype.values.call(this)
  }
  const sheet = Object.create(SheetClass.prototype)
  sheet.actor = {
    isOwner: true, uuid: 'Actor.a', items
  }
  return sheet
}
/** An item dropped from a compendium */
const dropped = (type, system = {
}, id = `${type}-new`) => ({
  id, parent: null, toObject: () => ({
    _id: id, type, name: type, system: {
      isActive: false, ...system
    }
  })
})
const owned = (type, system = {
}) => ({
  id: `${type}-owned`, type, system
})
const drop = (sheet, item) => sheet._onDropItem({
}, item)
const last = () => created.at(-1)

describe('the base sheet', () => {
  it('lets the sheet decide, then creates the item on the actor, keeping its id when the actor has none like it', async () => {
    await drop(sheetOf(SR5ActorSheet), dropped('itemSpell'))
    expect(last().options).toEqual({
      parent: expect.objectContaining({
        uuid: 'Actor.a'
      }), keepId: true
    })
  })

  // Évariste's review: a refusal returned the notification, where an item or null is expected
  it('returns the created item, or null when the sheet refuses it', async () => {
    ui.notifications.info = vi.fn(() => ({
      message: 'refused'
    }))
    expect(await drop(sheetOf(SR5ActorSheet), dropped('itemVehicleMod'))).toBeNull()
    ui.notifications.warn = vi.fn(() => ({
      message: 'refused'
    }))
    expect(await drop(sheetOf(SR5ActorSheet, [owned('itemTradition')]), dropped('itemTradition'))).toBeNull()
    expect(await drop(sheetOf(SR5SpriteSheet), dropped('itemWeapon'))).toBeNull()
    expect((await drop(sheetOf(SR5ActorSheet), dropped('itemSpell')))?.type).toBe('itemSpell')
  })

  it('leaves a move within the same sheet to Foundry', async () => {
    const sheet = sheetOf(SR5ActorSheet)
    await drop(sheet, {
      ...dropped('itemSpell'), parent: {
        uuid: 'Actor.a'
      }
    })
    expect(foundryDrops).toHaveLength(1)
    expect(created).toEqual([])
  })
})

describe('character and grunt sheets', () => {
  for (const [label, SheetClass] of [['character', SR5ActorSheet], ['grunt', SR5GruntSheet]]) {
    it(`${label}: refuses a vehicle mod and a second tradition`, async () => {
      await drop(sheetOf(SheetClass), dropped('itemVehicleMod'))
      expect(info).toHaveBeenCalledWith('SR5.INFO_ForbiddenItemType')
      await drop(sheetOf(SheetClass, [owned('itemTradition')]), dropped('itemTradition'))
      expect(warn).toHaveBeenCalledWith('SR5.WARN_OnlyOneTradition')
      expect(created).toEqual([])
    })

    it(`${label}: switches on the first armor, device and weapon of a category, never the second`, async () => {
      await drop(sheetOf(SheetClass), dropped('itemArmor'))
      expect(last().data.system.isActive).toBe(true)
      await drop(sheetOf(SheetClass, [owned('itemArmor', {
        isActive: true
      })]), dropped('itemArmor'))
      expect(last().data.system.isActive).toBe(false)
      await drop(sheetOf(SheetClass), dropped('itemDevice'))
      expect(last().data.system.isActive).toBe(true)
      await drop(sheetOf(SheetClass, [owned('itemWeapon', {
        isActive: true, category: 'meleeWeapon'
      })]), dropped('itemWeapon', {
        category: 'rangedWeapon'
      }))
      expect(last().data.system.isActive).toBe(true)
    })

    it(`${label}: switches on qualities, augmentations, foci, echoes and permanent powers`, async () => {
      for (const type of ['itemQuality', 'itemAugmentation', 'itemFocus', 'itemEcho']) {
        await drop(sheetOf(SheetClass), dropped(type))
        expect(last().data.system.isActive, type).toBe(true)
      }
      await drop(sheetOf(SheetClass), dropped('itemAdeptPower', {
        actionType: 'permanent'
      }))
      expect(last().data.system.isActive).toBe(true)
      await drop(sheetOf(SheetClass), dropped('itemAdeptPower', {
        actionType: 'simple'
      }))
      expect(last().data.system.isActive).toBe(false)
    })
  }
})

describe('spirit sheet', () => {
  it('accepts weapons, powers, a tradition, spells and effects only', async () => {
    await drop(sheetOf(SR5SpiritSheet), dropped('itemArmor'))
    expect(info).toHaveBeenCalledWith('SR5.INFO_ForbiddenItemType')
    expect(created).toEqual([])
    for (const type of ['itemSpell', 'itemEffect', 'itemTradition']) await drop(sheetOf(SR5SpiritSheet), dropped(type))
    expect(created.map(c => c.data.type)).toEqual(['itemSpell', 'itemEffect', 'itemTradition'])
  })

  it('switches on its first weapon and its permanent powers', async () => {
    await drop(sheetOf(SR5SpiritSheet), dropped('itemWeapon', {
      category: 'meleeWeapon'
    }))
    expect(last().data.system.isActive).toBe(true)
    await drop(sheetOf(SR5SpiritSheet), dropped('itemPower', {
      actionType: 'permanent'
    }))
    expect(last().data.system.isActive).toBe(true)
  })
})

describe('sprite sheet', () => {
  it('accepts sprite powers and effects only', async () => {
    await drop(sheetOf(SR5SpriteSheet), dropped('itemWeapon'))
    expect(info).toHaveBeenCalledWith('SR5.INFO_ForbiddenItemType')
    await drop(sheetOf(SR5SpriteSheet), dropped('itemSpritePower'))
    expect(created.map(c => c.data.type)).toEqual(['itemSpritePower'])
  })
})

describe('drone sheet', () => {
  it('refuses a melee weapon and what a drone cannot carry', async () => {
    await drop(sheetOf(SR5DroneSheet), dropped('itemWeapon', {
      category: 'meleeWeapon'
    }))
    await drop(sheetOf(SR5DroneSheet), dropped('itemQuality'))
    expect(info).toHaveBeenCalledTimes(2)
    expect(created).toEqual([])
  })

  // droneSheet.js read i.system.type instead of i.type: every ranged weapon dropped came switched on
  it('switches on its first ranged weapon, not the second', async () => {
    await drop(sheetOf(SR5DroneSheet), dropped('itemWeapon', {
      category: 'rangedWeapon'
    }))
    expect(last().data.system.isActive).toBe(true)
    await drop(sheetOf(SR5DroneSheet, [owned('itemWeapon', {
      isActive: true, category: 'rangedWeapon'
    })]), dropped('itemWeapon', {
      category: 'rangedWeapon'
    }))
    expect(last().data.system.isActive).toBe(false)
  })
})

describe('device and agent sheets', () => {
  for (const [label, SheetClass] of [['device', SR5AppareilSheet], ['agent', SR5AgentSheet]]) {
    it(`${label}: accepts effects only`, async () => {
      await drop(sheetOf(SheetClass), dropped('itemWeapon'))
      expect(info).toHaveBeenCalledWith('SR5.INFO_ForbiddenItemType')
      await drop(sheetOf(SheetClass), dropped('itemEffect'))
      expect(created.map(c => c.data.type)).toEqual(['itemEffect'])
    })
  }
})

// Élise's ruling (djamz.12): an item copied from another sheet follows the sheet's rule, like a new drop
describe('an item switched on where it came from', () => {
  it('arrives switched off when the actor already has one of its kind switched on', async () => {
    for (const SheetClass of [SR5ActorSheet, SR5GruntSheet]) {
      await drop(sheetOf(SheetClass, [owned('itemArmor', {
        isActive: true
      })]), dropped('itemArmor', {
        isActive: true
      }))
      expect(last().data.system.isActive).toBe(false)
      await drop(sheetOf(SheetClass, [owned('itemDevice', {
        isActive: true
      })]), dropped('itemDevice', {
        isActive: true
      }))
      expect(last().data.system.isActive).toBe(false)
    }
    for (const SheetClass of [SR5SpiritSheet, SR5DroneSheet]) {
      await drop(sheetOf(SheetClass, [owned('itemWeapon', {
        isActive: true, category: 'rangedWeapon'
      })]), dropped('itemWeapon', {
        isActive: true, category: 'rangedWeapon'
      }))
      expect(last().data.system.isActive).toBe(false)
    }
  })

  it('stays switched on when the actor has none of its kind switched on', async () => {
    await drop(sheetOf(SR5ActorSheet, [owned('itemArmor', {
      isActive: false
    })]), dropped('itemArmor', {
      isActive: true
    }))
    expect(last().data.system.isActive).toBe(true)
  })
})

// V13's ActorSheetV2._onDropFolder does nothing: a folder dropped on a sheet created no item
describe('a folder of items dropped on a sheet', () => {
  /** An actor whose created items join its item list, as Foundry's do */
  const liveSheet = SheetClass => {
    const sheet = sheetOf(SheetClass)
    Item.implementation.create = vi.fn(async (data, options) => {
      created.push({
        data, options
      })
      sheet.actor.items.set(data._id, {
        id: data._id, type: data.type, system: data.system
      })
      return {
        ...data, documentName: 'Item'
      }
    })
    return sheet
  }
  const folderOf = (...items) => ({
    type: 'Item', contents: items.map(i => ({
      ...i, documentName: 'Item'
    }))
  })

  it('sends each item through the sheet rules, each seeing the ones created before it', async () => {
    const sheet = liveSheet(SR5ActorSheet)
    const folder = folderOf(dropped('itemArmor', {
    }, 'a1'), dropped('itemArmor', {
    }, 'a2'), dropped('itemVehicleMod'))
    expect(await sheet._onDropFolder({
    }, folder)).toBe(folder)
    expect(created.map(c => [c.data._id, c.data.system.isActive])).toEqual([['a1', true], ['a2', false]])
    expect(info).toHaveBeenCalledWith('SR5.INFO_ForbiddenItemType')
  })

  it('reads a compendium folder through the uuids of its index', async () => {
    const sheet = liveSheet(SR5ActorSheet)
    globalThis.fromUuid = vi.fn(async uuid => dropped('itemSpell', {
    }, uuid))
    await sheet._onDropFolder({
    }, {
      type: 'Item', contents: [{
        uuid: 'Compendium.x.Item.s1'
      }]
    })
    expect(created.map(c => c.data.type)).toEqual(['itemSpell'])
  })

  it('creates nothing from a folder of actors, or on a sheet the user does not own', async () => {
    const sheet = liveSheet(SR5ActorSheet)
    expect(await sheet._onDropFolder({
    }, {
      type: 'Actor', contents: [dropped('itemSpell')]
    })).toBeNull()
    sheet.actor.isOwner = false
    expect(await sheet._onDropFolder({
    }, folderOf(dropped('itemSpell')))).toBeNull()
    expect(created).toEqual([])
  })
})
