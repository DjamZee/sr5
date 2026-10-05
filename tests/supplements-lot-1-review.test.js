// Fixes asked by the review of the supplements batch 1 (Yuki, 2026-10-05)
import {
  describe, it, expect, vi
} from "vitest"
import fs from "fs"
import {
  milkBrickPlan, soothe
} from "../modules/entities/items/milkBrick.js"
import {
  addictionWeeks, focusAddictionRating
} from "../modules/rolls/roll-helpers/addiction.js"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
const {
  SR5_CharacterUtility
} = await import("../modules/entities/actors/utilityActor.js")

const fr = JSON.parse(fs.readFileSync(new URL("../lang/fr.json", import.meta.url), "utf8"))

const nausea = {
  id: "n", type: "toxinEffectNausea", toxinType: "csTearGas"
}
const statuses = [{
  id: "sN", origin: "toxinEffectNausea"
}, {
  id: "sX", origin: "noAction"
}]

describe("Brick of milk and the No action of a heavy Nausea (a)", () => {
  it("takes the No action off with the Nausea", () => {
    const plan = milkBrickPlan([nausea], statuses)
    expect(plan.statusIds).toEqual(["sN", "sX"])
  })

  it("leaves it while a Paralysis still puts it there", () => {
    const plan = milkBrickPlan([nausea, {
      id: "p", type: "toxinEffectParalysis", toxinType: "gamma"
    }], statuses)
    expect(plan.statusIds).toEqual(["sN"])
    expect(plan.removed).not.toContain("noAction")
  })

  it("leaves it when no Nausea goes", () => {
    const plan = milkBrickPlan([{
      id: "d", type: "toxinEffectDisorientation", toxinType: "nauseaGas"
    }], statuses)
    expect(plan.statusIds).toEqual([])
  })
})

describe("Brick of milk message names what went (R1)", () => {
  it("lists the removed effects, the No action included", () => {
    expect(milkBrickPlan([nausea, {
      id: "d", type: "toxinEffectDisorientation", toxinType: "csTearGas"
    }], statuses).removed).toEqual(["toxinEffectNausea", "toxinEffectDisorientation", "noAction"])
  })

  it("only the Nausea of Pepper Punch, not the Disorientation of another gas", () => {
    expect(milkBrickPlan([{
      id: "n", type: "toxinEffectNausea", toxinType: "pepperPunch"
    }, {
      id: "d", type: "toxinEffectDisorientation", toxinType: "nauseaGas"
    }], []).removed).toEqual(["toxinEffectNausea"])
  })

  it("the French message has a place for them", () => {
    expect(fr["SR5.MilkBrickUsed"]).toContain("{removed}")
  })
})

describe("Brick of milk on a character not owned (R2)", () => {
  const actor = (isOwner, effects = []) => ({
    name: "X", isOwner, items: effects.map(e => ({
      id: e.id, type: "itemEffect", system: {
        type: e.type
      }, getFlag: () => e.toxinType
    })), effects: [], deleteEmbeddedDocuments: vi.fn(),
  })

  it("is not used, nothing deleted", async () => {
    const a = actor(false, [nausea])
    expect(await soothe(a)).toEqual({
      used: false, itemIds: []
    })
    expect(a.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it("is used, even with nothing to take off", async () => {
    expect((await soothe(actor(true))).used).toBe(true)
    expect(fr["SR5.MilkBrickNothing"]).toMatch(/bue/)
  })

  it("is used and deletes the effect on an owned character", async () => {
    const a = actor(true, [nausea])
    expect(await soothe(a)).toEqual({
      used: true, itemIds: ["n"]
    })
    expect(a.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["n"])
  })
})

describe("Addiction reminder (R3) and coin toss (R5)", () => {
  it("a test is due after 11 − rating weeks of use, never under 1", () => {
    expect(addictionWeeks(7)).toBe(4)
    expect(addictionWeeks(1)).toBe(10)
    expect(addictionWeeks(12)).toBe(1)
  })

  it("the reminder says so", () => {
    expect(fr["SR5.AddictionTestReminder"]).toContain("{weeks} semaines d'usage")
  })

  it("a tie on both is a coin toss (SR5 p. 416)", () => {
    expect(fr["SR5.AddictionBurnoutEither"]).toContain("pile ou face")
  })
})

describe("Drug Resistance note (R4)", () => {
  it("is shown on the addiction test target", () => {
    const template = fs.readFileSync(new URL("../templates/items/_partial/effect/effect.hbs", import.meta.url), "utf8")
    expect(template).toContain("SR5.AddictionResistanceNote")
    expect(fr["SR5.AddictionResistanceNote"]).toMatch(/naturelles et de synthèse/)
  })
})

describe("Focus addiction rating (R6, SR5 p. 416)", () => {
  const focus = (itemRating, isActive) => ({
    type: "itemFocus", system: {
      itemRating, isActive
    }
  })

  it("is the total Force of the active foci", () => {
    expect(focusAddictionRating([focus(3, true), focus(2, true), focus(4, false), {
      type: "itemDrug", system: {
        itemRating: 9, isActive: true
      }
    }])).toBe(5)
  })

  it("goes into the addiction entry, with its weeks", () => {
    const [entry] = SR5_CharacterUtility.generateDrugAddiction({
      name: "Focus", type: "itemFocus", system: {
        itemRating: 3
      }
    }, 5)
    expect(entry.addiction).toEqual({
      type: "psychological", rating: 5, threshold: 2
    })
    expect(entry.weekAddiction.base).toBe(6)
  })
})
