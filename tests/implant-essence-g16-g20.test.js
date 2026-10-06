import {
  describe, it, expect, afterEach
} from "vitest"
import {
  implantEssenceEffects, implantEssence, essenceAfterPurchase, transhumanGift, essenceHole, implantsEssenceLost,
  installationFlags, GM_ONLY_FIELDS, hasAdapsine, essenceAdjustment
} from "../modules/system/implant-essence.js"
import {
  holeAfterRemoval
} from "../modules/system/essence-hole.js"
import {
  reservedChangedBy, valueAfterUpdate, reservedMismatches
} from "../modules/system/reserved-fields.js"
import {
  expectedAtCreation, expectedValues, reservedFieldsOf
} from "../modules/system/implant-register.js"
import {
  mentorMagic
} from "../modules/entities/items/mentor-spirits.js"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5ShopGrades
} from "../modules/interface/shop-grades.js"

// Séance G (DjamZ, 06/10): G16 Adapsine (Chrome Flesh p. 165), G17 its sum with Biocompatibilité (p. 56), G18 the
// Datajack at 0, G19 Prototype de transhumain (p. 57), G20 Faille d'Essence (p. 74) and lots (p. 96).

const withEffect = (name, value, isActive = true, extra = {
}) => ({
  name, type: "itemQuality", system: {
    isActive, systemEffects: [{
      category: "specialCase", value
    }], ...extra
  }
})
const adapsine = withEffect("Adapsine", "adapsine")
const bioCyber = withEffect("Biocompatibilité (cyberware)", "biocompatibilityCyberware")
const sensitive = withEffect("Système sensible", "doubleEssenceCost")
const prototype = (points = 1) => withEffect("Prototype de transhumain", "transhumanPrototype", true, {
  transhumanEssence: points
})

const implant = (type, base, grade = "standard", extra = {
}) => ({
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
  ...extra,
})
const onActor = (data, items) => {
  SR5_UtilityItem._handleAugmentation(data, {
    items
  })
  return data.essenceCost.value
}
const installed = (type, value, extra = {
}) => ({
  type: "itemAugmentation", name: `${type} ${value}`, system: {
    type, essenceCost: {
      value
    }, ...extra
  }
})

const settings = globalThis.game.settings.get
afterEach(() => {
  globalThis.game.settings.get = settings
})
const withSettings = values => {
  globalThis.game.settings.get = (_scope, key) => values[key] ?? null
}

describe("G16 — Adapsine, on the implants installed under it", () => {
  it("adds 10 % to the grade's reduction: alphaware 1.0 → 0.7 (Chrome Flesh p. 165)", () => {
    expect(onActor(implant("cyberware", 1, "alphaware", {
      underAdapsine: true
    }), [adapsine])).toBe(0.7)
    expect(onActor(implant("cyberware", 2, "standard", {
      underAdapsine: true
    }), [])).toBe(1.8)
  })
  it("does nothing to an implant not marked, even on a body under Adapsine", () => {
    expect(onActor(implant("cyberware", 1, "alphaware"), [adapsine])).toBe(0.8)
  })
  it("leaves bioware alone", () => {
    expect(onActor(implant("bioware", 0.7, "standard", {
      underAdapsine: true
    }), [adapsine])).toBe(0.7)
  })
  it("reads the body: the item with the effect, active or not, unless it is in a storage", () => {
    expect(hasAdapsine([adapsine])).toBe(true)
    expect(hasAdapsine([withEffect("Adapsine", "adapsine", false)])).toBe(true)
    expect(hasAdapsine([withEffect("Adapsine", "adapsine", true, {
      storedIn: "coffre"
    })])).toBe(false)
    expect(hasAdapsine([])).toBe(false)
  })
  it("counts Prototype de transhumain without its box ticked", () => {
    expect(transhumanGift([withEffect("Prototype de transhumain", "transhumanPrototype", false, {
      transhumanEssence: 1
    })])?.points).toBe(1)
  })
  it("shows at the shop what the sheet will take", () => {
    const system = {
      type: "cyberware", grade: "standard", essenceCost: {
        value: 2, base: 2
      }
    }
    for (const grade of ["standard", "alphaware", "betaware", "deltaware", "used"]) {
      for (const items of [[adapsine], [adapsine, bioCyber], [adapsine, sensitive]]) {
        const shown = implantEssence(SR5ShopGrades.essence(system, grade), implantEssenceEffects(items, "cyberware", {
          underAdapsine: true
        }), SR5ShopGrades.row(grade).essence)
        expect(shown).toBe(onActor(implant("cyberware", 2, grade, {
          underAdapsine: true
        }), items))
      }
    }
  })
})

