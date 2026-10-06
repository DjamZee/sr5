import {
  describe, it, expect
} from "vitest"
import {
  implantEssenceEffects, roundImplantEssence, implantEssence, implantFamily, essenceAfterPurchase
} from "../modules/system/implant-essence.js"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5ShopGrades
} from "../modules/interface/shop-grades.js"
import {
  SR5Shop
} from "../modules/interface/shop.js"

// Chrome Flesh p. 56 (Biocompatibilité): the Essence cost of the chosen type is reduced by 10 %, rounded down to
// the tenth, on top of the grade (alphaware 0.8 → 0.72 → 0.7). SR5 p. 89 (Système sensible): the Essence lost
// to cyberware is doubled, and bioware is rejected.

const quality = (name, value, isActive = true) => ({
  name, type: "itemQuality", system: {
    isActive, systemEffects: [{
      category: "specialCase", value
    }]
  }
})
const sensitive = quality("Système sensible", "doubleEssenceCost")
const bioCyber = quality("Biocompatibilité (cyberware)", "biocompatibilityCyberware")
const bioBio = quality("Biocompatibilité (bioware)", "biocompatibilityBioware")

const implant = (type, base, grade = "standard") => ({
  type, grade, isRatingBased: false, itemRating: 0, category: "",
  essenceCost: {
    base, modifiers: [], multiplier: ""
  },
  price: {
    base: 1000, modifiers: [], multiplier: ""
  },
  availability: {
    base: 4, modifiers: [], multiplier: ""
  },
  capacity: {
    base: 0, modifiers: [], multiplier: ""
  },
  capacityTaken: {
    base: 0, modifiers: [], multiplier: ""
  },
})
const onActor = (data, items) => {
  SR5_UtilityItem._handleAugmentation(data, {
    items
  })
  return data.essenceCost.value
}

describe("implant families", () => {
  it("counts nanocybernetics as cyberware and cultured bioware as bioware", () => {
    expect(implantFamily("cyberware")).toBe("cyberware")
    expect(implantFamily("nanocyber")).toBe("cyberware")
    expect(implantFamily("bioware")).toBe("bioware")
    expect(implantFamily("culturedBioware")).toBe("bioware")
    expect(implantFamily("genetech")).toBe(null)
  })
})

describe("Système sensible (SR5 p. 89)", () => {
  it("doubles cyberware only", () => {
    expect(onActor(implant("cyberware", 2), [sensitive])).toBe(4)
    expect(onActor(implant("genetech", 0.2), [sensitive])).toBe(0.2)
  })
  it("rejects bioware, cultured or not", () => {
    expect(implantEssenceEffects([sensitive], "bioware").rejectedBy).toBe("Système sensible")
    expect(implantEssenceEffects([sensitive], "culturedBioware").rejectedBy).toBe("Système sensible")
    expect(implantEssenceEffects([sensitive], "cyberware").rejectedBy).toBe(null)
  })
  it("does nothing while the quality is inactive", () => {
    expect(onActor(implant("cyberware", 2), [quality("Système sensible", "doubleEssenceCost", false)])).toBe(2)
  })
})

describe("Biocompatibilité (Chrome Flesh p. 56)", () => {
  it("takes 10 % off the chosen type, after the grade, rounded down to the tenth", () => {
    expect(onActor(implant("cyberware", 1, "alphaware"), [bioCyber])).toBe(0.7)
    expect(onActor(implant("cyberware", 2), [bioCyber])).toBe(1.8)
    expect(onActor(implant("cyberware", 2, "alphaware"), [bioCyber])).toBe(1.4)
    expect(onActor(implant("bioware", 0.7), [bioBio])).toBe(0.6)
  })
  it("leaves the other type alone", () => {
    expect(onActor(implant("bioware", 0.7), [bioCyber])).toBe(0.7)
    expect(onActor(implant("cyberware", 2, "alphaware"), [bioBio])).toBe(1.6)
  })
  it("keeps two decimals when no quality applies", () => {
    expect(onActor(implant("cyberware", 0.1, "used"), [])).toBe(0.13)
  })
  it("rounds without float noise", () => {
    expect(roundImplantEssence(1.8000000000000003, {
      roundDownTenth: true
    })).toBe(1.8)
    expect(roundImplantEssence(0.72, {
      roundDownTenth: true
    })).toBe(0.7)
  })
})

