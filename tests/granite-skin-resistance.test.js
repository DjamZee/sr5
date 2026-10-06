import {
  describe, it, expect, beforeEach
} from "vitest"
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"

// Run Faster p. 80 (Peau en granit) : Armure +4 qui fonctionne comme Armure renforcée, « mais ce bonus n'est pas
// intégralement cumulable avec celui des autres armures : pour les tests de résistance aux dommages, elle n'offre que
// les 2 succès automatiques ». Ses 4 points ne donnent donc aucun dé, et la PA ne mord que sur les autres armures
// (elle réduit les succès automatiques, SR5 p. 397). Ses 4 points comptent pour la conversion en dommages
// étourdissants (SR5 p. 170) : arbitrage de DjamZ, le livre est muet.

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: () => {}
    }
  }
})

function actor({
  vest = 0, granite = true
} = {
}){
  const graniteMod = {
    source: "Peau en granit", type: "itemQuality", value: 4
  }
  const armorMods = []
  if (vest) armorMods.push({
    source: "Veste pare-balles", type: "armor", value: vest
  })
  if (granite) armorMods.push(graniteMod)
  const resistMods = [{
    source: "Constitution", type: "linkedAttribute", value: 3
  }, ...armorMods]
  return {
    id: "a", type: "actorPc", system: {
      itemsProperties: {
        armor: {
          value: armorMods.reduce((s, m) => s + m.value, 0), modifiers: armorMods
        }
      },
      resistances: {
        physicalDamage: {
          modifiers: resistMods, dicePool: resistMods.reduce((s, m) => s + m.value, 0)
        }
      },
      specialProperties: {
        hardenedArmorHitsOnly: granite,
        hardenedArmors: {
          normalWeapon: {
            value: granite ? 4 : 0, modifiers: granite ? [graniteMod] : []
          }
        }
      },
    }
  }
}

function chatData(dv, ap){
  return {
    owner: {
      messageId: "m1"
    },
    roll: {
      hits: 0, netHits: 0
    },
    damage: {
      value: dv, type: "physical", element: "", resistanceType: "physicalDamage", isAttack: true
    },
    combat: {
      armorPenetration: ap, calledShot: {
      }, grenade: {
      }
    },
    previousMessage: {
    },
    magic: {
    },
    test: {
    },
  }
}

function rollData(){
  return {
    damage: {
    }, previousMessage: {
    }, combat: {
    }, test: {
    }, threshold: {
    }, dicePool: {
      modifiers: []
    }
  }
}

async function pool(a, dv, ap){
  const r = await resistance(rollData(), "resistanceCard", a, chatData(dv, ap))
  return {
    dice: r.dicePool.base + r.dicePool.modifiers.reduce((s, m) => s + m.value, 0), type: r.damage.type
  }
}

describe("Peau en granit, réserve de résistance (Run Faster p. 80)", () => {
  it("PA 0 : Constitution seule, les 4 points ne donnent aucun dé", async () => expect((await pool(actor(), 8, 0)).dice).toBe(3))
  it("PA -2, peau seule : la PA ne mord pas sur la Constitution", async () => expect((await pool(actor(), 8, -2)).dice).toBe(3))
  it("PA -6, peau seule : toujours 3 dés", async () => expect((await pool(actor(), 8, -6)).dice).toBe(3))
  it("veste 12, PA 0 : 3 + 12", async () => expect((await pool(actor({
    vest: 12
  }), 13, 0)).dice).toBe(15))
  it("veste 12, PA -2 : la PA mord sur la veste", async () => expect((await pool(actor({
    vest: 12
  }), 13, -2)).dice).toBe(13))
  it("veste 2, PA -6 : la PA s'arrête à la veste", async () => expect((await pool(actor({
    vest: 2
  }), 13, -6)).dice).toBe(3))
  it("sans Peau en granit, rien ne change : veste 12, PA -2", async () => expect((await pool(actor({
    vest: 12, granite: false
  }), 13, -2)).dice).toBe(13))
})

describe("Peau en granit, conversion en étourdissants (arbitrage de DjamZ)", () => {
  it("veste 12 + peau 4, VD 12 : étourdissants (12 < 16)", async () => expect((await pool(actor({
    vest: 12
  }), 12, 0)).type).toBe("stun"))
  it("veste 12 + peau 4, VD 16 : physiques", async () => expect((await pool(actor({
    vest: 12
  }), 16, 0)).type).toBe("physical"))
})
