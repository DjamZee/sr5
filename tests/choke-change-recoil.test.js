import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

// Rosine's review of M3 D2: a choke changed alone in the roll dialog is a simple action that does not fire, so it
// ends the progressive recoil (SR5 p. 178, 182). The roll reset the cumulative recoil when firing, but the dice pool
// shown still counted it: the recoil is now worked out again, as for a change of firing mode.
describe("a choke changed in the roll dialog", () => {
  let saved
  const weapon = {
    system: {
      choke: "",
      firingMode: {
        singleShot: false, semiAutomatic: true, burstFire: false, fullyAutomatic: false, current: "SA"
      },
      isWireless: false,
      accessory: [],
    }
  }
  beforeEach(() => {
    saved = {
      fromUuid: globalThis.fromUuid, actors: globalThis.game.actors
    }
    globalThis.fromUuid = async () => weapon
    globalThis.game.actors = {
      get: () => ({
        system: {
        }
      })
    }
  })
  afterEach(() => {
    globalThis.fromUuid = saved.fromUuid
    globalThis.game.actors = saved.actors
  })

  const dialog = () => {
    const fields = {
    }
    const html = {
      querySelector: sel => (fields[sel] ??= {
        value: 0, style: {
        }
      }),
      querySelectorAll: () => [],
    }
    const dialogData = {
      owner: {
        actorId: "a", itemUuid: "w"
      },
      dicePool: {
        base: 8, modifiers: [{
          type: "recoil", label: "recoil", value: -4
        }]
      },
      limit: {
        modifiers: {
        }
      },
      target: {
        range: "short"
      },
      various: {
      },
      combat: {
        firingMode: {
          selected: "SA"
        },
        choke: {
          selected: "narrow"
        },
        recoil: {
          cumulative: 3, compensationActor: 0, compensationWeapon: 0
        },
        ammo: {
        },
        actions: [],
      },
    }
    const roll = new SR5_RollDialog({
      position: {
      }, setPosition: () => {}
    }, null, dialogData)
    return {
      roll, html, dialogData, fields
    }
  }
  const change = (roll, html, dialogData, value) => roll._selectModifiers({
    currentTarget: {
      dataset: {
        target: "dicePoolModChoke", modifier: "chokeSettings"
      }
    },
    target: {
      value
    },
  }, html, dialogData)

  it("drops the cumulative recoil from the dice pool once the change costs a simple action", async () => {
    const {
      roll, html, dialogData
    } = dialog()
    await change(roll, html, dialogData, "medium")
    expect(dialogData.combat.actions.some(a => a.source === "changeChokeSettings" && a.type === "simple")).toBe(true)
    expect(dialogData.dicePool.modifiers.filter(m => m.type === "recoil")).toEqual([expect.objectContaining({
      value: -1
    })])
  })
})
