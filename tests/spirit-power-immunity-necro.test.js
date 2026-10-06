import {
  describe, it, expect, vi
} from "vitest"
import {
  readFileSync
} from "node:fs"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5
} from "../modules/config.js"

// Two Immunities in the books: the shedims' (Grimoire des Ombres p. 93: age, pathogens, toxins), key immunity,
// and the necro spirits' (Arcanes Interdites p. 50: normal weapons, pathogens, toxins), key immunityNecro. A
// spirit gets a power by its key: one key for both would give each kind the other's.
const lang = file => JSON.parse(readFileSync(new URL(`../lang/${file}`, import.meta.url), "utf8"))

describe("the necro spirits' Immunity", () => {
  it("is a power of its own, named in both languages", () => {
    expect(SR5.AllSpiritPowers.immunityNecro).toBe("SR5.SpiritPowerImmunityNecro")
    expect(lang("fr.json")["SR5.SpiritPowerImmunityNecro"]).toBe("Immunité (armes normales, pathogènes, toxines)")
    expect(lang("en.json")["SR5.SpiritPowerImmunityNecro"]).toBeTruthy()
  })

  // Cyprien, measured: the Queen/Mother got Evanescence once the key existed. Her only weakness is the
  // Allergy (Grimoire des Ombres p. 100); the other insect spirits and the shedims keep theirs (p. 93, 98-99)
  it("Evanescence goes to the insect spirits and the shedims, not to the Queen", () => {
    expect(Object.keys(SR5.spiritBasePowersinsectQueen)).not.toContain("evanescence")
    expect(Object.keys(SR5.spiritBasePowersinsectQueen)).toContain("allergyInsecticides")
    for (const type of ["insectCaretaker", "insectNymph", "insectScout", "insectSoldier", "insectWorker", "shedim", "shedimMaster"]) {
      expect(Object.keys(SR5[`spiritBasePowers${type}`]), type).toContain("evanescence")
    }
  })

  it("leaves the shedims with theirs", () => {
    expect(Object.keys(SR5.spiritBasePowersshedim)).toContain("immunity")
    expect(Object.keys(SR5.spiritBasePowersshedimMaster)).toContain("immunity")
    expect(Object.keys(SR5.spiritBasePowersshedim)).not.toContain("immunityNecro")
  })
})
