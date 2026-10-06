import {
  describe, it, expect, vi, beforeAll
} from "vitest"

// G3 (décision de DjamZ, 06/10) : Dur à cuire (SR5 p. 76), le mentor Ours (p. 326) et la pneumaticité squelettique
// (Chrome Flesh p. 167) n'ont pas l'exception « toxines » au livre : ils comptent aussi contre les toxines (et donc
// la pollution et la radiation, Grimoire des Ombres p. 105). Seules la densité osseuse et l'ossature renforcée
// gardent la leur (SR5 p. 458/462).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

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
})

const mod = (source, value, type) => ({
  source, type, value
})
const pool = (modifiers = []) => ({
  base: 0, value: 0, dicePool: 0, modifiers
})

// Body 4, Willpower 3; the physical damage resistance holds what the item effects left on it
function actorWith(modifiers, items = []){
  const specialDamage = {
  }, armorSpecial = {
  }, toxin = {
  }, armorToxin = {
  }
  for (let element of Object.keys(SR5.specialDamageTypes)){
    specialDamage[element] = pool()
    armorSpecial[element] = pool()
  }
  for (let vector of Object.keys(SR5.propagationVectors)){
    toxin[vector] = pool()
    armorToxin[vector] = pool()
  }
  return {
    type: "actorPc", items, system: {
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
          ...pool(), specialDamage: armorSpecial, toxin: armorToxin
        }
      },
      resistances: {
        physicalDamage: pool(modifiers), fall: pool(), specialDamage, toxin
      },
    }
  }
}

const elemental = (actor, element) => actor.system.resistances.specialDamage[element].dicePool
const toxinTest = actor => actor.system.resistances.toxin.injection.dicePool

describe("G3 : Dur à cuire, Ours et pneumaticité contre les toxines", () => {
  it("Dur à cuire : +1 contre la toxine élémentaire et au test de résistance aux toxines", () => {
    const actor = actorWith([mod("Dur à cuire", 1, "itemQuality")])
    SR5_CharacterUtility.updateResistances(actor)
    expect(elemental(actor, "toxin")).toBe(5)
    expect(elemental(actor, "pollution")).toBe(5)
    expect(elemental(actor, "radiation")).toBe(5)
    expect(toxinTest(actor)).toBe(4 + 3 + 1)
  })

  it("Ours : +2 contre les toxines aussi", () => {
    const actor = actorWith([mod("Ours", 2, "itemMentorSpirit")])
    SR5_CharacterUtility.updateResistances(actor)
    expect(elemental(actor, "toxin")).toBe(6)
    expect(toxinTest(actor)).toBe(4 + 3 + 2)
  })

  it("pneumaticité squelettique (génétique) : -1 contre les toxines aussi", () => {
    const actor = actorWith([mod("Pneumaticité squelettique", -1, "itemAugmentation")], [{
      type: "itemAugmentation", name: "Pneumaticité squelettique", system: {
        type: "genetech"
      }
    }])
    SR5_CharacterUtility.updateResistances(actor)
    expect(elemental(actor, "toxin")).toBe(3)
    expect(toxinTest(actor)).toBe(4 + 3 - 1)
  })

  it("densité osseuse et ossature renforcée gardent leur exception (SR5 p. 458/462)", () => {
    const actor = actorWith([
      mod("Augmentation de densité osseuse", 2, "itemAugmentation"),
      mod("Ossature renforcée (Titane)", 3, "itemAugmentation"),
      mod("Dur à cuire", 1, "itemQuality"),
    ], [{
      type: "itemAugmentation", name: "Augmentation de densité osseuse", system: {
        type: "bioware"
      }
    }, {
      type: "itemAugmentation", name: "Ossature renforcée (Titane)", system: {
        type: "cyberware"
      }
    }])
    SR5_CharacterUtility.updateResistances(actor)
    expect(elemental(actor, "fire")).toBe(4 + 2 + 3 + 1)
    expect(elemental(actor, "toxin")).toBe(4 + 1)
    expect(toxinTest(actor)).toBe(4 + 3 + 1)
  })
})
