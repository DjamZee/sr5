import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5Combat
} from "../modules/system/srcombat.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  sr5HookUpdateActor
} from "../modules/hooks/actor.js"

// An attribute changed on the sheet (Reaction 0 -> 3, Intuition 0 -> 2) left the fighter at its initiative:
// the updateActor hook only compared on initiatives, condition monitors or matrix, so the change waited for the
// next wound to show (measured in game: 2, then 7 at the next condition monitor update)

let actor, combatant, saved
beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = (k) => k
  globalThis.game.i18n.format = (k) => k
  saved = {
    user: game.user, users: game.users, combat: game.combat
  }
  game.user = {
    id: "gm", isGM: true
  }
  game.users = {
    activeGM: game.user
  }
  actor = {
    id: "pc", type: "actorPc", isToken: false, items: [], testUserPermission: () => false,
    system: {
      initiatives: {
        physicalInit: {
          isActive: true, value: 5, dice: {
            value: 1
          }
        }
      }
    }
  }
  combatant = {
    id: "c", tokenId: "t", actorId: "pc", actor, initiative: 2, name: "c", token: {
      actorLink: true
    },
    flags: {
      sr5: {
        currentInitRating: 0, currentInitDice: 1, hasPlayed: false
      }
    },
    combat: {
      current: {
        combatantId: "c"
      }
    },
    update: vi.fn(async function (data){
      if ("initiative" in data) this.initiative = data.initiative
      this.flags.sr5.currentInitRating = data["flags.sr5.currentInitRating"] ?? this.flags.sr5.currentInitRating
    })
  }
  game.combat = {
    combatants: [combatant]
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => actor)
})

afterEach(() => {
  game.user = saved.user
  game.users = saved.users
  game.combat = saved.combat
  vi.restoreAllMocks()
})

describe("an attribute change moves the initiative at once", () => {
  it("an update of the attributes adjusts the fighter, once", async () => {
    const data = {
      system: {
        attributes: {
          reaction: {
            natural: {
              base: 3
            }
          }
        }
      }
    }
    await sr5HookUpdateActor(actor, data, {
    }, "gm")
    await sr5HookUpdateActor(actor, data, {
    }, "gm")
    expect(combatant.initiative).toBe(7)
  })

  it("an item switched from the sheet (written through the actor) adjusts the fighter too", async () => {
    // Wired reflexes (1) switched on: measured in game, the fighter stayed at 12 with 7 + 2D6 prepared
    await sr5HookUpdateActor(actor, {
      items: [{
        _id: "wr", system: {
          isActive: true
        }
      }]
    }, {
    }, "gm")
    expect(combatant.initiative).toBe(7)
  })

  it("an update that cannot change the initiative is not compared", () => {
    expect(SR5Combat.updateMovesInitiative({
      name: "x"
    })).toBe(false)
    expect(SR5Combat.updateMovesInitiative({
      system: {
        biography: "x"
      }
    })).toBe(false)
  })
})
