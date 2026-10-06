import {
  describe, it, expect, vi, beforeEach
} from "vitest"
import fs from "node:fs"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  ritualDrainType
} = await import("../modules/rolls/roll-helpers/ritualTeam.js")
const {
  default: defenseResultInfo
} = await import("../modules/rolls/roll-test-case/test-DefenseResult.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")

// M5 D2 (mesuré par Elsa, 06/10) : SR5 p. 299, errata « attribut Magie » au lieu de « test de Magie » : le Drain d'un
// rituel est physique si les succès du leader dépassent sa Magie. Le code lisait deux champs que rien n'écrit.

const leader = (magic, archivist = 0) => ({
  system: {
    specialAttributes: {
      magic: {
        augmented: {
          value: magic
        }
      }
    }, magic: {
      masteries: {
        archivist: {
          value: archivist
        }
      }
    }
  }
})

function card(opposingHits){
  return {
    test: {
      type: "ritualResistance"
    }, roll: {
      hits: opposingHits
    }, owner: {
      actorId: "leader"
    }, previousMessage: {
      messageId: "seal"
    },
    magic: {
      force: 8, reagentsSpent: 0, drain: {
        value: 0, modifiers: {
        }
      }
    },
    chatCard: {
      buttons: {
      }
    },
  }
}

beforeEach(() => {
  globalThis.game.i18n = {
    localize: k => k, format: k => k
  }
  globalThis.game.messages = new Map([["seal", {
    flags: {
      sr5data: {
        roll: {
          hits: 8
        }
      }
    }
  }]])
})

describe("M5 D2 : Drain physique d'un rituel (SR5 p. 299, errata)", () => {
  it("physique au-delà de la Magie du leader, étourdissant sinon", () => {
    expect(ritualDrainType(8, 6)).toBe("physical")
    expect(ritualDrainType(6, 6)).toBe("stun")
    expect(ritualDrainType(undefined, 6)).toBe("stun")
  })

  it("carte de résistance : 8 succès du leader contre Magie 6 → physique", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(leader(6))
    const data = card(7)
    await defenseResultInfo(data, "ritualResistance").catch(() => {})
    expect(data.magic.drain.type).toBe("physical")
  })

  it("Magie lue sur la fiche du leader (8) → étourdissant", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(leader(8))
    const data = card(7)
    await defenseResultInfo(data, "ritualResistance").catch(() => {})
    expect(data.magic.drain.type).toBe("stun")
  })

  it("Archiviste compte la Magie plus haut (Arcanes interdites p. 32)", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(leader(6, 2))
    const data = card(7)
    await defenseResultInfo(data, "ritualResistance").catch(() => {})
    expect(data.magic.drain.type).toBe("stun")
  })

  it("plus aucune lecture des champs jamais écrits", () => {
    const source = fs.readFileSync("modules/rolls/roll-test-case/test-DefenseResult.js", "utf8")
    expect(source).not.toMatch(/prevData\.actorMagic|prevData\.test\.realHits/)
  })
})
