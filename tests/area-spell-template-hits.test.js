import {
  describe, it, expect, vi, afterEach, beforeEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"

// A spell of area whose effect reads the hits, applied by its template: the GM read the hits written on the caster's
// item, which its player owns and can raise in the console. They are counted again on the cast's card, within the
// pool the GM works out, and the GM confirms.
describe("SR5_EffectArea.createTemplateEffect, a spell's hits", () => {
  const gm = {
    id: "gm", isGM: true, name: "MJ"
  }
  const player = {
    id: "p1", isGM: false, name: "Joueuse"
  }
  // 6 dice, 2 hits (5 and 6)
  const dice = [5, 6, 1, 2, 3, 4].map(result => ({
    result, active: true
  }))
  let caster, sourceItem, target, message, confirm

  beforeEach(() => {
    caster = {
      id: "caster", name: "Lanceuse",
      testUserPermission: u => u.id === "p1",
      system: {
        skills: {
          spellcasting: {
            spellCategory: {
              manipulation: {
                dicePool: 6
              }
            }
          }
        },
        specialAttributes: {
          edge: {
            augmented: {
              value: 0
            }
          }, magic: {
            augmented: {
              value: 6
            }
          }
        },
      },
    }
    sourceItem = {
      uuid: "Actor.caster.Item.spell", name: "Ombre", type: "itemSpell", parent: caster, actor: caster,
      system: {
        hits: 9, resisted: false, category: "manipulation",
        customEffects: {
          0: {
            transfer: true, type: "hits", target: "system.x", multiplier: 1
          }
        },
      },
    }
    target = {
      items: [], testUserPermission: () => false, applyExternalEffect: vi.fn()
    }
    message = {
      id: "m1", author: player,
      flags: {
        sr5data: {
          test: {
            type: "spell"
          },
          owner: {
            actorId: "caster", itemUuid: sourceItem.uuid
          },
          roll: {
            hits: 9, netHits: 9, r: {
              terms: [{
                results: dice
              }]
            }
          },
          magic: {
            force: 6
          },
        },
      },
    }
    confirm = vi.fn().mockResolvedValue(true)
    globalThis.game = {
      user: gm,
      users: Object.assign([gm, player], {
        filter: Array.prototype.filter, activeGM: gm, get: id => [gm, player].find(u => u.id === id)
      }),
      messages: {
        get: id => (id === "m1" ? message : undefined), contents: [message]
      },
      i18n: {
        format: k => k, localize: k => k
      },
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
    globalThis.ChatMessage = {
      create: vi.fn()
    }
    globalThis.foundry = {
      applications: {
        api: {
          DialogV2: {
            confirm
          }
        }
      }
    }
    globalThis.fromUuid = vi.fn().mockResolvedValue(sourceItem)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(id => (id === "caster" ? caster : target))
    SR5_EffectArea.TEMPLATE_ROLLS?.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  const template = {
    id: "t1", flags: {
      sr5: {
        itemHasEffect: true, itemUuid: "Actor.caster.Item.spell", messageId: "m1"
      }
    }
  }

  it("applies the hits counted on the card's dice, not the ones raised on the item", async () => {
    //A cast card has no net hits
    delete message.flags.sr5data.roll.netHits
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    expect(confirm).toHaveBeenCalledOnce()
    expect(target.applyExternalEffect).toHaveBeenCalledOnce()
    expect(target.applyExternalEffect.mock.calls[0][0].roll.hits).toBe(2)
    expect(target.applyExternalEffect.mock.calls[0][0].roll.netHits).toBe(2)
    expect(ui.notifications.warn).toHaveBeenCalled()
  })

  it("asks the GM once per template, not for every token", async () => {
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    await SR5_EffectArea.createTemplateEffect({
      id: "tok2"
    }, template)
    expect(confirm).toHaveBeenCalledOnce()
    expect(target.applyExternalEffect).toHaveBeenCalledTimes(2)
  })

  //Fritz: two windows for each token (the hits, then the sheet's definition), three definition windows open at once for
  //three tokens, back after 30 s, and a refusal forgotten
  describe("a player's spell whose sheet the GM reviews", () => {
    beforeEach(() => {
      caster.documentName = "Actor"
      game.packs = []
      game.items = []
      vi.spyOn(SR5_EntityHelpers, "getLabelByKey").mockReturnValue("label")
      SR5_ActorHelper.DEFINITION_DECISIONS.clear()
    })
    it("opens one window for three tokens coming at once, the definition inside the hits'", async () => {
      await Promise.all(["a", "b", "c"].map(id => SR5_EffectArea.createTemplateEffect({
        id
      }, template)))
      expect(confirm).toHaveBeenCalledOnce()
      expect(confirm.mock.calls[0][0].content).toContain("SR5.EffectDefinitionIntroArea")
      expect(target.applyExternalEffect).toHaveBeenCalledTimes(3)
      //What applyExternalEffect then asks for each token: the answer already given
      for (const [data, , review] of target.applyExternalEffect.mock.calls) {
        expect(await SR5_ActorHelper.confirmDefinition(review, data)).toBe(true)
      }
      expect(confirm).toHaveBeenCalledOnce()
    })
    //Fritz, measured: accepted at x2, the sheet raised to x10, a token out and back in took 50 without a window
    it("asks again when the sheet's definition changed after the answer", async () => {
      await SR5_EffectArea.createTemplateEffect({
        id: "a"
      }, template)
      expect(confirm).toHaveBeenCalledOnce()
      const [data, , accepted] = target.applyExternalEffect.mock.calls[0]
      expect(await SR5_ActorHelper.confirmDefinition(accepted, data)).toBe(true)
      expect(confirm).toHaveBeenCalledOnce()
      sourceItem.system.customEffects[0].multiplier = 10
      await SR5_EffectArea.createTemplateEffect({
        id: "back"
      }, template)
      const [data2, , forged] = target.applyExternalEffect.mock.calls[1]
      confirm.mockResolvedValueOnce(false)
      expect(await SR5_ActorHelper.confirmDefinition(forged, data2)).toBe(false)
      expect(confirm).toHaveBeenCalledTimes(2)
      expect(confirm.mock.calls[1][0].content).toContain("× 10")
    })
    it("keeps a refusal for the whole template", async () => {
      confirm.mockResolvedValue(false)
      await Promise.all(["a", "b"].map(id => SR5_EffectArea.createTemplateEffect({
        id
      }, template)))
      await SR5_EffectArea.createTemplateEffect({
        id: "late"
      }, template)
      expect(confirm).toHaveBeenCalledOnce()
      expect(target.applyExternalEffect).not.toHaveBeenCalled()
    })
  })

  it("applies nothing when the GM declines", async () => {
    confirm.mockResolvedValue(false)
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    expect(target.applyExternalEffect).not.toHaveBeenCalled()
  })

  it("applies nothing, and tells the GM, when no card of the cast can be found", async () => {
    game.messages = {
      get: () => undefined, contents: []
    }
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    expect(target.applyExternalEffect).not.toHaveBeenCalled()
    expect(ChatMessage.create).toHaveBeenCalled()
  })

  it("does not believe a card forged by another player for this caster", async () => {
    message.author = {
      id: "p2", isGM: false, name: "Autre"
    }
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    expect(target.applyExternalEffect).not.toHaveBeenCalled()
  })

  it("asks only at the designated GM's: another GM opens no window and applies nothing", async () => {
    game.users.activeGM = {
      id: "gm2", isGM: true
    }
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    expect(confirm).not.toHaveBeenCalled()
    expect(target.applyExternalEffect).not.toHaveBeenCalled()
  })

  it("a spell of light gives its effect once, by its hits, and nothing when the GM declines", async () => {
    //Light (SG): an environment effect of type hits, no value
    sourceItem.system.customEffects[0] = {
      transfer: true, type: "hits", category: "environmentalModifiers", target: "system.itemsProperties.environmentalMod.light", multiplier: 1
    }
    target.createEmbeddedDocuments = vi.fn()
    confirm.mockResolvedValue(false)
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, {
      ...template, author: player
    })
    expect(target.createEmbeddedDocuments).not.toHaveBeenCalled()
    expect(target.applyExternalEffect).not.toHaveBeenCalled()
    confirm.mockResolvedValue(true)
    SR5_EffectArea.TEMPLATE_ROLLS.clear()
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, {
      ...template, author: player
    })
    expect(target.createEmbeddedDocuments).not.toHaveBeenCalled()
    expect(target.applyExternalEffect).toHaveBeenCalledOnce()
  })

  it("keeps the item's hits for a caster no player owns", async () => {
    caster.testUserPermission = () => false
    await SR5_EffectArea.createTemplateEffect({
      id: "tok"
    }, template)
    expect(confirm).not.toHaveBeenCalled()
    expect(target.applyExternalEffect.mock.calls[0][0].roll.hits).toBe(9)
  })
})
