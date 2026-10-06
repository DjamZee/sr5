import {
  describe, it, expect, vi, afterEach, beforeEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// The flags of a template are its author's to write. The GM applied the light, noise and background count written
// on it to every token inside: a player's console could give the whole scene light -10 or noise 20.
describe("SR5_EffectArea.createTemplateEffect, a template a player wrote", () => {
  const gm = {
    id: "gm", isGM: true, name: "MJ"
  }
  const player = {
    id: "p1", isGM: false, name: "Joueuse"
  }
  let created, actor

  beforeEach(() => {
    created = []
    actor = {
      id: "a1", items: [], system: {
        magic: {
        }
      },
      createEmbeddedDocuments: vi.fn(async (type, docs) => created.push(...docs)),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    globalThis.game = {
      user: gm,
      users: Object.assign([gm, player], {
        filter: Array.prototype.filter, activeGM: gm, get: id => [gm, player].find(u => u.id === id)
      }),
      i18n: {
        format: k => k, localize: k => k
      },
    }
    globalThis.ChatMessage = {
      create: vi.fn()
    }
    globalThis.fromUuid = vi.fn().mockResolvedValue(null)
    SR5_EffectArea.WARNED_TEMPLATES?.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  const forged = (author, flags) => ({
    id: "t1", uuid: "Scene.s1.MeasuredTemplate.t1", author, flags: {
      sr5: flags
    }
  })
  const valueOf = target => created.find(e => e.system.customEffects.some(c => c.target === target))?.system.value

  it("ignores the light, noise and background count a player wrote, and tells the GM once", async () => {
    const template = forged(player, {
      environmentalModifiers: {
        light: -10
      }, matrixNoise: 20, backgroundCountValue: 6
    })
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, template)
    await SR5_EffectArea.createTemplateEffect({
      id: "tok2"
    }, template)
    expect(created).toEqual([])
    expect(ChatMessage.create).toHaveBeenCalledOnce()
  })

  it("takes the environment modifier from the template's item, not from its flags", async () => {
    globalThis.fromUuid = vi.fn().mockResolvedValue({
      name: "Fumigène", system: {
        category: "grenade", customEffects: {
          0: {
            transfer: true, category: "environmentalModifiers", target: "system.itemsProperties.environmentalMod.glare", value: 2
          }
        }
      }
    })
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, forged(player, {
      itemUuid: "Actor.a.Item.g", environmentalModifiers: {
        glare: 10
      }
    }))
    expect(valueOf("system.itemsProperties.environmentalMod.glare")).toBe(2)
  })

  it("gives a spell's environment by its effect only, not a second time as the template's", async () => {
    //Poltergeist: visibility 1, a value effect, applied by itemHasEffect
    globalThis.fromUuid = vi.fn().mockResolvedValue({
      name: "Poltergeist", type: "itemSpell", system: {
        category: "manipulation", customEffects: {
          0: {
            transfer: true, category: "environmentalModifiers", type: "value", target: "system.itemsProperties.environmentalMod.visibility", value: 1
          }
        }
      }
    })
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, forged(player, {
      itemUuid: "Actor.a.Item.p"
    }))
    expect(created).toEqual([])
  })

  it("a grenade's environment is set by the designated GM only", async () => {
    globalThis.fromUuid = vi.fn().mockResolvedValue({
      name: "Fumigène", system: {
        category: "grenade", customEffects: {
          0: {
            transfer: true, category: "environmentalModifiers", target: "system.itemsProperties.environmentalMod.visibility", value: 3
          }
        }
      }
    })
    game.users.activeGM = {
      id: "gm2", isGM: true
    }
    const template = forged(player, {
      itemUuid: "Actor.a.Item.g", environmentalModifiers: {
        visibility: 3
      }
    })
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, template)
    expect(created).toEqual([])
    game.users.activeGM = gm
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, template)
    expect(valueOf("system.itemsProperties.environmentalMod.visibility")).toBe(3)
  })

  it("treats a template with no known author as a player's", async () => {
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, forged(undefined, {
      matrixNoise: 20
    }))
    expect(created).toEqual([])
  })

  it("keeps what the GM wrote on his own template", async () => {
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, forged(gm, {
      environmentalModifiers: {
        light: -3
      }, matrixNoise: 2
    }))
    expect(valueOf("system.itemsProperties.environmentalMod.light")).toBe(-3)
    expect(valueOf("system.matrix.noise")).toBe(2)
    expect(ChatMessage.create).not.toHaveBeenCalled()
  })

  it("warns only at the designated GM's", async () => {
    game.users.activeGM = {
      id: "gm2", isGM: true
    }
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, forged(player, {
      matrixNoise: 20
    }))
    expect(created).toEqual([])
    expect(ChatMessage.create).not.toHaveBeenCalled()
  })
})
