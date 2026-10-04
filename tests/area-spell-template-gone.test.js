import {
  describe, it, expect, vi
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  isAreaSpellTemplateGone
} from "../modules/system/areaEffectScene.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// N77: a template deleted while its resistance dialog is open. "Apply the effect" then gave an effect
// no template would ever lift, and that effect stopped the next cast of the spell from asking a resistance.

const resistance = () => ({
  test: {
    type: "spellResistance"
  },
  previousMessage: {
    messageId: "cast1", itemUuid: "Actor.m.Item.spell"
  },
  magic: {
    spell: {
      area: 0
    }
  },
})
const messages = (area = 2) => new Map([["cast1", {
  flags: {
    sr5data: {
      magic: {
        spell: {
          area
        }
      }
    }
  }
}]])
const template = (messageId = "cast1", itemUuid = "Actor.m.Item.spell") => ({
  flags: {
    sr5: {
      itemHasEffect: true, itemUuid, messageId
    }
  }
})
const scene = (...templates) => ({
  templates
})

describe("resistance to an area spell whose template is gone", () => {
  it("is gone when no template of the cast is left", () => {
    expect(isAreaSpellTemplateGone(resistance(), [scene()], messages())).toBe(true)
    expect(isAreaSpellTemplateGone(resistance(), [scene(template("cast2"))], messages())).toBe(true)
  })

  it("is not gone while the cast's template stands", () => {
    expect(isAreaSpellTemplateGone(resistance(), [scene(template())], messages())).toBe(false)
  })

  it("a template placed off a chat card answers any cast", () => {
    expect(isAreaSpellTemplateGone(resistance(), [scene(template(undefined))], messages())).toBe(false)
  })

  it("never concerns a spell without area, nor another test", () => {
    expect(isAreaSpellTemplateGone(resistance(), [scene()], messages(0))).toBe(false)
    expect(isAreaSpellTemplateGone({
      ...resistance(), test: {
        type: "powerDefense"
      }
    }, [scene()], messages())).toBe(false)
  })

  it("Apply the effect gives nothing once the template is gone", async () => {
    const warn = vi.fn()
    const createEmbeddedDocuments = vi.fn()
    globalThis.ui = {
      notifications: {
        warn, info: () => {}
      }
    }
    globalThis.game.scenes = [scene()]
    globalThis.game.messages = messages()
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => ({
      items: [], createEmbeddedDocuments
    }))
    globalThis.fromUuid = async () => ({
      system: {
        customEffects: {
          a: {
            transfer: true, type: "value", value: 2, target: "system.attributes.body.augmented"
          }
        }
      }
    })
    await SR5_ActorHelper.applyExternalEffect("a1", {
      ...resistance(), owner: {
        itemUuid: "Actor.m.Item.spell"
      }, roll: {
        hits: 1, netHits: 1
      }
    }, "customEffects")
    expect(warn).toHaveBeenCalledWith("SR5.WARN_AreaSpellTemplateGone")
    expect(createEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
