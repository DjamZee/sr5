import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  effectCardVerdict, readsRoll
} from '../modules/rolls/roll-helpers/effect-card.js'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  replacedValue
} from '../modules/entities/actors/effect-replace.js'

//A player's card is its author's to write: forged at 12 hits, the GM must not pass 12 on (Animal Sense, the Limit
//becomes the net hits, Street Grimoire p. 106)
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

const sixes = n => ({
  terms: [{
    results: Array.from({
      length: n
    }, () => ({
      result: 6, active: true
    }))
  }]
})

describe("effectCardVerdict", () => {
  const base = {
    authorOwnsCaster: true, itemOnCaster: true, pool: 4, edge: 0, force: 3, magic: 3
  }
  it("counts the forged card again: 12 sixes on a 4-dice pool, Force 3, give 3", () => {
    const v = effectCardVerdict({
      ...base, rollJSON: sixes(12), claimedHits: 12, claimedNetHits: 12
    })
    expect([v.ok, v.hits, v.netHits, v.overPool, v.mismatch]).toEqual([true, 3, 3, true, true])
  })
  it("keeps what the card took off the hits for the net hits", () => {
    const v = effectCardVerdict({
      ...base, force: 6, rollJSON: sixes(4), claimedHits: 4, claimedNetHits: 1
    })
    expect([v.hits, v.netHits, v.mismatch]).toEqual([4, 1, false])
  })
  it("rejects a card whose author does not own the caster", () => {
    expect(effectCardVerdict({
      ...base, authorOwnsCaster: false, rollJSON: sixes(2)
    }).ok).toBe(false)
  })
  it("rejects a card without dice", () => {
    expect(effectCardVerdict({
      ...base, rollJSON: undefined
    }).reason).toBe("dice")
  })
  it("knows which effects read the roll", () => {
    expect(readsRoll({
      0: {
        transfer: true, type: "netHitsReplace"
      }
    })).toBe(true)
    expect(readsRoll({
      0: {
        transfer: true, type: "value"
      }
    })).toBe(false)
  })
})

describe("applyExternalEffect with a forged card, applied by the GM", () => {
  let created, confirm
  const caster = {
    id: "caster", testUserPermission: (u, level) => u.id === "player" && level === "OWNER",
    system: {
      skills: {
        spellcasting: {
          spellCategory: {
            detection: {
              dicePool: 4
            }
          }, test: {
            dicePool: 4
          }
        }
      },
      specialAttributes: {
        magic: {
          augmented: {
            value: 3
          }
        }, edge: {
          augmented: {
            value: 0
          }
        }
      },
    },
  }
  const target = {
    isToken: false, items: [], createEmbeddedDocuments: async (_, docs) => {
      created = docs[0]; throw new Error("stop")
    }
  }
  const spell = {
    name: "Sens animal", type: "itemSpell", parent: caster, system: {
      category: "detection", itemRating: 0, targetOfEffect: {
      }, systemEffects: {
      }, customEffects: {
        0: {
          category: "skills", target: "system.skills.perception.limit", type: "netHitsReplace", transfer: true
        }
      }
    }
  }
  const forged = (author) => ({
    owner: {
      itemUuid: "Item.spell", actorId: "caster", speakerActor: "Mage", messageId: "msg"
    },
    roll: {
      hits: 12, netHits: 12, r: sixes(12)
    }, magic: {
      force: 3
    }, test: {
      type: "spell"
    },
    _author: author,
  })
  beforeEach(() => {
    created = undefined
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(id => id === "caster" ? caster : target)
    vi.spyOn(SR5_EntityHelpers, "getLabelByKey").mockReturnValue("label")
    globalThis.fromUuid = async () => spell
    confirm = vi.fn(async () => true)
    globalThis.foundry.applications.api = {
      ...(globalThis.foundry.applications.api ?? {
      }), DialogV2: {
        confirm
      }
    }
    globalThis.ChatMessage = {
      create: vi.fn(async () => ({
      }))
    }
    globalThis.game.user = {
      id: "gm", isGM: true
    }
    globalThis.game.users = [{
      id: "gm", isGM: true
    }]
    globalThis.game.i18n.format = k => k
  })
  afterEach(() => vi.restoreAllMocks())
  const setAuthor = author => {
    globalThis.game.messages = {
      get: id => id === "msg" ? {
        author
      } : undefined
    }
  }

  it("passes on the hits counted again, never the 12 written on the card", async () => {
    setAuthor({
      id: "player", isGM: false, name: "Joueuse"
    })
    await SR5_ActorHelper.applyExternalEffect("target", forged(), "customEffects").catch(() => {})
    expect(confirm).toHaveBeenCalledOnce()
    expect(created["system.customEffects"][0].value).toBe(3)
  })
  it("applies nothing when the GM declines", async () => {
    setAuthor({
      id: "player", isGM: false, name: "Joueuse"
    })
    confirm.mockResolvedValueOnce(false)
    await SR5_ActorHelper.applyExternalEffect("target", forged(), "customEffects")
    expect(created).toBeUndefined()
  })
  it("rejects the card of a player who does not own the caster, and warns the GM", async () => {
    setAuthor({
      id: "other", isGM: false, name: "Autre"
    })
    await SR5_ActorHelper.applyExternalEffect("target", forged(), "customEffects")
    expect(created).toBeUndefined()
    expect(globalThis.ChatMessage.create).toHaveBeenCalledOnce()
  })
  it("trusts the GM's own card (counter-proof)", async () => {
    setAuthor({
      id: "gm", isGM: true, name: "MJ"
    })
    await SR5_ActorHelper.applyExternalEffect("target", forged(), "customEffects").catch(() => {})
    expect(confirm).not.toHaveBeenCalled()
    expect(created["system.customEffects"][0].value).toBe(12)
  })
})

