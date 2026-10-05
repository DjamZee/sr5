import {
  describe, it, expect, vi, beforeEach
} from "vitest"

const {
  afterInterval, profileFromToxin, newInfection, reexpose, testPower, testModifiers, penetrationModifier, protectionOf,
  applyResult, applyRecovery, currentEffects, effectsFor, dueEntries, openInfectionOf, applyDiseaseEffects,
  addDiseaseApplyButton, activateDiseaseRequestListeners, checkDiseases, DISEASE_UNITS, hitsAboveDice, finalEffectDue, reachedZero
} = await import("../modules/system/diseases.js")

const DAY = DISEASE_UNITS.day

// Red Mask, Bullets & Bandages p. 21: Inhalation, 1 day (6), Power 4, Penetration 2
const redMask = () => profileFromToxin({
  name: "Masque rouge", uuid: "Item.rm",
  system: {
    vector: {
      inhalation: true, contact: false
    }, power: 4, penetration: -2, damageType: "",
    effect: {
      disorientation: true, nausea: false
    },
    pathogen: {
      isPathogen: true, interval: {
        value: 1, unit: "day"
      }, minTests: 6, effect: {
        reducedAttributes: true
      }
    },
  },
})

// Cryptococcus metaformans, Bullets & Bandages p. 20-21: 1 month (6), Power 3, Essence lowered, Nausea
const crypto = () => profileFromToxin({
  name: "Cryptococcus", system: {
    vector: {
      contact: true
    }, power: 3, penetration: 0, effect: {
      nausea: true
    },
    pathogen: {
      interval: {
        value: 1, unit: "month"
      }, minTests: 6, effect: {
        essenceLoss: true
      }
    }
  }
})

const infect = (profile, extra = {
}) => newInfection(profile, {
  id: "i1", actorUuid: "Actor.a", actorName: "Ana", now: 1000, startYear: 2075, ...extra
})

describe("the pathogen of a toxin item (Run Faster p. 111-112, Bullets & Bandages p. 21)", () => {
  it("copies the Speed as an interval, the least number of tests and the effects", () => {
    const p = redMask()
    expect(p.interval).toEqual({
      value: 1, unit: "day"
    })
    expect(p.minTests).toBe(6)
    expect(p.vectors).toEqual(["inhalation"])
    expect(p.effects).toEqual(["disorientation"])
    expect(p.pathogenEffects).toEqual(["reducedAttributes"])
    expect(p.penetration).toBe(-2)
  })
})

describe("the GM's Apply window flags a card claiming more hits than dice (Élise, Q1)", () => {
  it("more hits than dice is an edited card", () => {
    expect(hitsAboveDice(10, 8)).toBe(true)
    expect(hitsAboveDice(8, 8)).toBe(false)
    expect(hitsAboveDice(2, 0)).toBe(true)
  })
})

describe("the incubation and the clock", () => {
  it("asks no test before one interval after the exposure", () => {
    const e = infect(redMask())
    expect(e.state).toBe("incubating")
    expect(e.nextTest).toBe(1000 + DAY)
    expect(dueEntries({
      infections: {
        i1: e
      }
    }, 1000 + DAY - 1)).toEqual([])
    expect(dueEntries({
      infections: {
        i1: e
      }
    }, 1000 + DAY)).toHaveLength(1)
  })

  it("tells the GM once per deadline", () => {
    const e = {
      ...infect(redMask()), notified: true
    }
    expect(dueEntries({
      infections: {
        i1: e
      }
    }, 1000 + 2 * DAY)).toEqual([])
  })

  it("counts months on the calendar", () => {
    const add = vi.fn(() => 42)
    expect(afterInterval(0, {
      value: 1, unit: "minute"
    })).toBe(60)
    expect(afterInterval(0, {
      value: 2, unit: "week"
    })).toBe(2 * DISEASE_UNITS.week)
    expect(add).not.toHaveBeenCalled()
  })
})

describe("the Power (Run Faster p. 112, SR5 p. 83 and 410)", () => {
  it("adds +1 per extra dose, at the exposure and when exposed again", () => {
    const e = infect(redMask(), {
      doses: 3
    })
    expect(e.basePower).toBe(6)
    expect(reexpose(e, 2).basePower).toBe(8)
  })

  it("carries what the last test left and +2 for an Immunodeficient character", () => {
    const e = {
      ...infect(redMask()), carry: 3
    }
    expect(testPower(e)).toBe(7)
    expect(testPower(e, true)).toBe(9)
  })

  it("a penetration takes off only what protection systems give, never more", () => {
    expect(penetrationModifier(-2, 0)).toBe(0)
    expect(penetrationModifier(-2, 1)).toBe(-1)
    expect(penetrationModifier(-2, 4)).toBe(-2)
    expect(protectionOf([{
      type: "linkedAttribute", value: 5
    }, {
      type: "metatype", value: 2
    }, {
      type: "itemAugmentation", value: 3
    }])).toBe(3)
  })

  it("the treatment counts at each test, the willing subject's penalty at the first only", () => {
    const p = {
      ...redMask(), volunteerPenalty: 2
    }
    const e = {
      ...infect(p, {
        volunteer: true
      }), treatment: 3
    }
    expect(testModifiers(e)).toEqual([{
      type: "diseaseTreatment", value: 3
    }, {
      type: "diseaseVolunteer", value: -2
    }])
    expect(testModifiers({
      ...e, testsDone: 1
    })).toEqual([{
      type: "diseaseTreatment", value: 3
    }])
  })
})