describe("G17 — Adapsine with Biocompatibilité: (grade − 10 %) × 0.9, one rounding down at the end", () => {
  it("alphaware 1.0: (0.8 − 0.1) × 0.9 = 0.63 → 0.6", () => {
    expect(onActor(implant("cyberware", 1, "alphaware", {
      underAdapsine: true
    }), [adapsine, bioCyber])).toBe(0.6)
  })
  it("standard 2: 0.9 × 0.9 × 2 = 1.62 → 1.6, not 1.8 × 0.9 rounded twice", () => {
    expect(onActor(implant("cyberware", 2, "standard", {
      underAdapsine: true
    }), [adapsine, bioCyber])).toBe(1.6)
  })
  it("rounds down to the tenth under Adapsine alone, keeps two decimals without either quality", () => {
    expect(onActor(implant("cyberware", 0.1, "used", {
      underAdapsine: true
    }), [adapsine])).toBe(0.1)
    expect(onActor(implant("cyberware", 0.1, "used"), [])).toBe(0.13)
  })
})

describe("G18 — Datajack at 0 with Biocompatibilité (letter of the book)", () => {
  it("0.1 × 0.9 = 0.09, rounded down to the tenth: 0", () => {
    expect(onActor(implant("cyberware", 0.1), [bioCyber])).toBe(0)
  })
})

describe("G19 — Prototype de transhumain", () => {
  it("counts the gifted bioware against the point, capped", () => {
    expect(transhumanGift([prototype(), installed("bioware", 0.4, {
      transhumanGift: true
    }), installed("bioware", 0.3)])).toEqual({
      name: "Prototype de transhumain", points: 1, used: 0.4, remaining: 0.6
    })
    expect(transhumanGift([prototype(), installed("bioware", 1.2, {
      transhumanGift: true
    })]).used).toBe(1)
    expect(transhumanGift([installed("bioware", 0.4, {
      transhumanGift: true
    })])).toBe(null)
  })
  it("never counts a cyberware, even marked", () => {
    expect(transhumanGift([prototype(), installed("cyberware", 0.5, {
      transhumanGift: true
    })]).used).toBe(0)
  })
  it("gives the Essence back to the body and to the Magic computed early", () => {
    const actor = {
      items: [prototype(), installed("bioware", 0.6, {
        transhumanGift: true
      })], system: {
        essence: {
        }
      }
    }
    expect(essenceAdjustment(actor)).toBe(0.6)
    expect(implantsEssenceLost(actor.items)).toBe(0)
    const magic = {
      natural: {
        base: 5, modifiers: []
      }, augmented: {
        modifiers: []
      }
    }
    const essence = {
      modifiers: [{
        type: "itemAugmentation", value: -0.6
      }]
    }
    expect(mentorMagic(magic, essence, 0)).toBe(4)
    expect(mentorMagic(magic, essence, 0, essenceAdjustment(actor))).toBe(5)
  })
  it("lets the till sell the bioware free at creation only", () => {
    const line = {
      type: "itemAugmentation", name: "Glande", grade: "standard", quantity: 1, system: {
        type: "bioware", grade: "standard", essenceCost: {
          value: 0.8, base: 0.8
        }
      }
    }
    expect(essenceAfterPurchase(6, [prototype()], [line], {
      creation: true
    }).essence).toBe(6)
    expect(essenceAfterPurchase(6, [prototype()], [line]).essence).toBe(5.2)
    expect(essenceAfterPurchase(6, [prototype(0.5)], [line], {
      creation: true
    }).essence).toBe(5.7)
  })
})

