import {
  describe, it, expect, beforeEach
} from "vitest"
import {
  boundCount, dissipationPool, essenceToResist, dissipationEssenceLoss, essenceBaseAfterLoss, depthBaseAfterLoss, isAI,
  dissipationContext
} from "../modules/system/ai-dissipation.js"

describe("AI dissipation (Data Trails p. 161)", () => {
  it("resists with Willpower + Depth, plus the Firewall of a device that is not bricked", () => {
    expect(dissipationPool({
      willpower: 4, depth: 5
    })).toBe(9)
    expect(dissipationPool({
      willpower: 4, depth: 5, firewall: 3
    })).toBe(12)
    expect(dissipationPool({
      willpower: 4, depth: 5, extra: -20
    })).toBe(0)
  })

  it("a bricked device adds its Device Rating to the Essence to resist", () => {
    expect(essenceToResist({
      surplus: 2
    })).toBe(2)
    expect(essenceToResist({
      surplus: 2, bricked: true, deviceRating: 4
    })).toBe(6)
    expect(essenceToResist({
      surplus: 2, bricked: false, deviceRating: 4
    })).toBe(2)
  })

  it("always loses 1 point of Essence, plus each point not resisted", () => {
    expect(dissipationEssenceLoss(0, 0)).toBe(1)
    expect(dissipationEssenceLoss(3, 1)).toBe(3)
    expect(dissipationEssenceLoss(3, 5)).toBe(1)
  })

  it("the Essence never goes below 0, whatever its modifiers", () => {
    expect(essenceBaseAfterLoss({
      base: 6, value: 6
    }, 2)).toBe(4)
    expect(essenceBaseAfterLoss({
      base: 6, value: 2
    }, 5)).toBe(4)
  })

  it("loses 1 point of Depth, down to 1", () => {
    expect(depthBaseAfterLoss({
      natural: {
        base: 5
      }, augmented: {
        value: 5
      }
    })).toBe(4)
    expect(depthBaseAfterLoss({
      natural: {
        base: 1
      }, augmented: {
        value: 1
      }
    })).toBe(1)
  })

  it("what the card hints is bounded: a forged overflow stays a whole number in range", () => {
    expect(boundCount("abc")).toBe(0)
    expect(boundCount(-4)).toBe(0)
    expect(boundCount(1e9)).toBe(50)
    expect(boundCount(3.7)).toBe(3)
  })

  it("an AI is a PC or grunt sheet with Depth active", () => {
    expect(isAI({
      type: "actorPc", system: {
        activeSpecialAttribute: "depth"
      }
    })).toBe(true)
    expect(isAI({
      type: "actorPc", system: {
        activeSpecialAttribute: "magic"
      }
    })).toBe(false)
    expect(isAI({
      type: "actorSpirit", system: {
        activeSpecialAttribute: "depth"
      }
    })).toBe(false)
  })
})

describe("Where the AI was, read by the GM", () => {
  const device = (actorId, base, value = 10) => ({
    type: "itemDevice", name: "Commlink", actor: {
      id: actorId
    }, system: {
      deviceRating: 4, conditionMonitors: {
        matrix: {
          value, actual: {
            base
          }
        }
      }
    }
  })
  const ai = (items = []) => ({
    id: "ai", items
  })
  let store
  beforeEach(() => {
    store = {
    }
    globalThis.fromUuid = async (uuid) => store[uuid] ?? null
  })

  it("a full device of the AI is bricked, with its rating", async () => {
    store.dev = device("ai", 10)
    expect(await dissipationContext(ai(), {
      itemUuid: "dev"
    })).toEqual({
      bricked: true, deviceName: "Commlink", deviceRating: 4, onDevice: true
    })
  })

  it("a device of another actor named by a forged card is not believed", async () => {
    store.dev = device("other", 10)
    expect((await dissipationContext(ai(), {
      itemUuid: "dev"
    })).bricked).toBe(false)
  })

  it("an active device not bricked gives the Firewall; none gives Willpower + Depth only", async () => {
    expect((await dissipationContext(ai([{
      type: "itemDevice", name: "Deck", system: {
        isActive: true
      }
    }]))).onDevice).toBe(true)
    expect((await dissipationContext(ai())).onDevice).toBe(false)
  })
})
