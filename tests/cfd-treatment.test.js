import {
  describe, it, expect
} from "vitest"
import {
  overwriterRating, overwriterPools, resolveOverwriterRound, runOverwriters, nanoscrubDue, sideEffectOf,
  baseEssence, cyberwareAtRisk, nanowareToDecay, overwriteDeadline, overwriterDecayDue, endsCombatTurn, HOUR, DAY
} from "../modules/system/cfd-treatment.js"

describe("Overwriters (Dark Terrors p. 87)", () => {
  it("one dose is Rating 1, an aerosol halves the Rating, rounded down", () => {
    expect(overwriterRating(3, "injection")).toBe(3)
    expect(overwriterRating(3, "aerosol")).toBe(1)
    expect(overwriterRating(1, "aerosol")).toBe(0)
    expect(overwriterRating(0, "injection")).toBe(0)
  })

  it("rolls Rating x 2 [Rating] against Nanite Volume x 2", () => {
    expect(overwriterPools(4, 5)).toEqual({
      own: 8, limit: 4, nanite: 10
    })
  })

  it("net hits lower the other side by 1 each, never below 0", () => {
    expect(resolveOverwriterRound({
      rating: 4, nanite: 5
    }, 3, 1)).toMatchObject({
      rating: 4, nanite: 3, cured: false, spent: false
    })
    expect(resolveOverwriterRound({
      rating: 2, nanite: 5
    }, 0, 4)).toMatchObject({
      rating: 0, nanite: 5, spent: true
    })
    expect(resolveOverwriterRound({
      rating: 4, nanite: 1
    }, 3, 0)).toMatchObject({
      nanite: 0, cured: true
    })
    // A tie changes nothing
    expect(resolveOverwriterRound({
      rating: 3, nanite: 3
    }, 2, 2)).toMatchObject({
      rating: 3, nanite: 3, cured: false, spent: false
    })
  })

  it("rounds follow one another until one side falls to 0", async () => {
    // The treatment always wins by 1: Volume 3 is gone in three rounds
    const rounds = await runOverwriters({
      rating: 5, nanite: 3
    }, async () => ({
      own: 2, nanite: 1
    }))
    expect(rounds.length).toBe(3)
    expect(rounds.at(-1)).toMatchObject({
      nanite: 0, cured: true
    })
  })

  it("only the end of a Combat Turn actually played counts: not the start of the combat, not a step back", () => {
    expect(endsCombatTurn(0, 1)).toBe(false)
    expect(endsCombatTurn(undefined, 1)).toBe(false)
    expect(endsCombatTurn(1, 2)).toBe(true)
    expect(endsCombatTurn(3, 2)).toBe(false)
  })

  it("never loops for ever on ties", async () => {
    const rounds = await runOverwriters({
      rating: 2, nanite: 2
    }, async () => ({
      own: 1, nanite: 1
    }), 10)
    expect(rounds.length).toBe(10)
  })

  it("a leftover Overwriter loses 1 Rating a day once the infection is gone", () => {
    const entry = {
      rating: 3, curedAt: 1000
    }
    expect(overwriterDecayDue(entry, 1000 + DAY - 1)).toMatchObject({
      rating: 3
    })
    expect(overwriterDecayDue(entry, 1000 + 2 * DAY)).toMatchObject({
      rating: 1, days: 2
    })
    expect(overwriterDecayDue(entry, 1000 + 9 * DAY)).toMatchObject({
      rating: 0
    })
  })
})

