import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "fs"
import {
  electronicAddedToVintage, applyVintageWireless
} from "../modules/entities/items/weaponTraits.js"
import {
  WEAPON_ACCESSORY_CATALOG
} from "../modules/data/weaponAccessoryCatalog.js"

//Vintage (Gun H(e)aven 3 p. 3): "not compatible with modern electronics"
describe("Vintage and electronics", () => {
  const vintage = {
    name: "vintage"
  }
  it("warns when a smartgun goes on a Vintage weapon", () => {
    const added = electronicAddedToVintage([vintage], [vintage, {
      name: "smartgunSystemExternal"
    }], WEAPON_ACCESSORY_CATALOG)
    expect(added.map(a => a.name)).toEqual(["smartgunSystemExternal"])
  })
  it("warns for an item-based wireless accessory", () => {
    const added = electronicAddedToVintage([vintage], [vintage, {
      _id: "x", name: "Caméra", system: {
        isWireless: true
      }
    }], WEAPON_ACCESSORY_CATALOG)
    expect(added).toHaveLength(1)
  })
  it("says nothing for a bipod, or on a modern weapon", () => {
    expect(electronicAddedToVintage([vintage], [vintage, {
      name: "bipod"
    }], WEAPON_ACCESSORY_CATALOG)).toEqual([])
    expect(electronicAddedToVintage([], [{
      name: "smartgunSystemExternal"
    }], WEAPON_ACCESSORY_CATALOG)).toEqual([])
  })
  it("marks the weapon so the sheet shows a dead wireless icon", () => {
    const data = {
      accessory: [vintage], isWireless: true, wirelessTurnedOn: true
    }
    applyVintageWireless(data)
    expect(data.isVintage).toBe(true)
    for (const f of ["rangedWeapons", "meleeWeapons"]) {
      const template = readFileSync(new URL(`../templates/actors/_partials/right-tabs/combat/${f}.hbs`, import.meta.url), "utf8")
      expect(template).toContain("{{#if system.isVintage}}")
    }
  })
})
