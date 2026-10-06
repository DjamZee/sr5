import {
  describe, it, expect, afterEach
} from "vitest"
import {
  hasDefragmentation, targetKind, targetStrength, deactivationPool, bestMethod, resolveDeactivation,
  deactivationFading, fadingIsPhysical, activateDeactivationListeners
} from "../modules/system/deactivation.js"

const val = (v) => ({
  augmented: {
    value: v
  }
})

function tm({
  charisma = 4, willpower = 5, resonance = 6, decompiling = 0, penalties = {
  }, social = 6, echo = "Défragmentation"
} = {
}){
  return {
    type: "actorPc",
    items: echo ? [{
      type: "itemEcho", name: echo
    }] : [],
    system: {
      attributes: {
        charisma: val(charisma), willpower: val(willpower)
      },
      specialAttributes: {
        resonance: val(resonance)
      },
      skills: {
        decompiling: {
          rating: {
            value: decompiling
          }
        }
      },
      penalties,
      limits: {
        socialLimit: {
          value: social
        }
      },
    }
  }
}

describe("Defragmentation echo (Dark Terrors p. 89)", () => {
  it("is found by its name, in French or in English, on an echo only", () => {
    expect(hasDefragmentation(tm())).toBe(true)
    expect(hasDefragmentation(tm({
      echo: "Defragmentation"
    }))).toBe(true)
    expect(hasDefragmentation(tm({
      echo: "Aegis"
    }))).toBe(false)
    expect(hasDefragmentation({
      items: [{
        type: "itemQuality", name: "Défragmentation"
      }]
    })).toBe(false)
  })
})

describe("Deactivation (Dark Terrors p. 89-90)", () => {
  it("targets an AI (Depth) or a Monad (Nanite Volume) and nothing else", () => {
    expect(targetKind({
      type: "actorPc", system: {
        activeSpecialAttribute: "depth"
      }
    })).toBe("ai")
    expect(targetKind({
      type: "actorGrunt", system: {
        activeSpecialAttribute: "nanite"
      }
    })).toBe("monad")
    expect(targetKind({
      type: "actorPc", system: {
        activeSpecialAttribute: "resonance"
      }
    })).toBe(null)
    expect(targetKind({
      type: "actorSprite", system: {
        activeSpecialAttribute: "depth"
      }
    })).toBe(null)
  })

  it("reads the Depth of an AI and the MEC of a Monad, never the Nanite Volume", () => {
    expect(targetStrength({
      type: "actorPc", system: {
        activeSpecialAttribute: "depth", specialAttributes: {
          depth: val(3)
        }
      }
    })).toBe(3)
    expect(targetStrength({
      type: "actorPc", system: {
        activeSpecialAttribute: "nanite", specialAttributes: {
          nanite: val(7), cem: val(4)
        }
      }
    })).toBe(4)
    expect(targetStrength({
      type: "actorPc", system: {
        activeSpecialAttribute: "nanite", specialAttributes: {
          nanite: val(7)
        }
      }
    })).toBe(0)
  })

  it("rolls Charisma + Willpower, or Decompiling + Resonance + Willpower, [Social]", () => {
    expect(deactivationPool(tm(), "charisma")).toMatchObject({
      dicePool: 9, limit: 6
    })
    expect(deactivationPool(tm({
      decompiling: 4
    }), "decompiling")).toMatchObject({
      dicePool: 15, limit: 6
    })
  })

  it("counts the wound penalties and the GM's modifier, never below 0", () => {
    const hurt = tm({
      penalties: {
        condition: {
          actual: {
            value: -2
          }
        }, matrix: {
          actual: {
            value: -1
          }
        }
      }
    })
    expect(deactivationPool(hurt, "charisma", 2).dicePool).toBe(8)
    expect(deactivationPool(hurt, "charisma", -20).dicePool).toBe(0)
  })

  it("takes the larger pool, and the Decompiling test only with the skill", () => {
    expect(bestMethod(tm())).toBe("charisma")
    expect(bestMethod(tm({
      decompiling: 1
    }))).toBe("decompiling")
    expect(bestMethod(tm({
      decompiling: 1, resonance: 1, charisma: 6
    }))).toBe("charisma")
  })

  it("expels with net hits equal to the Depth or the MEC", () => {
    expect(resolveDeactivation(7, 3, 4).expelled).toBe(true)
    expect(resolveDeactivation(6, 3, 4).expelled).toBe(false)
    expect(resolveDeactivation(2, 5, 1).expelled).toBe(false)
  })

  it("costs 2 Fading per hit of the target, not per net hit, at least 2", () => {
    expect(resolveDeactivation(9, 3, 4).fading).toBe(6)
    expect(deactivationFading(0)).toBe(2)
    expect(deactivationFading(1)).toBe(2)
    expect(deactivationFading(4)).toBe(8)
  })

  it("makes the Fading physical when the strength is above the Resonance (by analogy, SR5 p. 254)", () => {
    expect(fadingIsPhysical(7, 6)).toBe(true)
    expect(fadingIsPhysical(6, 6)).toBe(false)
  })
})

describe("Deactivation card", () => {
  const original = globalThis.game
  afterEach(() => {
    globalThis.game = original
  })

  function html(){
    const removed = []
    const button = {
      remove: () => removed.push(button), addEventListener: () => {}
    }
    return {
      removed, querySelectorAll: () => [button]
    }
  }

  it("loses its button when a player posted it, even for the GM", () => {
    globalThis.game = {
      user: {
        isGM: true
      }
    }
    const h = html()
    activateDeactivationListeners(h, {
      author: {
        isGM: false
      }
    })
    expect(h.removed.length).toBe(1)
  })

  it("shows no button to a player, even on a GM's card", () => {
    globalThis.game = {
      user: {
        isGM: false
      }
    }
    const h = html()
    activateDeactivationListeners(h, {
      author: {
        isGM: true
      }
    })
    expect(h.removed.length).toBe(1)
  })

  it("keeps its button for the GM on a GM's card", () => {
    globalThis.game = {
      user: {
        isGM: true
      }
    }
    const h = html()
    activateDeactivationListeners(h, {
      author: {
        isGM: true
      }
    })
    expect(h.removed.length).toBe(0)
  })
})