describe("installation: the body decides, never the data a player sends", () => {
  const actor = items => ({
    items
  })
  it("marks a cyberware posé sous Adapsine when the body takes it", () => {
    expect(installationFlags(actor([adapsine]), {
      type: "cyberware"
    }).underAdapsine).toBe(true)
    expect(installationFlags(actor([]), {
      type: "cyberware", underAdapsine: true
    }).underAdapsine).toBe(false)
    expect(installationFlags(actor([adapsine]), {
      type: "bioware"
    }).underAdapsine).toBe(false)
    expect(installationFlags(actor([adapsine]), {
      type: "cyberware", storedIn: "abc"
    }).underAdapsine).toBe(false)
  })
  it("gives the bioware in creation mode while the point is not spent", () => {
    expect(installationFlags(actor([prototype()]), {
      type: "bioware"
    }, {
      creation: true
    }).transhumanGift).toBe(true)
    expect(installationFlags(actor([prototype()]), {
      type: "bioware"
    }).transhumanGift).toBe(false)
    expect(installationFlags(actor([prototype(), installed("bioware", 1, {
      transhumanGift: true
    })]), {
      type: "bioware"
    }, {
      creation: true
    }).transhumanGift).toBe(false)
    expect(installationFlags(actor([]), {
      type: "bioware", transhumanGift: true
    }, {
      creation: true
    }).transhumanGift).toBe(false)
  })
  it("refuses a player the lot, keeps the gamemaster's own flags", () => {
    expect(installationFlags(actor([]), {
      type: "cyberware", augmentationBundle: true
    }).augmentationBundle).toBe(false)
    expect(installationFlags(actor([]), {
      type: "cyberware", augmentationBundle: true, underAdapsine: true
    }, {
      isGM: true
    })).toEqual({
      underAdapsine: true, augmentationBundle: true, transhumanGift: false
    })
  })
})

