import {
  describe, it, expect, beforeEach, vi
} from "vitest"

//The card as the GM wrote it: its reading again is tested in attack-card.test.js
vi.mock('../modules/rolls/roll-helpers/attack-card.js', async (importOriginal) => ({
  ...(await importOriginal()),
  trustedResistanceCard: async () => true,
}))
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"

// Lancelot (relecture groupée, F9): a drone hit under its rigger dealt no biofeedback while the rigger's sheet said AR,
// though the drone's tests took "Réalité virtuelle +2". Jumped in, the rigger is in cold or hot sim (SR5 p. 268): the
// half of the damage comes to him as biofeedback, Stun in cold sim, Physical in hot sim (SR5 p. 230)

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: vi.fn()
    }
  }
})

const rigger = userMode => ({
  id: "r1", type: "actorPc", system: {
    matrix: {
      userMode, resistances: {
        biofeedback: {
          dicePool: 7, modifiers: []
        }
      }
    }
  }
})

const chatData = (jumpedIn) => ({
  owner: {
  }, roll: {
    hits: 0, netHits: 0
  }, damage: {
    value: 3, type: "", resistanceType: "biofeedback"
  }, combat: {
    armorPenetration: 0, calledShot: {
    }, grenade: {
    }
  }, previousMessage: {
  }, magic: {
  }, test: {
  }, chatCard: {
    buttons: {
    }
  }, ...(jumpedIn ? {
    jumpedIn: true
  } : {
  }),
})

const rollData = () => ({
  damage: {
  }, previousMessage: {
  }, combat: {
  }, test: {
  }, threshold: {
  }, matrix: {
  }, dicePool: {
    modifiers: []
  }
})

describe("biofeedback of a drone hit under its rigger (SR5 p. 268)", () => {
  it("a rigger jumped in with a sheet in AR resists it, Stun as in cold sim", async () => {
    const r = await resistance(rollData(), "resistanceCard", rigger("ar"), chatData(true))
    expect(r?.test.typeSub).toBe("biofeedbackDamage")
    expect(r.damage.type).toBe("stun")
  })
  it("in hot sim, Physical", async () => {
    const r = await resistance(rollData(), "resistanceCard", rigger("hotsim"), chatData(true))
    expect(r.damage.type).toBe("physical")
  })
  it("a decker in AR stays immune (SR5 p. 231)", async () => {
    const r = await resistance(rollData(), "resistanceCard", rigger("ar"), chatData(false))
    expect(r).toBeFalsy()
    expect(ui.notifications.info).toHaveBeenCalled()
  })
})
