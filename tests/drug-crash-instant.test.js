import {
  describe, it, expect, vi, beforeEach
} from "vitest"

//Liesel's D3 and D5 (06/10): a crash that is only damage (Cram, SR5 p. 412) never ended; the interaction 11-13 (Chrome
//Flesh p. 197) applied nothing
vi.mock("../modules/config.js", () => ({
  SR5: {
    extendedIntervals: {
      hour: "SR5.Hours"
    }, drugs: {
      cram: "SR5.Cram"
    }
  }
}))
vi.mock("../modules/rolls/roll-prepare.js", () => ({
  SR5_PrepareRollTest: {
    getBaseRollData: () => ({
      damage: {
      }
    })
  }
}))

const {
  startDrugCrash, crashDamageType
} = await import("../modules/entities/items/drug-crash.js")
const {
  drugCrashIsInstant
} = await import("../modules/entities/items/drug-stat.js")
const {
  phaseEnd
} = await import("../modules/system/drug-clock.js")

beforeEach(() => {
  globalThis.game = {
    i18n: {
      localize: k => k, format: k => k
    }
  }
  globalThis.ui = {
    notifications: {
      info: vi.fn()
    }
  }
})

const cram = (extra = {
}) => ({
  phase: "rise", isActive: true, wirelessTurnedOn: false, interact: true,
  //The damage is read off the drug key (drug-damage.js)
  systemEffects: {
    0: {
      category: "drug", value: extra.name ?? "cram"
    }
  },
  onUse: {
    duration: "8 SR5.Hours", contrecoup: ""
  },
  handleShot: {
    name: "cram", duration: 8, durationType: "hour", ...extra
  },
  customEffects: {
  },
})
const owner = () => ({
  name: "Razor", takeDamage: vi.fn(), rollTest: vi.fn()
})

describe("drugCrashIsInstant", () => {
  it("a crash of damage alone, without duration nor crash effect", () => {
    expect(drugCrashIsInstant(cram())).toBe(true)
  })
  it("not with a crash duration, nor with an effect of the crash", () => {
    expect(drugCrashIsInstant(cram({
      durationContrecoup: 2, durationContrecoupType: "hour"
    }))).toBe(false)
    expect(drugCrashIsInstant({
      ...cram(), customEffects: {
        0: {
          phase: "crash"
        }
      }
    })).toBe(false)
  })
})

describe("the crash of the Cram", () => {
  it("deals its 6S, then the drug is no longer taken", async () => {
    const actor = owner(), data = cram()
    await startDrugCrash(data, actor)
    expect(actor.takeDamage.mock.calls[0][0].damage).toEqual({
      value: 6, type: "stun"
    })
    expect(data).toMatchObject({
      phase: "", isActive: false, wirelessTurnedOn: false, interact: false
    })
  })
  it("a Cram left in its crash before gets its card at once", () => {
    expect(phaseEnd({
      ...cram(), phase: "crash"
    }, {
      crashStart: 1000
    })).toBe(1000)
  })
  it("after an interaction of 11 to 13, its crash deals Physical damage", async () => {
    const actor = owner(), data = cram({
      crashPhysical: true
    })
    await startDrugCrash(data, actor)
    expect(actor.takeDamage.mock.calls[0][0].damage.type).toBe("physical")
    expect(crashDamageType({
    })).toBe("stun")
  })
  it("a resisted crash (Hurlg) is Physical too after it", async () => {
    const actor = owner(), data = cram({
      name: "hurlg", crashPhysical: true
    })
    await startDrugCrash(data, actor)
    expect(actor.rollTest.mock.calls[0][2].damage).toMatchObject({
      value: 9, type: "physical"
    })
  })
})
