import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  relayNeedsConfirmation
} from "../modules/system/damage-relay.js"

// A takeDamage relay is applied on the word of the actor's owner or a GM only; anyone else waits for the GM
describe("damage relayed by socket", () => {
  const actor = owners => ({
    testUserPermission: (user, level) => level === "OWNER" && owners.includes(user.id)
  })

  it("applies the owner's and the GM's relay", () => {
    expect(relayNeedsConfirmation(actor(["p1"]), {
      id: "p1", isGM: false
    })).toBe(false)
    expect(relayNeedsConfirmation(actor([]), {
      id: "gm", isGM: true
    })).toBe(false)
  })

  it("asks the GM for anyone else's relay, or an unknown sender", () => {
    expect(relayNeedsConfirmation(actor(["p1"]), {
      id: "p2", isGM: false
    })).toBe(true)
    expect(relayNeedsConfirmation(actor(["p1"]), null)).toBe(true)
  })

  it("is checked by the socket handler with the server's senderId, before any effect", () => {
    const source = readFileSync("modules/entities/actors/entityActor-helpers.js", "utf8")
    const handler = source.slice(source.indexOf("static async _socketTakeDamage(message, senderId)"))
    expect(handler.indexOf("relayNeedsConfirmation(actor, sender)")).toBeGreaterThan(0)
    expect(handler.indexOf("relayNeedsConfirmation(actor, sender)")).toBeLessThan(handler.indexOf("SR5_ActorHelper.takeDamage("))
  })
})
