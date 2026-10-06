import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  toxinCardPower, toxinCardVerdict, toxinVectors
} from '../modules/rolls/roll-helpers/toxin-card.js'

//Liesel's D1 (06/10): a player's toxin card named the GM's actor, 99P and Nausea + Paralysis, and the GM's click applied
//it as written. The GM reads the toxin on the weapon, counts the hits again, and confirms
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
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

const dice = (...results) => ({
  terms: [{
    results: results.map(result => ({
      result, active: true
    }))
  }]
})

describe("toxinCardPower", () => {
  it("is the weapon's Power less the antitoxin", () => {
    expect(toxinCardPower({
      power: 15, antitoxin: 4
    })).toBe(11)
  })
  it("adds 2 for a called shot at the toxin, 1 per extra dose", () => {
    expect(toxinCardPower({
      power: 15, calledShot: "downTheGullet", doses: 3
    })).toBe(19)
  })
  it("adds the net hits of an engulf", () => {
    expect(toxinCardPower({
      power: 8, toxinType: "airEngulf", engulfNetHits: 3
    })).toBe(11)
  })
  it("never goes below 0, whatever the doses claimed", () => {
    expect(toxinCardPower({
      power: 4, doses: -5, antitoxin: 9
    })).toBe(0)
  })
})

describe("toxinCardVerdict", () => {
  const base = {
    authorOwnsTarget: true, sourceFound: true, power: 15, pool: 4, edge: 0
  }
  it("refuses a card whose author does not own the poisoned actor", () => {
    expect(toxinCardVerdict({
      ...base, authorOwnsTarget: false, rollJSON: dice(5)
    })).toEqual({
      ok: false, reason: "notOwner"
    })
  })
  it("refuses a card whose toxin cannot be read on a weapon", () => {
    expect(toxinCardVerdict({
      ...base, sourceFound: false, rollJSON: dice(5)
    }).reason).toBe("noSource")
  })
  it("refuses a card without dice", () => {
    expect(toxinCardVerdict({
      ...base, rollJSON: null
    }).reason).toBe("noDice")
  })
  it("counts the hits within the pool: 12 sixes on 4 dice give 4", () => {
    const v = toxinCardVerdict({
      ...base, rollJSON: dice(6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6), claimedHits: 12
    })
    expect([v.ok, v.hits, v.value, v.mismatch]).toEqual([true, 4, 11, true])
  })
  it("keeps a true card as it is", () => {
    const v = toxinCardVerdict({
      ...base, rollJSON: dice(5, 1, 6, 2), claimedHits: 2
    })
    expect([v.hits, v.value, v.mismatch]).toEqual([2, 13, false])
  })
})

describe("toxinVectors", () => {
  it("lists the vectors that are on", () => {
    expect(toxinVectors({
      vector: {
        contact: false, injection: true, inhalation: true
      }
    })).toEqual(["injection", "inhalation"])
  })
})