describe("applying a test (Run Faster p. 111-112)", () => {
  it("keeps the Power left for the next test and moves the deadline on", () => {
    const e = infect(redMask())
    const next = applyResult(e, 1, 4, 2075)
    expect(next.residual).toBe(3)
    expect(next.carry).toBe(3)
    expect(next.testsDone).toBe(1)
    expect(next.state).toBe("active")
    expect(next.nextTest).toBe(e.nextTest + DAY)
    expect(next.request).toBeNull()
  })

  it("is not beaten at 0 before the least number of tests", () => {
    const next = applyResult(infect(redMask()), 9, 4, 2075)
    expect(next.residual).toBe(0)
    expect(next.state).toBe("active")
  })

  it("is beaten at 0 once the least number of tests is made", () => {
    const e = {
      ...infect(redMask()), testsDone: 5, carry: 2, residual: 2
    }
    const next = applyResult(e, 6, 6, 2075)
    expect(next.state).toBe("cured")
    expect(next.nextTest).toBeNull()
  })

  it("carries the Power left only up to the least number of tests (lecture d'Élise, RF p. 112)", () => {
    //HMHVV strain I: 1 test, Power 13; 2 hits each time must not make the Power climb
    const strain = {
      ...redMask(), power: 13, minTests: 1
    }
    let e = infect(strain)
    e = applyResult(e, 2, testPower(e), 2075)
    expect(e.residual).toBe(11)
    expect(e.carry).toBe(0)
    expect(finalEffectDue(e)).toBe(true)
    e = applyResult(e, 2, testPower(e), 2075)
    expect(testPower(e)).toBe(13)
    expect(e.history.map(h => h.power)).toEqual([13, 13])
    e = applyResult(e, 13, testPower(e), 2075)
    expect(e.state).toBe("cured")
  })

  it("still carries before the least number is reached", () => {
    const e = applyResult({
      ...infect(redMask()), testsDone: 4
    }, 1, 4, 2075)
    expect(e.carry).toBe(3)
    const last = applyResult(e, 1, testPower(e), 2075)
    expect(last.carry).toBe(0)
  })

  it("an attribute or the Essence down to 0 is flagged at any test", () => {
    const actor = (str, ess) => ({
      system: {
        attributes: {
          strength: {
            augmented: {
              value: str
            }
          }, logic: {
            augmented: {
              value: 3
            }
          }, willpower: {
            augmented: {
              value: 3
            }
          }
        }, essence: {
          value: ess
        }
      }
    })
    expect(reachedZero(actor(0, 6))).toBe(true)
    expect(reachedZero(actor(2, 0))).toBe(true)
    expect(reachedZero(actor(2, 6))).toBe(false)
  })

  it("goes on past the least number while some Power is left", () => {
    const e = {
      ...infect(redMask()), testsDone: 5
    }
    expect(applyResult(e, 1, 4, 2075).state).toBe("active")
  })

  it("Cryptococcus treated gives back 1 Essence every 24 hours", () => {
    const e = {
      ...infect(crypto()), testsDone: 5, residual: 2, carry: 2, nextTest: 5000
    }
    const next = applyResult(e, 9, 5, 2075)
    expect(next.state).toBe("recovering")
    expect(next.recovery).toBe(2)
    expect(next.nextTest).toBe(5000 + DAY)
    expect(currentEffects(next)).toEqual({
      essence: 2
    })
    const day1 = applyRecovery(next)
    expect(day1.recovery).toBe(1)
    expect(applyRecovery(day1).state).toBe("cured")
  })
})

