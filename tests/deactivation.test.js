import {
  describe, it, expect, afterEach
} from "vitest"
import {
  hasDefragmentation, targetKind, targetStrength, deactivationPool, bestMethod, resolveDeactivation,
  deactivationFading, fadingIsPhysical, activateDeactivationListeners, glitchKey, isFadingCardOf,
  edgeLeft, gmPool, hitsCap, boundHits, requestAnswered
} from "../modules/system/deactivation.js"
import {
  SR5
} from "../modules/config.js"

describe("Matrix Entity Concentration", () => {
  it("is a special attribute of the sheet, but no attribute a power, a complex form or a tradition rolls", () => {
    expect(SR5.characterSpecialAttributes.cem).toBe("SR5.DEFRAG_Cem")
    expect(SR5.allAttributes.cem).toBeUndefined()
    expect(SR5.allAttributes.nanite).toBe("SR5.NaniteVolume")
  })
})

describe("Deactivation card, second round", () => {
  it("tells a glitch and a critical glitch", () => {
    expect(glitchKey({
      glitchRoll: true
    })).toBe("SR5.DEFRAG_Glitch")
    expect(glitchKey({
      glitchRoll: false, criticalGlitchRoll: true
    })).toBe("SR5.DEFRAG_CriticalGlitch")
    expect(glitchKey({
      hits: 3
    })).toBe(null)
  })

  it("knows the Fading card rolled from it, and no other", () => {
    expect(isFadingCardOf({
      test: {
        type: "fading"
      }, previousMessage: {
        messageId: "abc"
      }
    }, "abc")).toBe(true)
    expect(isFadingCardOf({
      test: {
        type: "drain"
      }, previousMessage: {
        messageId: "abc"
      }
    }, "abc")).toBe(false)
    expect(isFadingCardOf({
      test: {
        type: "fading"
      }, previousMessage: {
        messageId: "xyz"
      }
    }, "abc")).toBe(false)
    expect(isFadingCardOf({
      test: {
        type: "fading"
      }, previousMessage: {
        messageId: null
      }
    }, null)).toBe(false)
  })
})

const val = (v) => ({
  augmented: {
    value: v
  }
})

function tm({
  charisma = 4, willpower = 5, resonance = 6, decompiling = 0, penalties = {
  }, social = 6, echo = "Défragmentation", edge = 3, edgeSpent = 0
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
        resonance: val(resonance), edge: val(edge)
      },
      conditionMonitors: {
        edge: {
          actual: {
            value: edgeSpent
          }
        }
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

describe("The player rolls, the GM counts again (arbitrage de DjamZ, 2026-10-06)", () => {
  it("knows the Edge left to spend", () => {
    expect(edgeLeft(tm())).toBe(3)
    expect(edgeLeft(tm({
      edgeSpent: 3
    }))).toBe(0)
  })

  it("adds the Edge rating and lifts the limit when the player pushed the limit (SR5 p. 58)", () => {
    expect(gmPool(tm(), "charisma", 0, false)).toMatchObject({
      dicePool: 9, limit: 6
    })
    expect(gmPool(tm(), "charisma", 0, true)).toMatchObject({
      dicePool: 12, limit: null, edge: 3
    })
  })

  it("believes at most the limit, or twice the pool when the 6s explode", () => {
    expect(hitsCap({
      dicePool: 9, limit: 6
    })).toBe(6)
    expect(hitsCap({
      dicePool: 4, limit: 6
    })).toBe(4)
    expect(hitsCap({
      dicePool: 12, limit: null
    })).toBe(24)
  })

  it("never keeps more hits than the pool the GM works out, whatever the card says", () => {
    const pool = gmPool(tm(), "charisma", 0, false)
    expect(boundHits(50, pool)).toBe(6)
    expect(boundHits(3, pool)).toBe(3)
    expect(boundHits(-4, pool)).toBe(0)
    expect(boundHits("9", gmPool(tm({
      charisma: 1, willpower: 1
    }), "charisma", 0, false))).toBe(2)
  })

  it("answers a request once, and only a GM's card answers it", () => {
    const gmCard = {
      author: {
        isGM: true
      }, flags: {
        sr5: {
          deactivation: {
            requestId: "req1"
          }
        }
      }
    }
    const playerCard = {
      author: {
        isGM: false
      }, flags: {
        sr5: {
          deactivation: {
            requestId: "req2"
          }
        }
      }
    }
    expect(requestAnswered("req1", [gmCard, playerCard])).toBe(true)
    expect(requestAnswered("req2", [gmCard, playerCard])).toBe(false)
    expect(requestAnswered(null, [gmCard])).toBe(false)
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

  it("offers a player's request to the GM only", () => {
    const request = {
      author: {
        isGM: false
      }, flags: {
        sr5: {
          deactivationRequest: {
            hits: 50
          }
        }
      }
    }
    globalThis.game = {
      user: {
        isGM: true
      }
    }
    const forGM = html()
    activateDeactivationListeners(forGM, request)
    expect(forGM.removed.length).toBe(0)
    globalThis.game = {
      user: {
        isGM: false
      }
    }
    const forPlayer = html()
    activateDeactivationListeners(forPlayer, request)
    expect(forPlayer.removed.length).toBe(1)
  })

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
