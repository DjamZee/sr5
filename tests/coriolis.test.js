import {
  describe, it, expect
} from "vitest"
import {
  coriolisExtendedTest
} from "../modules/rolls/roll-prepare-case/rollData-ComplexForm.js"
import {
  complexFormSubType
} from "../modules/rolls/roll-helpers/matrix-card.js"

// Coriolis (Chrome Flesh p. 27): « Faites un test étendu de Logiciel + Résonance [Niveau] (5, 24 heures) pour
// éjecter le fragment de personnalité. »

const rollData = () => ({
  test: {
    isExtended: false, extended: {
      interval: "", multiplier: 1
    }
  },
  threshold: {
    value: 0
  },
  dialogSwitch: {
  },
})

describe("Coriolis (Chrome Flesh p. 27)", () => {
  it("opens the threading as an extended test, threshold 5, every 24 hours", () => {
    const data = coriolisExtendedTest(rollData())
    expect(data.test.typeSub).toBe("coriolis")
    expect(data.threshold.value).toBe(5)
    expect(data.test.isExtended).toBe(true)
    expect(data.test.extended).toEqual({
      interval: "hour", multiplier: 24
    })
    expect(data.dialogSwitch.extended).toBe(true)
  })

  it("is the sub type the card reads on the item", () => {
    expect(complexFormSubType({
      system: {
        systemEffects: [{
          value: "sre_Coriolis"
        }]
      }
    })).toBe("coriolis")
  })
})
