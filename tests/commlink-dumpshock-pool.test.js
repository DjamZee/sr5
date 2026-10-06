import {
  describe, it, expect, beforeAll
} from "vitest"

// SR5 p. 229 and 231: biofeedback and dumpshock are resisted with Willpower + Firewall. A commlink with a sim module
// goes into VR as a deck does, and its pools were left empty: "LANCER LES DÉS (0)" (Lars's measure, 06/10).

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
})

const pool = () => ({
  base: 0, value: 0, dicePool: 0, modifiers: []
})

function hacker(deviceType) {
  return {
    actor: {
      type: "actorPc",
      system: {
        attributes: {
          willpower: {
            augmented: {
              value: 4
            }
          }
        },
        specialAttributes: {
        },
        matrix: {
          attributes: {
            firewall: {
              value: 3
            }
          },
          resistances: new Proxy({
          }, {
            get: (target, key) => (target[key] ??= pool())
          }),
        },
      },
    },
    item: {
      name: "Appareil", system: {
        type: deviceType, deviceRating: 3
      }
    },
  }
}

describe("dumpshock and biofeedback pools (SR5 p. 229, 231)", () => {
  it.each(["commlink", "cyberdeck"])("are Willpower + Firewall with a %s", (deviceType) => {
    const {
      actor, item
    } = hacker(deviceType)
    SR5_CharacterUtility.generateMatrixResistances(actor, item)
    const resistances = actor.system.matrix.resistances
    for (const key of ["dumpshock", "biofeedback"]) {
      expect(resistances[key].dicePool).toBe(7)
      expect(resistances[key].modifiers.map(m => m.type)).toEqual(["linkedAttribute", "matrixAttribute"])
    }
  })
})
