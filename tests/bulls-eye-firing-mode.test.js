import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"
import {
  SR5_CalledShotHelpers
} from "../modules/rolls/roll-helpers/calledShot.js"

// Run & Gun p. 130 (Coup double / Rafale dans le mille): AP + weapon's base AP × bullets of the burst,
// at most ×3. The bonus was worked out once, when the called shot was picked: changing the firing
// mode afterwards kept the AP of the old mode.
describe("Bull's Eye Double-Tap armor penetration", () => {
  it("counts the bullets of the firing mode, at most three", () => {
    expect(SR5_CalledShotHelpers.bullsEyeArmorPenetration(-1, -2, "SA")).toBe(-3)
    expect(SR5_CalledShotHelpers.bullsEyeArmorPenetration(-1, -2, "BF")).toBe(-7)
    expect(SR5_CalledShotHelpers.bullsEyeArmorPenetration(-1, -2, "FA")).toBe(-7)
  })

  describe("in the roll dialog", () => {
    let saved
    const weapon = {
      system: {
        armorPenetration: {
          base: -2
        },
        firingMode: {
          singleShot: false, semiAutomatic: true, burstFire: true, fullyAutomatic: false, current: ""
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

    it("works the AP out again when the firing mode changes after the called shot", async () => {
      const fields = {
      }
      const html = {
        querySelector: sel => (fields[sel] ??= {
          value: 0, style: {
          }
        }),
        querySelectorAll: () => [],
      }
      // Bull's Eye picked in semi-automatic: -1 (ammo) + -2 × 1
      const dialogData = {
        owner: {
          actorId: "a", itemUuid: "w"
        },
        dicePool: {
          base: 8, modifiers: []
        },
        limit: {
          modifiers: {
          }
        },
        various: {
        },
        combat: {
          armorPenetration: -3,
          armorPenetrationBeforeCalledShot: -1,
          calledShot: {
            name: "bullsEye"
          },
          firingMode: {
            selected: "SA", actionSpent: true
          },
          actions: [],
        },
      }
      const roll = new SR5_RollDialog({
        position: {
        }, setPosition: () => {}
      }, null, dialogData)
      roll.calculRecoil = () => 0
      await roll._selectModifiers({
        currentTarget: {
          dataset: {
            target: "dicePoolModFiringMode", modifier: "firingMode"
          }
        },
        target: {
          value: "BF"
        },
      }, html, dialogData)
      expect(dialogData.combat.armorPenetration).toBe(-7)
    })
  })
})
