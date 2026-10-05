import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_Toxins
} from "../modules/entities/items/toxins.js"

// Chrome Flesh p. 154: an antitoxin "protège également des effets de l'alcool, de la caféine et d'autres
// drogues : divisez la durée d'effet par l'indice de l'antitoxine". Two antitoxins: the highest rating
// (DjamZ's ruling, already used for the toxins' Power). Divisions round up (SR5 p. 50).

const runner = antitoxins => ({
  attributes: {
    body: {
      augmented: {
        value: 3
      }
    }
  },
  specialProperties: {
    antitoxin: {
      modifiers: antitoxins.map(value => ({
        source: "Antitoxine", type: "itemNanoware", value
      }))
    }
  },
})

const zone = {
  value: "zone"
}

describe("a drug's duration under an antitoxin", () => {
  it("lasts its full duration without one", async () => {
    const stat = await SR5_CharacterUtility.handleDrugShots({
      system: {
      }
    }, zone, runner([]))
    expect(stat.duration).toBe(9)
  })

  it("is divided by the highest rating, rounded up", async () => {
    const stat = await SR5_CharacterUtility.handleDrugShots({
      system: {
      }
    }, zone, runner([2, 4]))
    expect(stat.duration).toBe(3)
  })

  it("leaves the crash alone and never goes below 1", () => {
    expect(SR5_Toxins.drugDuration(1, 9)).toBe(1)
    expect(SR5_Toxins.drugDuration(10, 3)).toBe(4)
    expect(SR5_Toxins.drugDuration(10, 1)).toBe(10)
  })
})
