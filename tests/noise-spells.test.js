import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  noiseSpellKind, noiseGridThreshold, noiseSpellValue, noiseOverwatchDice, actorNoiseModifier
} from "../modules/system/noise-spells.js"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

describe("Increase / Decrease Noise (Street Grimoire p. 113-114)", () => {
  it("recognises the spells by their French or English name", () => {
    expect(noiseSpellKind({
      name: "Augmentation du bruit"
    })).toBe("increase")
    expect(noiseSpellKind({
      name: "Diminution du Bruit"
    })).toBe("decrease")
    expect(noiseSpellKind({
      name: "Mon sort", flags: {
        sr5: {
          nameVO: "Decrease Noise"
        }
      }
    })).toBe("decrease")
    expect(noiseSpellKind({
      name: "Augmentation de réflexes"
    })).toBe("")
  })

  it("sets the threshold by the grid affected: public 2, local 4, global 6", () => {
    expect(noiseGridThreshold("public")).toBe(2)
    expect(noiseGridThreshold("local")).toBe(4)
    expect(noiseGridThreshold("global")).toBe(6)
    expect(noiseGridThreshold(undefined)).toBe(2)
  })

  it("changes the Noise by the net hits, raised as a positive rating and lowered as a negative one", () => {
    expect(noiseSpellValue("increase", 5, 2)).toBe(3)
    expect(noiseSpellValue("decrease", 5, 4)).toBe(-1)
    expect(noiseSpellValue("increase", 3, 6)).toBe(0)
  })

  it("raises the Overwatch Score by 1D6 per minute per net hit beyond 4", () => {
    expect(noiseOverwatchDice(4)).toBe(0)
    expect(noiseOverwatchDice(6)).toBe(2)
  })

  it("never turns a lowered Noise into bonus dice", () => {
    //range -2, scene -1: a lowered Noise of 5 cancels them, no more
    expect(actorNoiseModifier(5, -2, -1)).toBe(3)
    expect(actorNoiseModifier(2, -2, -1)).toBe(2)
    expect(actorNoiseModifier(3, 0, 0)).toBe(0)
    //a raised Noise stays a malus
    expect(actorNoiseModifier(-3, -2, 0)).toBe(-3)
  })

  it("asks the grid in the spell's dialog and gives the Noise by the spell's template", () => {
    expect(read("templates/rolls/rollDialogPartial/spellOptions.hbs")).toMatch(/data-modifier="noiseGrid"/)
    const dialog = read("modules/rolls/roll-dialog.js")
    expect(dialog.match(/case "noiseGrid":/g)?.length).toBe(2)
    expect(read("modules/system/effectArea.js")).toMatch(/matrixNoise \+= await SR5_EffectArea\.noiseSpellRating/)
    expect(read("modules/interface/canvas-template.js")).toMatch(/noiseSpellKind\(item\) && !flags\.sr5\.itemHasEffect/)
    expect(read("lang/fr.json")).toMatch(/"SR5\.NoiseSpellGrid": "Grille affectée"/)
  })
})