describe("NanoScrub (Dark Terrors p. 87)", () => {
  const start = 10000

  it("nothing happens in the first hour", () => {
    expect(nanoscrubDue({
      rating: 3, injectedAt: start, hoursDone: 0
    }, start + HOUR - 1)).toMatchObject({
      ticks: 0, hoursDone: 0, rating: 3
    })
  })

  it("an hour after the injection, then every full hour, one tick; the Rating drops from the second hour", () => {
    // Rating 3: ticks at 1 h (3), 2 h (2), 3 h (1); at 4 h it is 0 and spent
    const e = {
      rating: 3, injectedAt: start, hoursDone: 0
    }
    expect(nanoscrubDue(e, start + HOUR)).toMatchObject({
      ticks: 1, hoursDone: 1, rating: 3, finished: false
    })
    expect(nanoscrubDue(e, start + 2 * HOUR)).toMatchObject({
      ticks: 2, rating: 2
    })
    expect(nanoscrubDue(e, start + 10 * HOUR)).toMatchObject({
      ticks: 3, rating: 0, finished: true
    })
  })

  it("picks up where the last check stopped", () => {
    // A Rating 2 dose, checked at 2 h: it is down to 1 and has worked twice. At 3 h it is spent
    expect(nanoscrubDue({
      rating: 1, injectedAt: start, hoursDone: 2
    }, start + 5 * HOUR)).toMatchObject({
      ticks: 0, rating: 0, finished: true
    })
    // A Rating 3 dose checked at 1 h works twice more
    expect(nanoscrubDue({
      rating: 3, injectedAt: start, hoursDone: 1
    }, start + 5 * HOUR)).toMatchObject({
      ticks: 2, rating: 0, finished: true
    })
  })

  it("one die per Rating for the side effects: glitch hits the implants, a critical glitch fails", () => {
    expect(sideEffectOf({
      glitchRoll: false, criticalGlitchRoll: false
    })).toBe("none")
    expect(sideEffectOf({
      glitchRoll: true, criticalGlitchRoll: false
    })).toBe("glitch")
    expect(sideEffectOf({
      glitchRoll: false, criticalGlitchRoll: true
    })).toBe("critical")
  })

  it("the host is overwritten in (10 - Volume) days, at least 1", () => {
    expect(overwriteDeadline(0, 4)).toBe(6 * DAY)
    expect(overwriteDeadline(0, 12)).toBe(DAY)
  })
})

describe("what the NanoScrub reaches", () => {
  const aug = (id, type, category, base, extra = {
  }) => ({
    id, type: "itemAugmentation", system: {
      type, category, itemRating: extra.rating ?? 0, essenceCost: {
        base, multiplier: extra.multiplier ?? ""
      }, capacity: {
        value: extra.capacity ?? 0
      }
    }
  })

  it("reads the base Essence before grade and qualities", () => {
    expect(baseEssence(aug("a", "cyberware", "headware", 0.1).system)).toBeCloseTo(0.1)
    expect(baseEssence(aug("a", "cyberware", "eyeware", 0.1, {
      multiplier: "rating", rating: 3
    }).system)).toBeCloseTo(0.3)
    expect(baseEssence(aug("a", "cyberware", "eyeware", 0.05, {
      multiplier: "capacity", capacity: 4
    }).system)).toBeCloseTo(0.2)
  })

  it("a glitch reaches cranial, eye and ear cyberware whose base Essence is below Rating / 10", () => {
    const items = [
      aug("head", "cyberware", "headware", 0.1),
      aug("eye", "cyberware", "eyeware", 0.2),
      aug("ear", "cyberware", "earware", 0.3),
      aug("arm", "cyberware", "cyberlimbs", 0.1),
      aug("bio", "bioware", "headware", 0.1),
      {
        id: "gun", type: "itemWeapon", system: {
        }
      },
    ]
    expect(cyberwareAtRisk(items, 3).map(i => i.id)).toEqual(["head", "eye"])
    // Strictly below: 0.3 is not below 3 / 10
    expect(cyberwareAtRisk(items, 3).map(i => i.id)).not.toContain("ear")
    expect(cyberwareAtRisk(items, 1)).toEqual([])
  })

  it("every other nanoware loses 1 Rating an hour, the ones at 0 are left alone", () => {
    const items = [
      aug("n1", "nanocyber", "", 0, {
        rating: 2
      }),
      aug("n2", "hardNanoware", "", 0, {
        rating: 1
      }),
      aug("n3", "softNanoware", "", 0, {
        rating: 0
      }),
      aug("c1", "cyberware", "headware", 0.1, {
        rating: 3
      }),
    ]
    expect(nanowareToDecay(items, 1)).toEqual([{
      id: "n1", rating: 1
    }, {
      id: "n2", rating: 0
    }])
    expect(nanowareToDecay(items, 2)).toEqual([{
      id: "n1", rating: 0
    }, {
      id: "n2", rating: 0
    }])
  })
})
