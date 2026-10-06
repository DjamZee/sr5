import {
  describe, it, expect, vi, beforeAll, beforeEach
} from "vitest"

// Défauts mesurés en jeu par Bruno (mesures E, 06/10) :
// D1 : deux bonus de Limite du même type (Armure SWAT : +2 et +1 sans fil à l'Intimidation) s'écrasaient dans la
//      fenêtre de jet : Limite 9 sur la fiche, 7 dans le jet.
// D2 : Peau en granit (Run Faster p. 80) : « pour les tests de résistance aux dommages, elle n'offre que les 2 succès
//      automatiques » : contre le feu aussi, ses 4 points ne donnent aucun dé.
// D3 : Augmentation de densité osseuse (SR5 p. 462) : Constitution + indice « pour résister aux dommages (à
//      l'exception de ceux causés par les drogues, toxines et maladies) » : feu, électricité et chute compris.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_PrepareRollHelper
} from "../modules/rolls/roll-prepare-helpers.js"
import {
  syncBackgroundCount
} from "../modules/rolls/roll-helpers/skillAttribute.js"
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5
} from "../modules/config.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})
beforeEach(() => {
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: () => {}
    }
  }
})

const mod = (source, value, type) => ({
  source, type, value
})
const limitOf = (rollData) => rollData.limit.base + Object.values(rollData.limit.modifiers).reduce((s, m) => s + m.value, 0)

describe("D1 : deux bonus de Limite du même type s'additionnent dans le jet", () => {
  it("Armure SWAT : Limite d'Intimidation 9 sur la fiche, 9 dans le jet", () => {
    const modifiers = [mod("Armure SWAT", 2, "itemArmor"), mod("Armure SWAT (sans fil)", 1, "itemArmor")]
    const rollData = {
      limit: {
        modifiers: {
        }
      }
    }
    rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(9, modifiers)
    rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, modifiers)
    expect(rollData.limit.base).toBe(6)
    expect(Object.keys(rollData.limit.modifiers)).toHaveLength(2)
    expect(limitOf(rollData)).toBe(9)
  })

  it("un type seul garde sa clé (les autres lectures par type restent valables)", () => {
    const rollData = {
      limit: {
        modifiers: {
        }
      }
    }
    SR5_PrepareRollHelper.getLimitModifiers(rollData, [mod("Lunettes", 1, "itemGear")])
    expect(rollData.limit.modifiers.itemGear).toEqual({
      label: "Lunettes", value: 1
    })
  })

  it("le bruit de fond rangé sous une seconde clé est bien retiré quand l'attribut change", () => {
    const bg = mod("Bruit de fond aligné", 2, "aligned")
    const rollData = {
      dicePool: {
        modifiers: []
      }, limit: {
        modifiers: {
        }
      }
    }
    SR5_PrepareRollHelper.getLimitModifiers(rollData, [mod("Autre", 1, "aligned"), bg])
    syncBackgroundCount(rollData, {
      value: 2, modifiers: [bg]
    }, false)
    expect(Object.values(rollData.limit.modifiers).map(m => m.label)).toEqual(["Autre"])
  })
})

function graniteActor(){
  const granite = mod("Peau en granit", 4, "itemQuality")
  const fireMods = [mod("Constitution", 4, "linkedAttribute"), granite]
  return {
    id: "a", type: "actorPc", system: {
      itemsProperties: {
        armor: {
          value: 4, modifiers: [granite], specialDamage: {
            fire: {
              value: 0, modifiers: []
            }
          }
        }
      },
      resistances: {
        specialDamage: {
          fire: {
            modifiers: fireMods, dicePool: 8
          }
        }
      },
      specialProperties: {
        hardenedArmorHitsOnly: true, hardenedArmors: {
          normalWeapon: {
            value: 4, modifiers: [granite]
          }
        }
      },
    }
  }
}

function fireChatData(){
  return {
    owner: {
      messageId: "m1"
    }, roll: {
      hits: 0, netHits: 0
    },
    damage: {
      value: 8, type: "physical", element: "fire", resistanceType: "physicalDamage", isAttack: true
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
  }
}

describe("D2 : Peau en granit contre le feu (Run Faster p. 80)", () => {
  it("Constitution seule : 4 dés, pas 8", async () => {
    const r = await resistance({
      damage: {
      }, previousMessage: {
      }, combat: {
      }, test: {
      }, threshold: {
      }, dicePool: {
        modifiers: []
      }
    }, "resistanceCard", graniteActor(), fireChatData())
    expect(r.dicePool.base + r.dicePool.modifiers.reduce((s, m) => s + m.value, 0)).toBe(4)
    expect(r.dicePool.composition.map(m => m.source)).toEqual(["Constitution"])
  })
})

function boneDensityActor(){
  const pool = (modifiers = []) => ({
    base: 0, value: 0, dicePool: 0, modifiers
  })
  const specialDamage = {
  }, armorSpecial = {
  }
  for (let element of Object.keys(SR5.specialDamageTypes)){
    specialDamage[element] = pool()
    armorSpecial[element] = pool()
  }
  return {
    type: "actorPc", system: {
      attributes: {
        body: {
          augmented: {
            value: 4
          }
        }, willpower: {
          augmented: {
            value: 3
          }
        }, logic: {
          augmented: {
            value: 3
          }
        }
      },
      itemsProperties: {
        armor: {
          ...pool(), specialDamage: armorSpecial
        }
      },
      // As the item effect leaves it: bone density 2 on the physical damage resistance
      resistances: {
        physicalDamage: pool([mod("Augmentation de densité osseuse", 2, "itemBioware")]), fall: pool(), specialDamage,
      },
    }
  }
}

describe("D3 : Augmentation de densité osseuse contre tous les dommages (SR5 p. 462)", () => {
  it("physique : 4 + 2", () => {
    const actor = boneDensityActor()
    SR5_CharacterUtility.updateResistances(actor)
    expect(actor.system.resistances.physicalDamage.dicePool).toBe(6)
  })
  it("feu et électricité : 4 + 2", () => {
    const actor = boneDensityActor()
    SR5_CharacterUtility.updateResistances(actor)
    expect(actor.system.resistances.specialDamage.fire.dicePool).toBe(6)
    expect(actor.system.resistances.specialDamage.electricity.dicePool).toBe(6)
  })
  it("chute : 4 + 2", () => {
    const actor = boneDensityActor()
    SR5_CharacterUtility.updateResistances(actor)
    expect(actor.system.resistances.fall.dicePool).toBe(6)
  })
  it("toxine : rien (« à l'exception des drogues, toxines et maladies »)", () => {
    const actor = boneDensityActor()
    SR5_CharacterUtility.updateResistances(actor)
    expect(actor.system.resistances.specialDamage.toxin.dicePool).toBe(4)
  })
  // Grimoire des Ombres p. 105 : « Les attaques de pollution sont traitées comme des attaques de toxine », la radiation aussi
  it("pollution et radiation : rien, ce sont des attaques de toxine (Grimoire des Ombres p. 105)", () => {
    const actor = boneDensityActor()
    SR5_CharacterUtility.updateResistances(actor)
    expect(actor.system.resistances.specialDamage.pollution.dicePool).toBe(4)
    expect(actor.system.resistances.specialDamage.radiation.dicePool).toBe(4)
  })
})
