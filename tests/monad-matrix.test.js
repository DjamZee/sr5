import {
  describe, it, expect, vi, afterEach
} from "vitest"

const lookup = vi.hoisted(() => ({
  actor: null
}))
vi.mock("../modules/entities/helpers.js", () => ({
  SR5_EntityHelpers: {
    getRealActorFromID: () => lookup.actor
  }
}))

import {
  monitorSize, corePenalty, activeHeadcase, strainOf, isOriginalStrainMonad, suggestedCoreBoxes, coreAfterDamage,
  authorMayActFor, addMonadCoreButton
} from "../modules/system/monad-matrix.js"
import {
  SR5
} from "../modules/config.js"

const headcase = (strain, isActive = true) => ({
  id: "hc", type: "itemDevice", system: {
    type: "headcase", isActive, strain
  }
})
const monad = (items, active = "nanite", owners = []) => ({
  type: "actorPc", name: "Monade", system: {
    activeSpecialAttribute: active
  }, items,
  testUserPermission: (user) => owners.includes(user.id),
})

describe("Monad matrix monitors (Dark Terrors p. 88)", () => {
  it("are 8 + half the rating, rounded up as for an AI (Data Trails p. 161)", () => {
    expect(monitorSize(0)).toBe(8)
    expect(monitorSize(5)).toBe(11)
    expect(monitorSize(6)).toBe(11)
    expect(monitorSize(-2)).toBe(8)
  })

  it("count the Core as a wound: -1 per full step, after the box reduction", () => {
    expect(corePenalty(0)).toBe(0)
    expect(corePenalty(2)).toBe(0)
    expect(corePenalty(3)).toBe(-1)
    expect(corePenalty(7, 3)).toBe(-2)
    expect(corePenalty(7, 3, 2)).toBe(-1)
    expect(corePenalty(6, 0)).toBe(-2)
  })

  it("put boxes on the Core without going beyond it, the rest being the overflow", () => {
    expect(coreAfterDamage(3, 4, 10)).toEqual({
      base: 7, surplus: 0, full: false
    })
    expect(coreAfterDamage(8, 5, 10)).toEqual({
      base: 10, surplus: 3, full: true
    })
    expect(coreAfterDamage(2, -4, 10).base).toBe(2)
  })
})

describe("The strain is chosen on the head case device (arbitrage de DjamZ, 06/10)", () => {
  it("is Lockdown by default, the behaviour the system had", () => {
    expect(strainOf(headcase(undefined))).toBe("lockdown")
    expect(strainOf(headcase("anything"))).toBe("lockdown")
    expect(strainOf(headcase("darkTerrors"))).toBe("darkTerrors")
    expect(SR5.monadStrains).toEqual({
      lockdown: "SR5.MonadStrainLockdown", darkTerrors: "SR5.MonadStrainDarkTerrors"
    })
  })

  it("makes an original strain Monad only of an active head case, on a Monad", () => {
    expect(isOriginalStrainMonad(monad([headcase("darkTerrors")]))).toBe(true)
    expect(isOriginalStrainMonad(monad([headcase("lockdown")]))).toBe(false)
    expect(isOriginalStrainMonad(monad([headcase("darkTerrors", false)]))).toBe(false)
    expect(isOriginalStrainMonad(monad([headcase("darkTerrors")], "resonance"))).toBe(false)
    expect(activeHeadcase({
      ...monad([headcase("darkTerrors")]), type: "actorSpirit"
    })).toBe(null)
  })
})

describe("The GM's Core button believes nothing of the card", () => {
  afterEach(() => {
    delete globalThis.game
    lookup.actor = null
  })

  it("suggests no more boxes than the attack carried, and never a negative number", () => {
    expect(suggestedCoreBoxes({
      damage: {
        matrix: {
          value: 4, base: 6
        }
      }
    })).toBe(4)
    expect(suggestedCoreBoxes({
      damage: {
        matrix: {
          value: 40, base: 6
        }
      }
    })).toBe(6)
    expect(suggestedCoreBoxes({
      damage: {
        matrix: {
          value: -3, base: 6
        }
      }
    })).toBe(0)
    expect(suggestedCoreBoxes({
    })).toBe(0)
  })

  it("believes a card about a Monad only from a GM or from an owner of that Monad", () => {
    const actor = monad([], "nanite", ["p1"])
    expect(authorMayActFor({
      id: "gm", isGM: true
    }, actor)).toBe(true)
    expect(authorMayActFor({
      id: "p1"
    }, actor)).toBe(true)
    expect(authorMayActFor({
      id: "p2"
    }, actor)).toBe(false)
    expect(authorMayActFor(null, actor)).toBe(false)
  })

  const html = () => {
    const anchor = {
      after: vi.fn()
    }
    return {
      anchor, querySelector: () => anchor
    }
  }
  const card = (authorId) => ({
    id: "m1", author: {
      id: authorId, isGM: false
    }, flags: {
      sr5data: {
        owner: {
          actorId: "a1"
        }, chatCard: {
          buttons: {
            takeMatrixDamage: {
            }
          }
        }, damage: {
          matrix: {
            value: 3, base: 5
          }
        }
      }
    }
  })
  const setGame = (isGM, active) => {
    globalThis.game = {
      user: {
        id: "gm", isGM
      }, users: {
        activeGM: {
          id: active ? "gm" : "other"
        }
      }, i18n: {
        format: (k) => k
      }
    }
  }

  it("is offered to the active GM only", async () => {
    lookup.actor = monad([headcase("darkTerrors")], "nanite", ["p1"])
    for (const [isGM, active] of [[false, false], [true, false]]) {
      setGame(isGM, active)
      const h = html()
      await addMonadCoreButton(card("p1"), h)
      expect(h.anchor.after).not.toHaveBeenCalled()
    }
  })

  it("is not offered on a card forged by a player who does not own the Monad", async () => {
    lookup.actor = monad([headcase("darkTerrors")], "nanite", ["p1"])
    setGame(true, true)
    const h = html()
    await addMonadCoreButton(card("p2"), h)
    expect(h.anchor.after).not.toHaveBeenCalled()
  })

  it("is not offered for a Lockdown head case, whose damage stays Stun", async () => {
    lookup.actor = monad([headcase("lockdown")], "nanite", ["p1"])
    setGame(true, true)
    const h = html()
    await addMonadCoreButton(card("p1"), h)
    expect(h.anchor.after).not.toHaveBeenCalled()
  })

  it("is offered to the active GM on the owner's card while the damage is still to apply", async () => {
    lookup.actor = monad([headcase("darkTerrors")], "nanite", ["p1"])
    setGame(true, true)
    globalThis.document = globalThis.document ?? {
      createElement: () => ({
        classList: {
          add: () => {}
        }, addEventListener: () => {}, dataset: {
        }
      })
    }
    const h = html()
    await addMonadCoreButton(card("p1"), h)
    expect(h.anchor.after).toHaveBeenCalledTimes(1)
  })
})
