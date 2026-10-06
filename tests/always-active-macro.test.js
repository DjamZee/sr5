import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  planActivation
} from "../modules/entities/items/always-active.js"
import {
  activateAutomaticPowers
} from "../modules/entities/items/always-active-macro.js"

// The sheets made before H39 keep their always active powers off (SR5 p. 396). No automatic migration: the GM runs
// the macro, which switches them on and says what it did; running it again changes nothing.

const power = (id, type, actionType, isActive = false) => ({
  id, name: id, type, system: {
    actionType, isActive
  }
})

const actorOf = (name, items) => {
  const actor = {
    name, items,
    updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
      for (const u of updates) items.find(i => i.id === u._id).system.isActive = u["system.isActive"]
    }),
  }
  return actor
}

let warn, messages
beforeEach(() => {
  warn = vi.fn()
  messages = []
  globalThis.ui = {
    notifications: {
      warn
    }
  }
  globalThis.game.user = {
    isGM: true
  }
  globalThis.game.i18n = {
    localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}`
  }
  globalThis.ChatMessage = {
    create: vi.fn(async data => messages.push(data)), getWhisperRecipients: () => ["gm"]
  }
})

describe("the plan of the GM macro", () => {
  it("takes the creature powers that are always active and off, never a sprite power (SR5 p. 259)", () => {
    const plan = planActivation([
      power("Immunité", "itemPower", "automatic"),
      power("Armure", "itemPower", "permanent"),
      power("Forme astrale", "itemPower", "automatic", true),
      power("Peur", "itemPower", "complex"),
      power("Gremlins", "itemSpritePower", "automatic"),
      power("Réflexes améliorés", "itemAdeptPower", "permanent"),
      power("Arme", "itemWeapon", "automatic"),
    ])
    expect(plan.map(p => p.id)).toEqual(["Immunité", "Armure"])
  })
})

describe("activateAutomaticPowers", () => {
  it("switches them on, whispers what it did, and finds nothing the second time", async () => {
    const actor = actorOf("Shedim", [power("Immunité", "itemPower", "automatic"), power("Peur", "itemPower", "complex")])
    await activateAutomaticPowers({
      actor
    })
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{
      _id: "Immunité", "system.isActive": true
    }])
    expect(messages[0].content).toContain("Shedim")
    expect(messages[0].whisper).toEqual(["gm"])

    await activateAutomaticPowers({
      actor
    })
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledTimes(1)
    expect(messages[1].content).toContain("SR5.AutoPowersNothing")
  })

  it("is refused to a player, before anything is written", async () => {
    game.user = {
      isGM: false
    }
    const actor = actorOf("Shedim", [power("Immunité", "itemPower", "automatic")])
    await activateAutomaticPowers({
      actor
    })
    expect(warn).toHaveBeenCalledWith("SR5.AutoPowersGMOnly")
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled()
    expect(messages).toEqual([])
  })
})
