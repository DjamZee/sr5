import {
  describe, it, expect, vi, beforeEach
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

// SR5 p. 170: changeActionInCombat takes off the Initiative score the cost of every interruption of the list

const counter = (n) => ({
  value: n, current: n
})

let actor, combatant
beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = (k) => k
  globalThis.game.i18n.format = (k) => k
  actor = {
    id: "pc", name: "PC", items: [], system: {
      specialProperties: {
        actions: {
          free: counter(1), simple: counter(2), complex: counter(1)
        }
      }
    },
    update: vi.fn(), resetRecoil: vi.fn()
  }
  combatant = {
    name: "PC", update: vi.fn()
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockResolvedValue(actor)
  vi.spyOn(SR5Combat, "getCombatantFromActor").mockReturnValue(combatant)
  vi.spyOn(SR5Combat, "changeInitInCombatHelper").mockResolvedValue()
})

describe("changeActionInCombat and interruptions", () => {
  it("takes off the cost of each interruption of the list", async () => {
    await SR5Combat.changeActionInCombat("pc", [
      {
        type: "interruption", value: 1, source: "matrixAction", initiativeCost: 10
      },
      {
        type: "interruption", value: 1, source: "matrixAction"
      },
    ])
    expect(SR5Combat.changeInitInCombatHelper).toHaveBeenCalledTimes(1)
    expect(SR5Combat.changeInitInCombatHelper).toHaveBeenCalledWith("pc", -15)
  })

  //Ruling of DjamZ (2026-10-06, G13): a player does not raise the actions of her character herself
  it("refuses a manual raise of actions from a player, lets a manual cut through", async () => {
    globalThis.game.user = {
      isGM: false
    }
    await SR5Combat.changeActionInCombat("pc", [{
      type: "simple", value: -1, source: "manual"
    }])
    expect(actor.update).not.toHaveBeenCalled()
    expect(combatant.update).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_RaiseActionsGMOnly")
    await SR5Combat.changeActionInCombat("pc", [{
      type: "simple", value: 1, source: "manual"
    }])
    expect(combatant.update).toHaveBeenCalledTimes(1)
  })

  it("lets the GM raise actions by hand", async () => {
    globalThis.game.user = {
      isGM: true
    }
    await SR5Combat.changeActionInCombat("pc", [{
      type: "simple", value: -1, source: "manual"
    }])
    expect(combatant.update).toHaveBeenCalledTimes(1)
  })

  it("leaves the Initiative alone without an interruption", async () => {
    await SR5Combat.changeActionInCombat("pc", [{
      type: "simple", value: 1, source: "attack"
    }])
    expect(SR5Combat.changeInitInCombatHelper).not.toHaveBeenCalled()
  })
})