describe("the gamemaster's fields: a player's update read after the merge", () => {
  const implantSource = {
    system: {
      underAdapsine: false, augmentationBundle: false, transhumanGift: false, itemRating: 1
    }
  }
  const actorSource = {
    system: {
      essence: {
        base: 6, holeAmount: 1.8, holeBase: 0.2
      }
    }
  }
  it("sees every form: flat, half-flat, nested", () => {
    for (const changes of [{
      "system.underAdapsine": true
    }, {
      system: {
        underAdapsine: true
      }
    }, {
      system: {
        "underAdapsine": true, itemRating: 2
      }
    }]) expect(reservedChangedBy(implantSource, changes, GM_ONLY_FIELDS.itemAugmentation)).toEqual(["underAdapsine"])
    expect(reservedChangedBy(actorSource, {
      "system.essence": {
        holeAmount: 0
      }
    }, GM_ONLY_FIELDS.actor)).toEqual(["essence.holeAmount"])
    expect(reservedChangedBy(actorSource, {
      system: {
        "essence.holeBase": 5
      }
    }, GM_ONLY_FIELDS.actor)).toEqual(["essence.holeBase"])
  })
  it("sees a replacement (==) and a deletion (-=), flat or nested", () => {
    expect(reservedChangedBy(implantSource, {
      "==system": {
        underAdapsine: true
      }
    }, GM_ONLY_FIELDS.itemAugmentation)).toEqual(["underAdapsine"])
    expect(reservedChangedBy(actorSource, {
      system: {
        "==essence": {
          holeAmount: 0, holeBase: 0, base: 6
        }
      }
    }, GM_ONLY_FIELDS.actor)).toEqual(["essence.holeAmount", "essence.holeBase"])
    expect(reservedChangedBy(actorSource, {
      "system.essence.-=holeAmount": null
    }, GM_ONLY_FIELDS.actor)).toEqual(["essence.holeAmount"])
    expect(reservedChangedBy(actorSource, {
      system: {
        essence: {
          "-=holeAmount": null
        }
      }
    }, GM_ONLY_FIELDS.actor)).toEqual(["essence.holeAmount"])
    expect(reservedChangedBy(actorSource, {
      "system.-=essence": null
    }, GM_ONLY_FIELDS.actor)).toEqual(["essence.holeAmount", "essence.holeBase"])
  })
  it("lets through what changes nothing reserved", () => {
    expect(reservedChangedBy(implantSource, {
      system: {
        itemRating: 3
      }
    }, GM_ONLY_FIELDS.itemAugmentation)).toEqual([])
    expect(reservedChangedBy(actorSource, {
      "==system": {
        essence: {
          base: 6, holeAmount: 1.8, holeBase: 0.2
        }
      }
    }, GM_ONLY_FIELDS.actor)).toEqual([])
    // A deletion of a field already at its default changes nothing
    expect(reservedChangedBy(implantSource, {
      "system.-=underAdapsine": null
    }, GM_ONLY_FIELDS.itemAugmentation)).toEqual([])
    expect(reservedChangedBy({
      system: {
        transhumanEssence: 1
      }
    }, {
      system: {
        transhumanEssence: 1, karmaCost: 10
      }
    }, GM_ONLY_FIELDS.itemQuality)).toEqual([])
  })
  it("reads a merged value the way Foundry merges", () => {
    expect(valueAfterUpdate(actorSource, {
      system: {
        essence: {
          base: 5
        }
      }
    }, "system.essence.holeAmount")).toBe(1.8)
  })
})

describe("the active gamemaster's register", () => {
  const implant = (system, items = []) => ({
    documentName: "Item", type: "itemAugmentation", uuid: "Actor.a.Item.i", id: "i", system,
    parent: {
      items
    }
  })
  it("puts back what differs from the register", () => {
    expect(reservedMismatches({
      underAdapsine: true, augmentationBundle: false
    }, {
      underAdapsine: false, augmentationBundle: false
    })).toEqual({
      underAdapsine: false
    })
    expect(reservedMismatches({
      "essence.holeAmount": 0, "essence.holeBase": 0
    }, {
      "essence.holeAmount": 1.8, "essence.holeBase": 0.2
    })).toEqual({
      "essence.holeAmount": 1.8, "essence.holeBase": 0.2
    })
  })
  it("works out a player's implant again from the body, without the implant itself", () => {
    expect(expectedAtCreation(implant({
      type: "cyberware", underAdapsine: true, augmentationBundle: true
    }), GM_ONLY_FIELDS.itemAugmentation)).toEqual({
      underAdapsine: false, augmentationBundle: false, transhumanGift: false
    })
    expect(expectedAtCreation(implant({
      type: "cyberware"
    }, [adapsine]), GM_ONLY_FIELDS.itemAugmentation).underAdapsine).toBe(true)
  })
  it("expects the register's values, else what a document holds at its defaults", () => {
    const doc = implant({
      type: "cyberware", underAdapsine: true
    }, [adapsine])
    expect(expectedValues(doc, GM_ONLY_FIELDS.itemAugmentation, {
      "Actor.a.Item.i": {
        underAdapsine: false, augmentationBundle: false, transhumanGift: false
      }
    }).underAdapsine).toBe(false)
    // Unknown to the register: a box at its default is kept, a box set is worked out again from the body
    expect(expectedValues(implant({
      type: "cyberware", augmentationBundle: true
    }), GM_ONLY_FIELDS.itemAugmentation, {
    }).augmentationBundle).toBe(false)
    expect(expectedValues(doc, GM_ONLY_FIELDS.itemAugmentation, {
    }).underAdapsine).toBe(true)
    expect(reservedFieldsOf({
      documentName: "Actor", system: {
        essence: {
        }
      }
    })).toEqual(GM_ONLY_FIELDS.actor)
    expect(reservedFieldsOf({
      documentName: "Actor", system: {
      }
    })).toEqual([])
  })
})

