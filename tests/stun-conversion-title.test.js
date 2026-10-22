import {
  describe, it, expect, beforeEach, vi
} from "vitest"

//The card as a GM wrote it: its reading again is tested in attack-card.test.js and vd-carte-branchement.test.js
vi.mock('../modules/rolls/roll-helpers/attack-card.js', async (importOriginal) => ({
  ...(await importOriginal()),
  trustedResistanceCard: async () => true,
}))
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"

// SR5 p. 170 : une Armure supérieure à la VD modifiée change les dommages physiques en étourdissants. Le titre du
// dialogue et de la carte suit ce type (Bérénice#8462, 23/10 : il gardait « Physiques »)

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: () => {}
    }
  }
})

const vest = {
  source: "Veste pare-balles", type: "armor", value: 12
}
const body = {
  source: "Constitution", type: "linkedAttribute", value: 3
}
const actor = {
  id: "a", type: "actorPc", system: {
    itemsProperties: {
      armor: {
        value: 12, modifiers: [vest]
      }
    },
    resistances: {
      physicalDamage: {
        modifiers: [body, vest], dicePool: 15
      }
    },
    specialProperties: {
      hardenedArmors: {
        normalWeapon: {
          value: 0, modifiers: []
        }
      }
    },
  }
}

const chatData = dv => ({
  owner: {
    messageId: "m1"
  }, roll: {
    hits: 0, netHits: 0
  },
  damage: {
    value: dv, type: "physical", element: "", resistanceType: "physicalDamage", isAttack: true
  },
  combat: {
    armorPenetration: 0, calledShot: {
    }, grenade: {
    }
  },
  previousMessage: {
  }, magic: {
  }, test: {
  },
})

const rollData = () => ({
  damage: {
  }, previousMessage: {
  }, combat: {
  }, test: {
  }, threshold: {
  }, dicePool: {
    modifiers: []
  }
})

describe("titre de l'encaissement après conversion en étourdissants (SR5 p. 170)", () => {
  it("Armure 12, VD 8 : dommages étourdissants, titre étourdissants", async () => {
    const r = await resistance(rollData(), "resistanceCard", actor, chatData(8))
    expect(r.damage.type).toBe("stun")
    expect(r.test.title).toContain("SR5.DamageTypeStun")
    expect(r.test.title).not.toContain("SR5.DamageTypePhysical")
  })
  it("Armure 12, VD 14 : dommages physiques, titre physiques", async () => {
    const r = await resistance(rollData(), "resistanceCard", actor, chatData(14))
    expect(r.damage.type).toBe("physical")
    expect(r.test.title).toContain("SR5.DamageTypePhysical")
  })
})

// SR5 p. 231: 6P in hot sim, 6E in cold sim. The reboot has put the sheet back in AR before the test (rebootDeck):
// the mode is the one the character was thrown out of, carried by the card
describe("type du choc d'éjection, au mode quitté (SR5 p. 231)", () => {
  const decker = {
    id: "d", type: "actorPc", system: {
      matrix: {
        userMode: "ar", resistances: {
          dumpshock: {
            dicePool: 6, modifiers: []
          }
        }
      }
    }
  }
  const card = ejectedMode => ({
    owner: {
    }, roll: {
    }, damage: {
      resistanceType: "dumpshock", ejectedMode
    }, combat: {
      calledShot: {
      }, grenade: {
      }
    }, previousMessage: {
    }, magic: {
    }, test: {
    }
  })
  it.each([["hotsim", "physical"], ["coldsim", "stun"]])("éjecté de %s : %s, la fiche déjà en RA", async (mode, type) => {
    const r = await resistance(rollData(), "resistanceCard", decker, card(mode))
    expect(r.damage.type).toBe(type)
    expect(r.damage.base).toBe(6)
  })
})
