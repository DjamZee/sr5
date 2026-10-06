import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  mentorResistAttributes
} from "../modules/entities/items/mentor-link.js"
import {
  convertMentorQualities
} from "../modules/entities/items/mentor-conversion.js"

// M5 D5 (mesuré par Elsa, 06/10) : les mentors convertis par la macro gardaient Charisme + Volonté. Chaos et Oracle
// résistent par Volonté + Intuition, le Conciliateur par Charisme + Intuition (Grimoire des Ombres p. 200-201).

describe("M5 D5 : attributs de désavantage des mentors convertis", () => {
  it("Chaos, Oracle : Volonté + Intuition ; Conciliateur : Charisme + Intuition ; les autres : rien à changer", () => {
    expect(mentorResistAttributes("Chaos")).toEqual({
      first: "willpower", second: "intuition"
    })
    expect(mentorResistAttributes(" Oracle ")).toEqual({
      first: "willpower", second: "intuition"
    })
    expect(mentorResistAttributes("Conciliateur")).toEqual({
      first: "charisma", second: "intuition"
    })
    expect(mentorResistAttributes("Peacemaker")).toEqual({
      first: "charisma", second: "intuition"
    })
    expect(mentorResistAttributes("Loup")).toBe(null)
  })

  describe("la macro pose ces attributs sur le mentor créé", () => {
    let actor
    beforeEach(() => {
      const quality = {
        id: "q1", type: "itemQuality", name: "Esprit mentor (Chaos)", system: {
          customEffects: [{
            target: "system.skills.con.test", value: 2
          }]
        }, flags: {
        }, toObject(){
          return {
            _id: this.id, type: this.type, name: this.name, system: this.system, flags: this.flags
          }
        }
      }
      actor = {
        name: "Aide", items: Object.assign([quality], {
          get: id => (id === "q1" ? quality : undefined)
        }),
        createEmbeddedDocuments: vi.fn(async (_t, data) => data.map((d, n) => ({
          ...d, id: `m${n}`
        }))),
        updateEmbeddedDocuments: vi.fn(),
      }
      globalThis.game.user = {
        isGM: true
      }
      globalThis.game.i18n = {
        localize: k => k, format: k => k
      }
      globalThis.ChatMessage = {
        create: vi.fn(), getWhisperRecipients: () => []
      }
    })

    it("Chaos converti : Volonté + Intuition", async () => {
      await convertMentorQualities({
        actor
      })
      const created = actor.createEmbeddedDocuments.mock.calls[0]?.[1]?.[0]
      expect(created?.system?.resistAttributes).toEqual({
        first: "willpower", second: "intuition"
      })
    })
  })
})