describe("G20 — Faille d'Essence (Chrome Flesh p. 74)", () => {
  it("keeps what a removed implant took, filled by the implants installed afterwards", () => {
    // 3 points of implants, one of 1 removed: hole 1 above a base of 2
    const essence = holeAfterRemoval({
      holeAmount: 0, holeBase: 0
    }, 3, 2)
    expect(essence).toEqual({
      holeAmount: 1, holeBase: 2
    })
    expect(essenceHole(essence, 2)).toBe(1)
    expect(essenceHole(essence, 2.4)).toBe(0.6)
    expect(essenceHole(essence, 3.5)).toBe(0)
  })
  it("opens no hole when an implant is made cheaper in place", () => {
    expect(essenceHole({
      holeAmount: 1, holeBase: 2
    }, 1.5)).toBe(1)
  })
  it("adds a second removal to what is left of the first", () => {
    const first = holeAfterRemoval({
      holeAmount: 0, holeBase: 0
    }, 3, 2)
    // 0.4 installed (hole 0.6 left), then an implant of 0.5 removed
    expect(holeAfterRemoval(first, 2.4, 1.9)).toEqual({
      holeAmount: 1.1, holeBase: 1.9
    })
  })
  it("lets the till fill the hole before taking Essence", () => {
    const line = {
      type: "itemAugmentation", name: "Datajack", grade: "standard", quantity: 1, system: {
        type: "cyberware", grade: "standard", essenceCost: {
          value: 0.5, base: 0.5
        }
      }
    }
    expect(essenceAfterPurchase(4, [], [line], {
      hole: 0.3
    }).essence).toBe(3.8)
    expect(essenceAfterPurchase(4, [], [line], {
      hole: 1
    }).essence).toBe(4)
  })
  it("without the rule, the hole stays whole: lost Essence does not come back (SR5 p. 53, H22)", () => {
    // 1 point removed above a base of 1, then 0.5 installed
    const actor = {
      items: [installed("cyberware", 1.5)], system: {
        essence: {
          holeAmount: 1, holeBase: 1
        }
      }
    }
    withSettings({
    })
    expect(essenceAdjustment(actor)).toBe(-1)
    withSettings({
      sr5EssenceHole: true
    })
    expect(essenceAdjustment(actor)).toBe(-0.5)
  })
  it("without the rule, a second removal adds to the whole hole", () => {
    expect(holeAfterRemoval({
      holeAmount: 1, holeBase: 2
    }, 2.4, 1.9, false)).toEqual({
      holeAmount: 1.5, holeBase: 1.9
    })
  })
  it("costs an actor saved before nothing: no hole until the next removal", () => {
    const actor = {
      items: [installed("cyberware", 2)], system: {
        essence: {
        }
      }
    }
    withSettings({
    })
    expect(essenceAdjustment(actor)).toBe(0)
  })
})

describe("G20 — lots d'augmentations (Chrome Flesh p. 96)", () => {
  it("× 0.9 on a marked implant, with its world setting on only", () => {
    withSettings({
      sr5AugmentationBundles: true
    })
    expect(onActor(implant("cyberware", 1, "standard", {
      augmentationBundle: true
    }), [])).toBe(0.9)
    withSettings({
    })
    expect(onActor(implant("cyberware", 1, "standard", {
      augmentationBundle: true
    }), [])).toBe(1)
  })
})