//AutoVoice (No Future p. 157): the rating replaces the limit for singing only, a situational box
describe("situational replacing effect", () => {
  it("gives the rating as the value of a ratingReplace", async () => {
    const {
      situationalValue
    } = await import('../modules/rolls/roll-helpers/situational.js')
    expect(situationalValue({
      type: "ratingReplace", target: "system.skills.performance.limit"
    }, {
      itemRating: 4
    })).toBe(4)
    //Not on a dice pool, where the box would add it like a bonus
    expect(situationalValue({
      type: "ratingReplace", target: "system.skills.performance.test"
    }, {
      itemRating: 4
    })).toBeNull()
  })
  it("leaves a marker of 0, not a replacement, on the sheet", () => {
    const limit = {
      base: "socialLimit", value: 0, modifiers: []
    }
    const actor = {
      system: {
        skills: {
          performance: {
            limit
          }
        }
      }
    }
    SR5_CharacterUtility.registerSituationalEffect({
      name: "AutoVoice", system: {
        itemRating: 4
      }
    }, actor, {
      category: "skills", target: "system.skills.performance.limit", type: "ratingReplace", situational: true, when: "pour les tests de chant"
    })
    expect(replacedValue(limit.modifiers)).toBeUndefined()
    expect(limit.modifiers[0].value).toBe(0)
    expect(actor.situationalEffects[0]).toMatchObject({
      value: 4, replace: true, when: "pour les tests de chant"
    })
  })
})

//The replacing modifier is marked by itself, not as "the last one of the list"
describe("replacing modifier", () => {
  it("stays marked when a non-cumulative modifier of the same type was there before", () => {
    const limit = {
      base: "socialLimit", value: 0, modifiers: [{
        source: "Autre", type: "itemGear", value: 2
      }]
    }
    SR5_CharacterUtility.applyCustomEffects({
      name: "Instruments Big time", type: "itemGear", system: {
        isActive: true, customEffects: [{
          category: "skills", target: "system.skills.performance.limit", type: "valueReplace", value: 8, multiplier: 1, cumulative: false, wifi: false
        }]
      }
    }, {
      system: {
        skills: {
          performance: {
            limit
          }
        }
      }
    })
    expect(limit.modifiers.map(m => [m.source, m.value, !!m.replace])).toEqual([["Autre", 2, false], ["Instruments Big time", 8, true]])
    expect(replacedValue(limit.modifiers)).toBe(8)
  })
})