describe("the effects, read from the ledger", () => {
  it("nothing during the incubation, nor once the Power is 0", () => {
    expect(currentEffects(infect(redMask()))).toEqual({
    })
    expect(currentEffects({
      ...infect(redMask()), state: "active", residual: 0
    })).toEqual({
    })
  })

  it("Red Mask lowers Strength, Logic and Willpower by the Power left, and disorients", () => {
    const e = {
      ...infect(redMask()), state: "active", residual: 3
    }
    expect(currentEffects(e)).toEqual({
      disorientation: true, attributes: 3
    })
  })

  it("sums the open infections of one actor only", () => {
    const ledger = {
      infections: {
        a: {
          ...infect(redMask()), state: "active", residual: 2
        },
        b: {
          ...infect(crypto(), {
            id: "b"
          }), state: "active", residual: 1
        },
        c: {
          ...infect(redMask(), {
            id: "c", actorUuid: "Actor.other"
          }), state: "active", residual: 5
        },
      }
    }
    const sum = effectsFor(ledger, "Actor.a")
    expect(sum.attributes).toBe(2)
    expect(sum.essence).toBe(1)
    expect(sum.nausea).toBe(true)
    expect(sum.names).toEqual(["Masque rouge", "Cryptococcus"])
    expect(openInfectionOf(ledger, "Actor.a", "Masque rouge")?.id).toBe("i1")
  })

  it("puts the modifiers on the prepared actor, never on its source", () => {
    const ledger = {
      infections: {
        a: {
          ...infect(redMask()), state: "active", residual: 2
        }
      }
    }
    globalThis.game = {
      settings: {
        get: () => ledger
      }
    }
    const actor = {
      uuid: "Actor.a", system: {
        penalties: {
          special: {
            actual: {
              modifiers: []
            }
          }
        }, specialProperties: {
        },
        attributes: {
          strength: {
            augmented: {
              modifiers: []
            }
          }, logic: {
            augmented: {
              modifiers: []
            }
          }, willpower: {
            augmented: {
              modifiers: []
            }
          }
        },
      }
    }
    const update = vi.fn((target, label, type, value) => target.modifiers.push({
      label, type, value
    }))
    applyDiseaseEffects(actor, update, "Pathogène")
    expect(actor.system.penalties.special.actual.modifiers[0].value).toBe(-2)
    expect(actor.system.attributes.logic.augmented.modifiers[0].value).toBe(-2)
    expect(update).toHaveBeenCalledTimes(4)
  })
})

describe("a player cannot move her disease on (the two flaws of the week)", () => {
  const ledgerWith = (request) => ({
    infections: {
      i1: {
        ...infect(redMask()), state: "active", request
      }
    }
  })
  const html = () => {
    const added = []
    return {
      added, querySelector: () => ({
        after: (b) => added.push(b)
      })
    }
  }

  beforeEach(() => {
    globalThis.game = {
      user: {
        id: "gm", isGM: true
      }, users: {
        activeGM: {
          id: "gm"
        }
      },
      settings: {
        get: () => ledgerWith({
          token: "t1", power: 4
        })
      },
      i18n: {
        localize: (k) => k
      },
    }
    globalThis.document = {
      createElement: () => ({
        classList: {
          add(){
          }
        }, addEventListener(){
        }
      })
    }
  })

  it("the GM's Apply button shows only on a roll carrying the request token of the ledger", () => {
    const ok = html()
    addDiseaseApplyButton({
      flags: {
        sr5data: {
          disease: {
            infectionId: "i1", token: "t1"
          }
        }
      }
    }, ok)
    expect(ok.added).toHaveLength(1)
    const forged = html()
    addDiseaseApplyButton({
      flags: {
        sr5data: {
          disease: {
            infectionId: "i1", token: "made-up"
          }
        }
      }
    }, forged)
    expect(forged.added).toHaveLength(0)
  })

  it("no Apply button once the test was applied (no request left)", () => {
    game.settings.get = () => ledgerWith(null)
    const h = html()
    addDiseaseApplyButton({
      flags: {
        sr5data: {
          disease: {
            infectionId: "i1", token: "t1"
          }
        }
      }
    }, h)
    expect(h.added).toHaveLength(0)
  })

  it("no Apply button for a player, nor for a GM who is not the active one", () => {
    for (const user of [{
      id: "p", isGM: false
    }, {
      id: "gm2", isGM: true
    }]){
      game.user = user
      const h = html()
      addDiseaseApplyButton({
        flags: {
          sr5data: {
            disease: {
              infectionId: "i1", token: "t1"
            }
          }
        }
      }, h)
      expect(h.added).toHaveLength(0)
    }
  })

  it("the roll button of a request card posted by a player is taken off", () => {
    const button = {
      removed: false, remove(){
        this.removed = true
      }, addEventListener: vi.fn()
    }
    activateDiseaseRequestListeners({
      querySelector: () => button
    }, {
      author: {
        isGM: false
      }, flags: {
        sr5: {
          diseaseRequest: {
            infectionId: "i1", token: "t1"
          }
        }
      }
    })
    expect(button.removed).toBe(true)
    expect(button.addEventListener).not.toHaveBeenCalled()
  })

  it("only the active GM looks at the clock", async () => {
    game.user = {
      id: "p", isGM: false
    }
    const set = vi.fn()
    game.settings.set = set
    await checkDiseases()
    expect(set).not.toHaveBeenCalled()
  })
})
