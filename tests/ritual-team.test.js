import {
  describe, it, expect
} from "vitest"
import {
  ritualTraditionPenalty, ritualAssistPool, readAssistDice, teamworkBonus, ritualAcceptsHelp,
  contractualLacksParticipant, ritualDrainRecipients, uniqueAssists, ritualDrainKey, ritualDrainActorId
} from "../modules/rolls/roll-helpers/ritualTeam.js"

describe("ritual participants: tradition (SR5 p. 298)", () => {
  it("a participant of another tradition has -2 dice", () => {
    expect(ritualTraditionPenalty("hermetic", "shamanic")).toBe(-2)
  })
  it("the same tradition has no penalty", () => {
    expect(ritualTraditionPenalty("hermetic", "hermetic")).toBe(0)
  })
  it("an unset tradition is not guessed", () => {
    expect(ritualTraditionPenalty("", "shamanic")).toBe(0)
    expect(ritualTraditionPenalty("hermetic", undefined)).toBe(0)
  })
  it("the penalty comes off the assist pool", () => {
    expect(ritualAssistPool(4, 10, -2)).toBe(8)
  })
})

describe("ritual participants: no defaulting (SR5 p. 145)", () => {
  it("without Ritual Spellcasting, the participant brings no die", () => {
    expect(ritualAssistPool(0, 5, 0)).toBe(0)
  })
  it("a pool never goes below zero", () => {
    expect(ritualAssistPool(1, 1, -2)).toBe(0)
  })
})

describe("assist dice (SR5 p. 47)", () => {
  it("counts 5 and 6 as hits, capped by the Force", () => {
    expect(readAssistDice([5, 6, 6, 5, 2], 3)).toEqual({
      hits: 3, glitch: false, criticalGlitch: false
    })
  })
  it("more than half ones is a complication", () => {
    expect(readAssistDice([1, 1, 1, 5], 6)).toEqual({
      hits: 1, glitch: true, criticalGlitch: false
    })
  })
  it("exactly half ones is not a complication", () => {
    expect(readAssistDice([1, 1, 5, 3], 6).glitch).toBe(false)
  })
  it("a complication without hit is a critical glitch", () => {
    expect(readAssistDice([1, 1, 2], 6)).toEqual({
      hits: 0, glitch: true, criticalGlitch: true
    })
  })
})

describe("teamwork test (SR5 p. 51)", () => {
  it("each hit adds a die, each assistant with a hit adds 1 to the limit", () => {
    expect(teamworkBonus(6, [{
      hits: 2
    }, {
      hits: 1
    }, {
      hits: 0
    }])).toEqual({
      dice: 3, limit: 2, anyCritical: false
    })
  })
  it("the extra dice are capped by the leader's skill rating", () => {
    expect(teamworkBonus(3, [{
      hits: 4
    }, {
      hits: 2
    }]).dice).toBe(3)
  })
  it("a complication only cancels that assistant's limit bonus", () => {
    expect(teamworkBonus(6, [{
      hits: 2, glitch: true
    }, {
      hits: 1
    }])).toEqual({
      dice: 3, limit: 1, anyCritical: false
    })
  })
  it("a critical glitch of one assistant cancels every limit bonus, not the dice", () => {
    expect(teamworkBonus(6, [{
      hits: 0, glitch: true, criticalGlitch: true
    }, {
      hits: 3
    }])).toEqual({
      dice: 3, limit: 0, anyCritical: true
    })
  })
  it("no assistant, no bonus", () => {
    expect(teamworkBonus(5, [])).toEqual({
      dice: 0, limit: 0, anyCritical: false
    })
  })
})

describe("ritual keywords (Street Grimoire p. 122)", () => {
  it("an Adept ritual refuses the help of a group", () => {
    expect(ritualAcceptsHelp({
      adeptRitual: true
    })).toBe(false)
    expect(ritualAcceptsHelp({
      adeptRitual: false
    })).toBe(true)
  })
  it("a Contractual ritual needs a participant besides the leader", () => {
    expect(contractualLacksParticipant({
      contractual: true
    }, 0)).toBe(true)
    expect(contractualLacksParticipant({
      contractual: true
    }, 1)).toBe(false)
    expect(contractualLacksParticipant({
      contractual: false
    }, 0)).toBe(false)
  })
})

describe("Drain of each participant (SR5 p. 299)", () => {
  it("the leader and every participant take the Drain, once each", () => {
    expect(ritualDrainRecipients({
      actorId: "L", name: "Leader"
    }, [{
      actorId: "A", name: "Ana"
    }, {
      actorId: "L", name: "Leader"
    }, {
      actorId: "A", name: "Ana"
    }])).toEqual([{
      actorId: "L", name: "Leader"
    }, {
      actorId: "A", name: "Ana"
    }])
  })
  it("a participant counts once, and the leader never assists themself", () => {
    expect(uniqueAssists([{
      actorId: "A", hits: 2
    }, {
      actorId: "A", hits: 5
    }, {
      actorId: "L", hits: 3
    }], "L")).toEqual([{
      actorId: "A", hits: 2
    }])
  })
  it("the Drain button names its actor", () => {
    expect(ritualDrainActorId(ritualDrainKey("abc123"))).toBe("abc123")
    expect(ritualDrainActorId("drain")).toBe(null)
  })
})
