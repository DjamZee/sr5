import {
  describe, it, expect, vi
} from "vitest"

//drug-clock.js imports drug-crash.js, which reaches the roll code: only the two functions it calls are needed
vi.mock("../modules/entities/items/drug-crash.js", () => ({
  endDrugRise: vi.fn(), resetDrugPhase: vi.fn()
}))

const {
  speedSeconds, durationSeconds, phaseEnd, phaseStartFlags, onPreUpdateDrug, onPreUpdateActorDrugs, activateDrugCardListeners
} = await import("../modules/system/drug-clock.js")

describe("drug cards are believed from a GM only (as the cards of lots 3 and 5, review of Ursula)", () => {
  const html = () => {
    const buttons = [{
      removed: false, remove(){
        this.removed = true
      }, addEventListener: vi.fn()
    }]
    return {
      buttons, querySelectorAll: () => buttons
    }
  }

  it("takes the buttons off a card a player posted, even for the GM", () => {
    globalThis.game = {
      ...globalThis.game, user: {
        isGM: true
      }
    }
    const h = html()
    activateDrugCardListeners(h, {
      author: {
        isGM: false
      }
    })
    expect(h.buttons[0].removed).toBe(true)
  })

  it("wires the buttons of a card a GM posted", () => {
    globalThis.game = {
      ...globalThis.game, user: {
        isGM: true
      }
    }
    const h = html()
    activateDrugCardListeners(h, {
      author: {
        isGM: true
      }
    })
    expect(h.buttons[0].removed).toBe(false)
    expect(h.buttons[0].addEventListener).toHaveBeenCalled()
  })
})

describe("drugs on the world clock (SR5 p. 411-412, Chrome Flesh p. 194)", () => {
  it("reads the Speed in Combat Turns of 3 s", () => {
    expect(speedSeconds({
      speed: 1, speedType: "SR5.CombatTurns"
    })).toBe(3)
    expect(speedSeconds({
      speed: 0, speedType: "SR5.CombatTurns"
    })).toBe(0)
    expect(speedSeconds({
      speed: "special"
    })).toBe(0)
  })

  it("reads the durations in the units the drug is rolled in", () => {
    expect(durationSeconds(3, "hour")).toBe(10800)
    expect(durationSeconds(40, "minute")).toBe(2400)
    expect(durationSeconds(0, "hour")).toBe(null)
    expect(durationSeconds(2, "fortnight")).toBe(null)
  })

  it("ends the effect after its Speed and its Duration", () => {
    //Jazz: Speed 1 Combat Turn, Duration 10 x 1D6 minutes, here 30
    expect(phaseEnd({
      phase: "rise", handleShot: {
        speed: 1, speedType: "SR5.CombatTurns", duration: 30, durationType: "minute"
      }
    }, {
      riseStart: 1000
    })).toBe(1000 + 3 + 1800)
  })

  it("ends the crash after its own duration, from the start of the crash", () => {
    expect(phaseEnd({
      phase: "crash", handleShot: {
        duration: 30, durationType: "minute", durationContrecoup: 2, durationContrecoupType: "hour"
      }
    }, {
      riseStart: 0, crashStart: 5000
    })).toBe(5000 + 7200)
  })

  it("counts nothing without a start or a phase", () => {
    expect(phaseEnd({
      phase: "rise", handleShot: {
        duration: 1, durationType: "hour"
      }
    }, {
    })).toBe(null)
    expect(phaseEnd({
      phase: "", handleShot: {
        duration: 1, durationType: "hour"
      }
    }, {
      riseStart: 0
    })).toBe(null)
  })

  it("notes the start of each phase, and forgets the alert of the old one", () => {
    expect(phaseStartFlags("", "rise", 50)).toEqual({
      riseStart: 50, crashStart: null, drugNotified: false
    })
    expect(phaseStartFlags("rise", "crash", 90)).toEqual({
      crashStart: 90, drugNotified: false
    })
    expect(phaseStartFlags("crash", "", 120)).toEqual({
      riseStart: null, crashStart: null, drugNotified: false
    })
    expect(phaseStartFlags("rise", "rise", 10)).toBe(null)
  })

  it("starts the crash at the end of the effect, not at the GM's click (SR5 p. 411, Élise)", () => {
    //Effect of 30 minutes from 0: over at 1800. The GM clicks at 1860; a crash of 30 minutes ends at 3600
    const drug = {
      type: "itemDrug", system: {
        phase: "rise", handleShot: {
          duration: 30, durationType: "minute", durationContrecoup: 30, durationContrecoupType: "minute"
        }
      }, flags: {
        sr5: {
          riseStart: 0
        }
      }
    }
    const changes = {
      system: {
        phase: "crash"
      }
    }
    onPreUpdateDrug(drug, changes, 1860)
    expect(changes.flags.sr5.crashStart).toBe(1800)
    expect(phaseEnd({
      ...drug.system, phase: "crash"
    }, changes.flags.sr5)).toBe(3600)
    //Ended before its end (the sheet, an interaction): the crash starts now
    expect(phaseStartFlags("rise", "crash", 900, 1800).crashStart).toBe(900)
  })

  it("stamps a drug taken through the sheet, which writes the whole item list through the actor", () => {
    const drug = {
      type: "itemDrug", system: {
        phase: ""
      }
    }
    const actor = {
      items: new Map([["d1", drug]])
    }
    const changes = {
      items: [{
        _id: "d1", system: {
          phase: "rise"
        }
      }, {
        _id: "other", system: {
        }
      }]
    }
    onPreUpdateActorDrugs(actor, changes, 777)
    expect(changes.items[0].flags.sr5.riseStart).toBe(777)
    expect(changes.items[1].flags).toBeUndefined()
  })

  it("never returns false, which would cancel the update", () => {
    expect(onPreUpdateDrug({
      type: "itemWeapon", system: {
      }
    }, {
    }, 0)).not.toBe(false)
  })
})
