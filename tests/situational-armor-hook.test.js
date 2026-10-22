import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"

//The card as a GM wrote it: its reading again is tested in attack-card.test.js and vd-carte-branchement.test.js
vi.mock('../modules/rolls/roll-helpers/attack-card.js', async (importOriginal) => ({
  ...(await importOriginal()),
  trustedResistanceCard: async () => true,
  trustedAttackCard: async chatData => chatData,
}))
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"
import {
  situationalArmorFor, situationalAttackOf, SITUATIONAL_ARMOR_HOOK
} from "../modules/system/house-rule-hooks.js"

// sr5.situationalArmor : un module ajoute de l'Armure contre une attaque (champ cinétique de Technologie prototype),
// comptée avant le plafond de la PA (SR5 p. 171) et avant la comparaison VD / Armure modifiée qui fait passer les
// dommages en étourdissants (SR5 p. 170). Sans abonné : le livre.

function hooksWith(...fns) {
  return {
    events: {
      [SITUATIONAL_ARMOR_HOOK]: fns.map((fn, i) => ({
        fn, id: i
      }))
    }, off: () => {}
  }
}

function actor({
  vest = 9, fire = 0
} = {
}) {
  const armorMods = [{
    source: "Veste pare-balles", type: "armor", value: vest
  }]
  const resistMods = [{
    source: "Constitution", type: "linkedAttribute", value: 4
  }, ...armorMods]
  const fireMods = [...resistMods, ...(fire ? [{
    source: "Ignifuge", type: "armor", value: fire
  }] : [])]
  return {
    id: "a", type: "actorPc", system: {
      itemsProperties: {
        armor: {
          value: vest, modifiers: armorMods, specialDamage: {
            fire: {
              value: fire
            }
          }
        }
      },
      resistances: {
        physicalDamage: {
          modifiers: resistMods, dicePool: 4 + vest
        },
        specialDamage: {
          fire: {
            modifiers: fireMods, dicePool: 4 + vest + fire
          }
        }
      },
      specialProperties: {
      },
    }
  }
}

function card(dv, ap, {
  element = "", typeSub = "rangedWeapon", source = ""
} = {
}) {
  return {
    owner: {
      messageId: "m1"
    },
    roll: {
      hits: 0, netHits: 0
    },
    damage: {
      value: dv, type: "physical", element, source, resistanceType: "physicalDamage", isAttack: true
    },
    combat: {
      armorPenetration: ap, calledShot: {
      }, grenade: {
      }, weaponType: "heavyPistol", ammo: {
        type: "regular"
      }, firingMode: {
        selected: "SA"
      }
    },
    previousMessage: {
    },
    magic: {
    },
    test: {
      type: "attack", typeSub
    },
  }
}

function rollData() {
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

let subscribers = []
beforeEach(() => {
  subscribers = []
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: () => {}
    }
  }
  globalThis.Hooks = {
    get events() {
      return {
        [SITUATIONAL_ARMOR_HOOK]: subscribers.map((fn, i) => ({
          fn, id: i
        }))
      }
    }, off: () => {}
  }
})
afterEach(() => {
  delete globalThis.Hooks
})

async function resist(a, c) {
  const r = await resistance(rollData(), "resistanceCard", a, c)
  return {
    dice: r.dicePool.base + r.dicePool.modifiers.reduce((s, m) => s + m.value, 0), type: r.damage.type, r
  }
}

const kinetic = data => {
  if (data.attack.category === "rangedWeapon" && !data.attack.magical) data.bonuses.push({
    label: "Champ cinétique", source: "Technologie prototype", value: 4
  })
}

describe("situationalArmorFor", () => {
  it("sans abonné : rien", () => expect(situationalArmorFor({
    card: card(8, 0)
  }, {
    hooks: hooksWith()
  })).toEqual({
    lines: [], value: 0
  }))
  it("additionne les lignes", () => expect(situationalArmorFor({
    card: card(8, 0)
  }, {
    hooks: hooksWith(kinetic, d => d.bonuses.push({
      label: "Abri", value: 2
    }))
  }).value).toBe(6))
  it("écarte une valeur hors de 1 à 20, non entière, ou sans libellé", () => expect(situationalArmorFor({
    card: card(8, 0)
  }, {
    hooks: hooksWith(d => d.bonuses.push({
      label: "a", value: 0
    }, {
      label: "b", value: 21
    }, {
      label: "c", value: 1.5
    }, {
      value: 3
    }, {
      label: "d", value: -2
    }))
  }).value).toBe(0))
  it("un abonné qui plante est ignoré, les autres gardés (D1)", () => expect(situationalArmorFor({
    card: card(8, 0)
  }, {
    hooks: hooksWith(d => {
      d.bonuses.push({
        label: "faux", value: 20
      }); throw new Error("x")
    }, kinetic)
  }).value).toBe(4))
  it("lit la carte : catégorie, arme, élément, magie", () => expect(situationalAttackOf(card(8, -2, {
    element: "fire", source: "magical"
  }))).toMatchObject({
    testType: "attack", category: "rangedWeapon", weaponType: "heavyPistol", ammoType: "regular", element: "fire",
    magical: true, armorPenetration: -2
  }))
})

describe("au test de résistance", () => {
  it("sans abonné : le livre (Constitution 4 + veste 9, PA -2)", async () => {
    const {
      dice, type
    } = await resist(actor(), card(10, -2))
    expect(dice).toBe(11)
    expect(type).toBe("physical")
  })
  it("le champ ajoute ses dés", async () => {
    subscribers.push(kinetic)
    expect((await resist(actor(), card(14, 0))).dice).toBe(17)
  })
  it("VD 10 < 9 + 4 - 2 : passe en étourdissants grâce au champ", async () => {
    subscribers.push(kinetic)
    const {
      type, r
    } = await resist(actor(), card(10, -2))
    expect(type).toBe("stun")
    expect(r.combat.situationalArmor).toBe(4)
  })
  it("plafond de la PA : il compte l'Armure du champ (veste 2 + champ 4, PA -10 → -6)", async () => {
    subscribers.push(kinetic)
    const {
      r
    } = await resist(actor({
      vest: 2
    }), card(14, -10))
    expect(r.dicePool.modifiers.find(m => m.type === "armorPenetration").value).toBe(-6)
  })
  it("ne touche pas la composition de l'acteur", async () => {
    subscribers.push(kinetic)
    const a = actor()
    await resist(a, card(14, 0))
    expect(a.system.resistances.physicalDamage.modifiers).toHaveLength(2)
  })
  it("le module choisit : rien contre une arme de mêlée", async () => {
    subscribers.push(kinetic)
    expect((await resist(actor(), card(14, 0, {
      typeSub: "meleeWeapon"
    }))).dice).toBe(13)
  })
  it("dommages élémentaires : l'élément est lu, l'Armure ajoutée", async () => {
    subscribers.push(d => {
      if (d.attack.element === "fire") d.bonuses.push({
        label: "Écran", value: 3
      })
    })
    expect((await resist(actor({
      fire: 2
    }), card(14, 0, {
      element: "fire"
    }))).dice).toBe(18)
  })
})
