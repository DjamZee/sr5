import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  absorbWithAegis, aegisState, hasAegis, AEGIS_REGEN_SECONDS
} from "../modules/system/aegis.js"

// Aegis (Kill Code p. 112): four shield boxes damaged first, whole again 24 h after the first damage
describe("Aegis echo", () => {
  it("takes the first four boxes", () => {
    const first = absorbWithAegis(null, 3, 1000)
    expect(first).toMatchObject({
      absorbed: 3, through: 0
    })
    const second = absorbWithAegis(first.ledger, 3, 2000)
    expect(second).toMatchObject({
      absorbed: 1, through: 2
    })
    expect(second.ledger).toEqual({
      damage: 4, since: 1000
    })
  })

  it("comes back whole 24 h after the first damage, never box by box", () => {
    const ledger = {
      damage: 4, since: 1000
    }
    expect(aegisState(ledger, 1000 + AEGIS_REGEN_SECONDS - 1).damage).toBe(4)
    expect(aegisState(ledger, 1000 + AEGIS_REGEN_SECONDS).damage).toBe(0)
    expect(absorbWithAegis(ledger, 2, 1000 + AEGIS_REGEN_SECONDS).ledger.since).toBe(1000 + AEGIS_REGEN_SECONDS)
  })

  it("reads no text or negatives", () => {
    expect(absorbWithAegis({
      damage: "x"
    }, -2, 0)).toMatchObject({
      absorbed: 0, through: 0
    })
  })

  it("is found by the echo's name", () => {
    expect(hasAegis({
      items: [{
        type: "itemEcho", name: "Aegis"
      }]
    })).toBe(true)
    expect(hasAegis({
      items: [{
        type: "itemGear", name: "Aegis"
      }]
    })).toBe(false)
  })

  it("is spent by the active GM only, players relay the damage", () => {
    const helper = readFileSync("modules/entities/actors/entityActor-helpers.js", "utf8")
    expect(helper).toMatch(/if \(isActiveGM\(\)\) \{\s*const result = absorbWithAegis/)
    const entity = readFileSync("modules/entities/actors/entityActor.js", "utf8")
    expect(entity).toMatch(/aegisToGM/)
    // never a flag on the actor, which its owner could reset
    expect(helper).not.toMatch(/setFlag\("sr5", "aegis"/)
    expect(readFileSync("modules/system/aegis.js", "utf8")).toMatch(/scope: "world"/)
  })
})