describe("checkToxinCard, the GM's click on a player's card", () => {
  const clo = {
    id: "clo", isGM: false, name: "Clo"
  }
  const gm = {
    id: "gm", isGM: true, name: "MJ"
  }
  const sheet = (owner) => ({
    id: owner, uuid: `Actor.${owner}`, name: owner, items: [],
    testUserPermission: (user) => user.isGM || user.id === owner,
    system: {
      resistances: {
        toxin: {
          injection: {
            dicePool: 11
          }, contact: {
            dicePool: 9
          }, inhalation: {
            dicePool: 9
          }
        }
      },
      specialAttributes: {
        edge: {
          augmented: {
            value: 2
          }
        }
      },
      specialProperties: {
      },
    },
  })
  const razor = sheet("clo")
  const cible = sheet("nobody")
  const shooter = sheet("gm-npc")
  const narcoject = {
    name: "Pistolet à fléchettes", uuid: "Actor.gm-npc.Item.dart", parent: shooter,
    system: {
      damageElement: "toxin", toxin: {
        type: "narcoject", vector: {
          injection: true
        }, effect: {
          nausea: false, paralysis: false
        }, speed: 0, power: 15, penetration: 0, damageType: "stun"
      }
    }
  }
  const attack = {
    author: gm, flags: {
      sr5data: {
        owner: {
          actorId: "gm-npc", itemUuid: narcoject.uuid
        }, roll: {
          hits: 3
        }, combat: {
          calledShot: {
          }
        }, damage: {
          value: 0
        }, previousMessage: {
        }
      }
    }
  }
  const defense = {
    author: clo, flags: {
      sr5data: {
        owner: {
          actorId: "clo"
        }, roll: {
          hits: 1, netHits: 2
        }, previousMessage: {
          messageId: "attack"
        }
      }
    }
  }
  //What Liesel wrote: the GM's actor, 99P, Nausea and Paralysis, and 13 hits on the card
  const forged = (actorId, author = clo) => ({
    id: "forged", author, flags: {
      sr5data: {
        owner: {
          speakerId: actorId, actorId
        }, toxinDoses: 1,
        roll: {
          hits: 13, r: dice(6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6)
        },
        damage: {
          value: 99, type: "physical", base: 99, toxin: {
            ...narcoject.system.toxin, power: 99, damageType: "physical", effect: {
              nausea: true, paralysis: true
            }
          }
        },
        previousMessage: {
          messageId: "defense"
        },
        chatCard: {
          buttons: {
            toxinEffect: {
            }
          }
        },
      }
    }
  })
  let confirm, whispered
  beforeEach(() => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(id => ({
      clo: razor, nobody: cible, "gm-npc": shooter
    })[id])
    vi.spyOn(SR5_PrepareRollTest, "getBaseRollData").mockImplementation(() => ({
      damage: {
      }, combat: {
        ammo: {
        }
      }
    }))
    vi.spyOn(SR5_MiscellaneousHelpers, "isConsumed").mockReturnValue(false)
    vi.spyOn(SR5_MiscellaneousHelpers, "consume").mockResolvedValue(true)
    whispered = vi.spyOn(SR5_ActorHelper, "whisperGM").mockResolvedValue()
    globalThis.fromUuidSync = uuid => uuid === narcoject.uuid ? narcoject : null
    confirm = vi.fn(async () => true)
    globalThis.foundry.applications.api = {
      ...(globalThis.foundry.applications.api ?? {
      }), DialogV2: {
        confirm
      }
    }
    globalThis.foundry.utils.escapeHTML ??= s => s
    globalThis.game.user = gm
    globalThis.game.i18n.format = k => k
    globalThis.game.messages = new Map([["attack", attack], ["defense", defense]])
  })
  afterEach(() => vi.restoreAllMocks())

  it("refuses the card that poisons the GM's actor, without a window", async () => {
    expect(await SR5_ActorHelper.checkToxinCard(forged("nobody"), cible)).toBeNull()
    expect(confirm).not.toHaveBeenCalled()
    expect(whispered).toHaveBeenCalledOnce()
  })
  it("on the player's own actor, applies the weapon's toxin and the hits of the pool, never the card's", async () => {
    const data = await SR5_ActorHelper.checkToxinCard(forged("clo"), razor)
    expect(confirm).toHaveBeenCalledOnce()
    //Narcoject 15S, 11 + 2 (Chance) dice: 13 hits at most, 2S
    expect([data.damage.value, data.damage.type, data.damage.toxin.power]).toEqual([2, "stun", 15])
    expect(data.damage.toxin.effect).toEqual({
      nausea: false, paralysis: false
    })
    expect(data.damage.base).toBe(0)
  })
  it("applies nothing when the GM says no", async () => {
    confirm.mockResolvedValue(false)
    expect(await SR5_ActorHelper.checkToxinCard(forged("clo"), razor)).toBeNull()
  })
  it("refuses a card spent already (its copy has the same dice)", async () => {
    SR5_MiscellaneousHelpers.isConsumed.mockReturnValue(true)
    expect(await SR5_ActorHelper.checkToxinCard(forged("clo"), razor)).toBeNull()
    expect(confirm).not.toHaveBeenCalled()
  })
  it("refuses a card whose attack card the shooter's owner did not write", async () => {
    globalThis.game.messages = new Map([["attack", {
      ...attack, author: clo
    }], ["defense", defense]])
    expect(await SR5_ActorHelper.checkToxinCard(forged("clo"), razor)).toBeNull()
  })
  it("leaves a GM's card as it is", async () => {
    const card = forged("nobody", gm)
    expect(await SR5_ActorHelper.checkToxinCard(card, cible)).toBe(card.flags.sr5data)
  })
})
