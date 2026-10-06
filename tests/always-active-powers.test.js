import {
  describe, it, expect, vi
} from "vitest"

const defaultDrops = vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  const drops = []
  // Foundry's ActorSheetV2: its own drop is only recorded
  globalThis.foundry.applications.sheets ??= {
  }
  globalThis.foundry.applications.sheets.ActorSheetV2 = class {
    _onRender(){}
    async _onDropItem(event, item){
      drops.push(item)
      return item
    }
  }
  return drops
})
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

import {
  readFileSync
} from "node:fs"
import {
  SR5_CompendiumUtility
} from "../modules/entities/actors/utilityCompendium.js"
import {
  isAlwaysActive
} from "../modules/entities/items/always-active.js"

const {
  SR5SpiritSheet
} = await import("../modules/entities/actors/spiritSheet.js")

// Some powers « sont toujours actifs et ne nécessitent donc aucune action pour leur activation ; ils sont listés
// avec une action « automatique » » (SR5 p. 396). Given to a new spirit, they used to arrive switched off: the
// Armor of an Immunity did not count until the GM ticked it. They come switched on (arbitrage de DjamZ, H39).

const item = (type, actionType, key, name = key) => ({
  type, name, system: {
    actionType, systemEffects: [{
      category: "spiritPower", value: key
    }]
  },
  toObject: () => ({
    type, name, system: {
      actionType, isActive: false
    }
  }),
})

describe("a power dropped on a sheet", () => {
  it("is switched on when its action is automatic or permanent, for powers, adept powers and techniques", () => {
    for (const type of ["itemPower", "itemAdeptPower", "itemMartialArt"]) {
      expect(isAlwaysActive({
        type, system: {
          actionType: "automatic"
        }
      })).toBe(true)
      expect(isAlwaysActive({
        type, system: {
          actionType: "complex"
        }
      })).toBe(false)
    }
    expect(isAlwaysActive({
      type: "itemWeapon", system: {
        actionType: "automatic"
      }
    })).toBe(false)
  })

  // The drop goes through the sheet's own rules again (fix/depot-v13): an automatic Immunity dropped on a spirit
  // comes switched on, a complex power stays off, and a move within the same sheet is Foundry's sort
  it("on a spirit sheet, through the sheet's own rules", async () => {
    const created = []
    globalThis.Item = {
      implementation: {
        create: vi.fn(async (data, options) => created.push([data, options]) && data)
      }
    }
    const sheet = Object.create(SR5SpiritSheet.prototype)
    sheet.actor = {
      isOwner: true, uuid: "Actor.spirit", items: new Map()
    }
    const dropped = (actionType, extra = {
    }) => ({
      id: "pow", parent: null, ...extra,
      toObject: () => ({
        type: "itemPower", name: "Immunité", system: {
          actionType, isActive: false
        }
      })
    })
    await sheet._onDropItem({
    }, dropped("automatic"))
    expect(created[0][0].system.isActive).toBe(true)
    expect(created[0][1]).toEqual({
      parent: sheet.actor, keepId: true
    })
    await sheet._onDropItem({
    }, dropped("complex"))
    expect(created[1][0].system.isActive).toBe(false)
    defaultDrops.length = 0
    await sheet._onDropItem({
    }, dropped("automatic", {
      parent: {
        uuid: "Actor.spirit"
      }
    }))
    expect(defaultDrops).toHaveLength(1)
    expect(created).toHaveLength(2)
  })

  it("by the character, grunt and spirit sheets, through the same rule", () => {
    for (const sheet of ["characterSheet", "gruntSheet", "spiritSheet"]) {
      const source = readFileSync(new URL(`../modules/entities/actors/${sheet}.js`, import.meta.url), "utf8")
      expect(source).toContain("isAlwaysActive(")
    }
  })
})

describe("powers given to a new spirit", () => {
  it("come switched on when their action is automatic or permanent, off otherwise", () => {
    const on = name => SR5_CompendiumUtility.givenItem(item("itemPower", name, "x")).system.isActive
    expect(on("automatic")).toBe(true)
    expect(on("permanent")).toBe(true)
    expect(on("complex")).toBe(false)
    expect(on("simple")).toBe(false)
    expect(on("")).toBe(false)
  })

  it("leaves weapons as they are", () => {
    expect(SR5_CompendiumUtility.givenItem(item("itemWeapon", "automatic", "x")).system.isActive).toBe(false)
  })

  it("applies to the base powers of a spirit type", async () => {
    const compendium = [
      item("itemPower", "automatic", "astralForm", "Forme astrale"),
      item("itemPower", "simple", "manifestation", "Manifestation"),
    ]
    const found = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium([], compendium, "watcher")
    expect(Object.fromEntries(found.map(i => [i.name, i.system.isActive]))).toEqual({
      "Forme astrale": true, "Manifestation": false
    })
  })
})