describe("the shop shows what the sheet will take", () => {
  it("one function for both", () => {
    const system = {
      type: "cyberware", grade: "standard", essenceCost: {
        value: 2, base: 2
      }
    }
    for (const items of [[], [sensitive], [bioCyber], [sensitive, bioCyber]]) {
      const shown = implantEssence(SR5ShopGrades.essence(system, "alphaware"), implantEssenceEffects(items, "cyberware"))
      expect(shown).toBe(onActor(implant("cyberware", 2, "alphaware"), items))
    }
  })
})

describe("the till (SR5 p. 54, p. 89)", () => {
  const reflexes = {
    type: "itemAugmentation", name: "Réflexes câblés (3)", system: {
      type: "cyberware", grade: "standard", essenceCost: {
        value: 5, base: 5
      }
    }, grade: "standard", quantity: 2
  }
  const buyer = (essence, items = []) => ({
    name: "Essai", items, system: {
      essence: {
        value: essence
      }
    }
  })
  it("refuses a player a purchase that takes Essence to 0 or below, and says why", async () => {
    const warned = []
    const ok = await SR5Shop.essenceAllows(buyer(6), [reflexes], {
      isGM: false, warn: key => warned.push(key)
    })
    expect(ok).toBe(false)
    expect(warned).toEqual(["SR5.WARN_ShopEssenceTooLow"])
  })
  it("lets a player buy while Essence stays above 0", async () => {
    expect(await SR5Shop.essenceAllows(buyer(6), [{
      ...reflexes, quantity: 1
    }], {
      isGM: false, warn: () => {}
    })).toBe(true)
  })
  it("asks the gamemaster, who may go past it", async () => {
    const asked = []
    globalThis.foundry.applications.api.DialogV2 = {
      confirm: async options => {
        asked.push(options)
        return true
      }
    }
    expect(await SR5Shop.essenceAllows(buyer(6), [reflexes], {
      isGM: true
    })).toBe(true)
    expect(asked).toHaveLength(1)
    globalThis.foundry.applications.api.DialogV2.confirm = async () => null
    expect(await SR5Shop.essenceAllows(buyer(6), [reflexes], {
      isGM: true
    })).toBe(false)
    delete globalThis.foundry.applications.api.DialogV2
  })
  it("leaves alone an actor without Essence", async () => {
    expect(await SR5Shop.essenceAllows({
      items: [], system: {
      }
    }, [reflexes], {
      isGM: false, warn: () => {}
    })).toBe(true)
  })
  it("rejects bioware for a sensitive buyer, read on the buyer", () => {
    const warned = []
    const glande = {
      type: "itemAugmentation", name: "Glande", system: {
        type: "bioware"
      }
    }
    expect(SR5Shop.rejectedImplant(buyer(6, [sensitive]), glande, key => warned.push(key))).toBe(true)
    expect(warned).toEqual(["SR5.WARN_ImplantRejected"])
    expect(SR5Shop.rejectedImplant(buyer(6, []), glande, () => {})).toBe(false)
    expect(SR5Shop.rejectedImplant(buyer(6, [sensitive]), {
      ...glande, system: {
        type: "cyberware"
      }
    }, () => {})).toBe(false)
  })
})

describe("Essence left after a purchase (SR5 p. 54: at 0, death)", () => {
  const items = [sensitive]
  it("adds up the lines at the buyer's own cost", () => {
    const lines = [{
      type: "itemAugmentation", system: {
        type: "cyberware", grade: "standard", essenceCost: {
          value: 2, base: 2
        }
      }, grade: "standard", quantity: 1
    }]
    expect(essenceAfterPurchase(6, items, lines)).toEqual({
      essence: 2, rejected: []
    })
  })
  it("names the bioware a sensitive body rejects", () => {
    const lines = [{
      type: "itemAugmentation", name: "Glande", system: {
        type: "bioware", grade: "standard", essenceCost: {
          value: 0.7, base: 0.7
        }
      }, grade: null, quantity: 1
    }]
    expect(essenceAfterPurchase(6, items, lines).rejected).toEqual(["Glande"])
  })
  it("ignores what is not an implant, and accessories", () => {
    expect(essenceAfterPurchase(6, items, [{
      type: "itemGear", system: {
      }, quantity: 3
    }, {
      type: "itemAugmentation", system: {
        type: "cyberware", isAccessory: true, essenceCost: {
          value: 1
        }
      }, quantity: 1
    }]).essence).toBe(6)
  })
})
