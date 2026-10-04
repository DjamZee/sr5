import {
  describe, it, expect, vi
} from "vitest"
import {
  readFileSync
} from "node:fs"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  SR5Combat
} from "../modules/system/srcombat.js"

// The electricity effect was the only one created with no rules text in system.gameEffect (SR5 p. 172).
describe("the electricity effect carries its rules text", () => {
  it("is created with the _GE text", async () => {
    const created = []
    const actor = {
      name: "Test", items: [], createEmbeddedDocuments: vi.fn(async (type, docs) => created.push(...docs)),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    vi.spyOn(SR5Combat, "changeInitInCombatHelper").mockResolvedValue()
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
    await SR5_ActorHelper.electricityDamageEffect("a1")
    expect(created[0]["system.gameEffect"]).toBe("SR5.ElementalDamageElectricity_GE")
  })

  it.each(["fr", "en"])("the %s language file has that text", (lang) => {
    const strings = JSON.parse(readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), "utf8"))
    expect(strings["SR5.ElementalDamageElectricity_GE"]).toMatch(/^<p>/)
  })
})
