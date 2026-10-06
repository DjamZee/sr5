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
    expect(patient.applyExternalEffect.mock.calls[0][0].owner.messageId).toBe("m1")
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
