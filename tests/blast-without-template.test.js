import {
  describe, it, expect, beforeEach, vi
} from "vitest"

//The card as a GM wrote it: its reading again is tested in attack-card.test.js and vd-carte-branchement.test.js
vi.mock('../modules/rolls/roll-helpers/attack-card.js', async (importOriginal) => ({
  ...(await importOriginal()),
  trustedResistanceCard: async () => true,
}))
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"

// Resisting a grenade whose template was removed after the throw measured the blast from nowhere: the DV came out
// NaN, with no warning. With no point to measure from, the resistance now warns and does not open.

let warned

beforeEach(() => {
  warned = []
  globalThis.ui = {
    notifications: {
      warn: (m) => warned.push(m), info: () => {}
    }
  }
  const templates = []
  templates.get = () => undefined
  globalThis.canvas = {
    scene: {
      templates, tokens: [], grid: {
        size: 100
      }
    }
  }
})

const chatData = {
  owner: {
    itemId: "grenade", messageId: "m1"
  },
  roll: {
    hits: 0, netHits: 0
  },
  damage: {
    value: 16, base: 16, type: "physical", element: "", resistanceType: "physicalDamage"
  },
  combat: {
    calledShot: {
    },
    grenade: {
      isGrenade: true, templateId: "removed", damageFallOff: -2
    }
  },
}

function rollData(){
  return {
    damage: {
    }, previousMessage: {
    }, combat: {
    }, test: {
    }, threshold: {
    }
  }
}

describe("resisting a blast whose template is gone", () => {
  it("warns and does not open the resistance", async () => {
    const actor = {
      id: "a", system: {
      }
    }
    const result = await resistance(rollData(), "resistanceCard", actor, structuredClone(chatData))
    expect(result).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NoTemplateForBlast"])
  })
})
