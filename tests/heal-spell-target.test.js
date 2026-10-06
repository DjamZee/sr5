import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Soins (SR5 p. 291) : « Appliquer l'effet » soignait le lanceur sélectionné, jamais le jeton ciblé. Le patient est
// désormais la cible ; une joueuse qui soigne un PNJ qu'elle ne possède pas passe par le MJ, qui relit la carte
// lui-même (jamais la requête), n'accepte que l'autrice de la carte, une seule fois.

const {
  healPatient, healsDamage
} = await import("../modules/rolls/roll-helpers/cardRoller.js")
const {
  SR5_ActorHelper
} = await import("../modules/entities/actors/entityActor-helpers.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  SR5_RollMessage
} = await import("../modules/rolls/roll-message.js")

const HEAL = {
  0: {
    target: "physical.removeDamage", type: "hits", transfer: true
  }
}

describe("le patient de Soins", () => {
  const caster = {
      name: "lanceur"
    }, wounded = {
      name: "blessé"
    }
  it("est le jeton ciblé, pas le lanceur sélectionné", () => expect(healPatient(new Set([{
    actor: wounded
  }]), caster)).toBe(wounded))
  it("sans cible : le jeton sélectionné, comme avant", () => expect(healPatient(new Set(), caster)).toBe(caster))
  it("plusieurs cibles : personne", () => expect(healPatient(new Set([{
    actor: wounded
  }, {
    actor: caster
  }]), caster)).toBeNull()
  )
  it("Soins retire des dommages ; un effet non transmis ou d'une autre cible, non", () => {
    expect(healsDamage(HEAL)).toBe(true)
    expect(healsDamage({
      0: {
        ...HEAL[0], transfer: false
      }
    })).toBe(false)
    expect(healsDamage({
      0: {
        target: "system.attributes.body.augmented", transfer: true
      }
    })).toBe(false)
  })
})

describe("le MJ applique Soins pour une joueuse", () => {
  let patient, card, updateButton
  beforeEach(() => {
    patient = {
      applyExternalEffect: vi.fn()
    }
    card = {
      id: "m1", author: {
        id: "joueuse"
      }, flags: {
        sr5data: {
          owner: {
            itemUuid: "Item.soins"
          }, chatCard: {
            buttons: {
              applyEffect: {
              }
            }
          }
        }
      }
    }
    const store = {
    }
    const gm = {
      id: "mj", isGM: true
    }
    globalThis.game = {
      ...globalThis.game, messages: {
        get: id => (id === "m1" ? card : undefined)
      }, user: gm, users: {
        activeGM: gm
      }, settings: {
        get: (s, k) => store[k], set: async (s, k, v) => {
          store[k] = v
        }
      }
    }
    globalThis.fromUuid = async () => ({
      system: {
        customEffects: HEAL
      }
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(patient)
    updateButton = vi.spyOn(SR5_RollMessage, "updateChatButton").mockResolvedValue()
    // The GM's yes on the hits counted again (checkEffectCard), measured elsewhere
    vi.spyOn(SR5_ActorHelper, "checkEffectCard").mockResolvedValue({
      hits: 3, netHits: 2
    })
  })
  const ask = (senderId, data = {
    messageId: "m1", targetActor: "pnj"
  }) => SR5_ActorHelper._socketApplyHealEffect({
    data
  }, senderId)

  it("l'autrice de la carte : l'effet part, lu sur la carte du journal, et le bouton est retiré", async () => {
    await ask("joueuse")
    expect(updateButton).toHaveBeenCalledWith("m1", "applyEffect")
    expect(patient.applyExternalEffect).toHaveBeenCalledTimes(1)
    // Counted and confirmed before: applied with the GM's figures, without a card to read again
    expect(SR5_ActorHelper.checkEffectCard.mock.calls[0][0].owner.messageId).toBe("m1")
    expect(patient.applyExternalEffect.mock.calls[0][0].roll.hits).toBe(3)
    expect(patient.applyExternalEffect.mock.calls[0][0].owner.messageId).toBe(null)
  })
  it("le MJ répond non : la carte n'est pas consommée et peut être redemandée (Quitterie, S5)", async () => {
    SR5_ActorHelper.checkEffectCard.mockResolvedValueOnce(null)
    await ask("joueuse")
    expect(patient.applyExternalEffect).not.toHaveBeenCalled()
    await ask("joueuse")
    expect(patient.applyExternalEffect).toHaveBeenCalledTimes(1)
  })
  it("une copie de la carte (nouvel id, mêmes dés) ne soigne pas une seconde fois (Quitterie, S4)", async () => {
    card.flags.sr5data.roll = {
      r: JSON.stringify({
        terms: [{
          results: [{
            result: 5
          }, {
            result: 6
          }, {
            result: 2
          }]
        }]
      })
    }
    const copy = {
      ...card, id: "m2", flags: foundry.utils.deepClone(card.flags)
    }
    game.messages.get = id => ({
      m1: card, m2: copy
    })[id]
    await ask("joueuse")
    await ask("joueuse", {
      messageId: "m2", targetActor: "pnj"
    })
    expect(patient.applyExternalEffect).toHaveBeenCalledTimes(1)
  })
  it("une autre joueuse : rien", async () => {
    await ask("autre")
    expect(patient.applyExternalEffect).not.toHaveBeenCalled()
  })
  it("bouton déjà utilisé : rien", async () => {
    delete card.flags.sr5data.chatCard.buttons.applyEffect
    await ask("joueuse")
    expect(patient.applyExternalEffect).not.toHaveBeenCalled()
  })
  it("l'autrice remet le bouton dans sa carte et redemande : rien, le registre du MJ la connaît", async () => {
    await ask("joueuse")
    card.flags.sr5data.chatCard.buttons.applyEffect = {
    }
    await ask("joueuse")
    expect(patient.applyExternalEffect).toHaveBeenCalledTimes(1)
  })
  it("un MJ qui n'est pas le MJ actif n'écrit pas le registre et n'applique rien", async () => {
    game.users.activeGM = {
      id: "autre-mj"
    }
    await ask("joueuse")
    expect(patient.applyExternalEffect).not.toHaveBeenCalled()
  })
  it("Soins sur un grunt soigne son moniteur unique, au lieu de ne rien faire (Quitterie, S2)", async () => {
    const monitors = {
      condition: {
        value: 10, actual: {
          base: 4, value: 4
        }
      }
    }
    const grunt = {
      type: "actorGrunt", system: {
        conditionMonitors: monitors
      }, toObject: () => ({
        system: {
          conditionMonitors: foundry.utils.deepClone(monitors)
        }
      }), update: vi.fn(), items: []
    }
    SR5_EntityHelpers.getRealActorFromID.mockReturnValue(grunt)
    globalThis.fromUuid = async () => ({
      name: "Soins", type: "itemSpell", system: {
        customEffects: HEAL, targetOfEffect: []
      }
    })
    await SR5_ActorHelper.applyExternalEffect("pnj", {
      owner: {
        itemUuid: "Item.soins"
      }, roll: {
        hits: 3, netHits: 3
      }, test: {
      }
    }, "customEffects")
    expect(grunt.update).toHaveBeenCalled()
    expect(grunt.update.mock.calls[0][0].system.conditionMonitors.condition.actual.base).toBe(1)
  })
  it("carte d'un sort qui ne soigne pas : rien", async () => {
    globalThis.fromUuid = async () => ({
      system: {
        customEffects: {
        }
      }
    })
    await ask("joueuse")
    expect(patient.applyExternalEffect).not.toHaveBeenCalled()
  })
})
