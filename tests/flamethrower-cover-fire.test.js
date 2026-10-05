import {
  describe, it, expect, beforeAll
} from "vitest"
import {
  readFileSync
} from "fs"
import {
  SR5_ConverterHelpers
} from "../modules/rolls/roll-helpers/converter.js"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"

beforeAll(() => {
  globalThis.game = globalThis.game || {
  }
  globalThis.game.i18n = globalThis.game.i18n || {
    localize: k => k
  }
})

//Suppressive Fire (SR5 p. 179) fires 20 rounds; the flamethrower sweep two units (Gun H(e)aven 3 p. 3)
describe("Flamethrower ammo needs", () => {
  it("refuses suppressive fire with fewer than 20 units", () => {
    expect(SR5_ConverterHelpers.missingAmmo("SF", 19)).toBe(true)
    expect(SR5_ConverterHelpers.missingAmmo("SF", 20)).toBe(false)
  })
  it("refuses the sweep with a single unit", () => {
    expect(SR5_ConverterHelpers.missingAmmo("FN", 1)).toBe(true)
    expect(SR5_ConverterHelpers.missingAmmo("FN", 2)).toBe(false)
  })
  it("leaves the other modes alone", () => {
    expect(SR5_ConverterHelpers.missingAmmo("BF", 1)).toBe(false)
  })
})

//Flamethrowers deal Fire damage (Gun H(e)aven 3 p. 3)
describe("Flamethrower trait", () => {
  it("gives the weapon the Fire element", () => {
    const mods = (base = 0) => ({
      base, value: base, modifiers: []
    })
    const data = {
      accessory: [{
        name: "flamethrower", isActive: true
      }],
      damageElement: "",
      price: mods(), concealment: mods(), accuracy: mods(), availability: mods(), damageValue: mods(), weaponSkill: mods(),
    }
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(data.damageElement).toBe("fire")
  })
})

//Vocabulary: "tir de couverture", fuel counted in units, every firing mode label closes its parenthesis
describe("Firing mode labels", () => {
  const source = readFileSync(new URL("../modules/rolls/roll-prepare-case/rollData-Weapon.js", import.meta.url), "utf8")
  it("closes every parenthesis", () => {
    const labels = source.split("\n").filter(l => /lists\.firingModes\.\w+ = `|fanningLabel = `/.test(l))
    expect(labels.length).toBeGreaterThan(8)
    for (const l of labels) expect(l.trim().endsWith("])`")).toBe(true)
  })
  it("counts the flamethrower in units", () => {
    expect(source).toContain('[-${FANNING_AMMO} ${game.i18n.localize("SR5.FuelUnits")}])')
    const fr = JSON.parse(readFileSync(new URL("../lang/fr.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""))
    expect(fr["SR5.FuelUnits"]).toBe("unités")
    expect(JSON.stringify(fr)).not.toMatch(/tir de suppression/i)
  })
})
