import {
  describe, it, expect, beforeEach
} from "vitest"

const {
  isDrugAddiction
} = await import("../modules/rolls/roll-helpers/addiction.js")
const {
  default: addictionTest
} = await import("../modules/rolls/roll-prepare-case/rollData-Addiction.js")

// Drug Tolerance (Chrome Flesh p. 58): "+2 dés à tous ses tests d'addiction (p. 415, SR5) pour les drogues naturelles
// et de synthèse. Il n'obtient cependant aucun bonus quand il tente de se soigner d'une addiction dont il est déjà
// victime". Measured in game (lot 17c): the quality had no effect, and the one dice target there was counted for every
// addiction, foci and blood magic included
const tolerance = {
  source: "Tolérance à la drogue", type: "itemQuality", value: 2
}
const actorWith = (entry) => ({
  items: [{
    type: "itemDrug", name: "Bliss"
  }],
  system: {
    addictions: [entry],
    resistances: {
      addiction: {
        psychological: {
          modifiers: [{
            source: "Logique", type: "linkedAttribute", value: 3
          }, {
            source: "Volonté", type: "linkedAttribute", value: 3
          }]
        }
      }
    },
    specialProperties: {
      drugAddictionResistance: {
        modifiers: [tolerance]
      }
    },
  },
})
const rollData = () => ({
  test: {
  }, dicePool: {
    modifiers: []
  }, threshold: {
  }, various: {
  }
})
const bonus = data => data.dicePool.modifiers.filter(m => m.label === "Tolérance à la drogue").length

beforeEach(() => {
  globalThis.game = {
    ...globalThis.game, i18n: {
      localize: k => k
    }
  }
})

describe("Drug Tolerance on the addiction tests", () => {
  it("adds its dice to the test of a drug addiction", async () => {
    const data = await addictionTest(rollData(), "psychological_0", actorWith({
      name: "Bliss", kind: "drug", addiction: {
        threshold: 3
      }
    }))
    expect(bonus(data)).toBe(1)
  })
  it("not to a focus, nor to blood magic", async () => {
    for (const kind of ["focus", "bloodMagic"]) {
      const data = await addictionTest(rollData(), "psychological_0", actorWith({
        name: "X", kind, addiction: {
          threshold: 2
        }
      }))
      expect(bonus(data)).toBe(0)
    }
  })
  it("not once the character is addicted", async () => {
    const addicted = await addictionTest(rollData(), "psychological_0", actorWith({
      name: "Bliss", kind: "drug", level: "mild", addiction: {
        threshold: 3
      }
    }))
    expect(bonus(addicted)).toBe(0)
  })
  it("an older entry is a drug's when the character carries a drug of that name", () => {
    expect(isDrugAddiction({
      name: "Bliss"
    }, ["Bliss"])).toBe(true)
    expect(isDrugAddiction({
      name: "Focus de sort"
    }, ["Bliss"])).toBe(false)
  })
})
