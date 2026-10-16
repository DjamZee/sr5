import {
  describe, it, expect, beforeEach, vi
} from "vitest"

//The card as a GM wrote it: its reading again is tested in attack-card.test.js
vi.mock('../modules/rolls/roll-helpers/attack-card.js', async (importOriginal) => ({
  ...(await importOriginal()),
  trustedResistanceCard: async () => true,
}))
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
import resistance from "../modules/rolls/roll-prepare-case/rollData-Resistance.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  isElectricHitOnDevice, deviceElectricResistanceData, deviceElectricPool, electricMatrixDamage
} from "../modules/rolls/roll-helpers/electric-device.js"

// SR5 p. 172-173 : les équipements électroniques « résistent normalement aux dommages et subissent un effet secondaire
// […] des dommages matriciels égaux à la moitié des dommages physiques (arrondis à l'inférieur) ». Un appareil
// n'esquive pas (comme une barrière, p. 198) ; il résiste avec Indice d'appareil × 2 (arbitrage : le livre ne donne
// aucune réserve physique à un appareil, Street Lethal p. 57 donne celle-ci quand le Firewall manque).

const infos = []
beforeEach(() => {
  infos.length = 0
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: m => infos.push(m)
    }
  }
  globalThis.foundry = {
    utils: {
      deepClone: o => structuredClone(o)
    }
  }
})

const device = (rating = 3) => ({
  id: "d", type: "actorDevice", system: {
    matrix: {
      deviceRating: rating
    }, specialProperties: {
    }
  }
})

function attack(element = "electricity", hits = 3){
  return {
    owner: {
      messageId: "m1"
    },
    roll: {
      hits, netHits: 0
    },
    damage: {
      base: 9, value: 9, type: "stun", element, resistanceType: "", isAttack: true
    },
    combat: {
      armorPenetration: -5, calledShot: {
      }, grenade: {
      }
    },
    previousMessage: {
    },
    magic: {
    },
    test: {
      type: "attack", typeSub: "rangedWeapon"
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

describe("Arme électrique contre un appareil (SR5 p. 172-173)", () => {
  it("ne concerne que l'acteur appareil touché par l'électricité", () => {
    expect(isElectricHitOnDevice(device(), attack())).toBe(true)
    expect(isElectricHitOnDevice(device(), attack(""))).toBe(false)
    expect(isElectricHitOnDevice({
      type: "actorPc"
    }, attack())).toBe(false)
    expect(isElectricHitOnDevice({
      type: "actorDrone"
    }, attack())).toBe(false)
  })

  it("pas de défense : VD + tous les succès, toujours physiques, plus une carte d'attaque", () => {
    const a = attack("electricity", 3)
    const data = deviceElectricResistanceData(a)
    expect(data.damage.value).toBe(12)
    expect(data.damage.type).toBe("physical")
    expect(data.damage.resistanceType).toBe("physicalDamage")
    expect(data.roll.netHits).toBe(3)
    expect(data.test.type).toBe("defense")
    expect(a.damage.type).toBe("stun")
  })

  it("réserve : Indice d'appareil × 2", () => {
    expect(deviceElectricPool(device(4), "Indice").reduce((s, m) => s + m.value, 0)).toBe(8)
  })

  it("effet secondaire : moitié des dommages physiques, arrondie à l'inférieur", () => {
    expect(electricMatrixDamage(7)).toBe(3)
    expect(electricMatrixDamage(8)).toBe(4)
    expect(electricMatrixDamage(1)).toBe(0)
    expect(electricMatrixDamage(-2)).toBe(0)
  })

  it("le jet de résistance de l'appareil : Indice × 2, dommages physiques, sans armure", async () => {
    const r = await resistance(rollData(), "resistanceCard", device(3), deviceElectricResistanceData(attack("electricity", 2)))
    expect(r.dicePool.base).toBe(6)
    expect(r.damage.base).toBe(11)
    expect(r.damage.type).toBe("physical")
    expect(r.dicePool.modifiers.some(m => m.type === "armorPenetration")).toBe(false)
  })

  it("appliqués : la moitié des dommages physiques au moniteur matriciel, sans l'effet « Électricité » (mesuré en jeu le 16/10)", async () => {
    const system = {
      specialProperties: {
      }, conditionMonitors: {
        matrix: {
          value: 10, base: 10, modifiers: [], actual: {
            value: 0, base: 0, modifiers: []
          }
        }
      }
    }
    const actor = {
      id: "d1", type: "actorDevice", name: "Caméra", system, items: [],
      toObject: () => JSON.parse(JSON.stringify({
        type: "actorDevice", system
      })),
      update: vi.fn(async () => {}),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => actor)
    vi.spyOn(SR5_ActorHelper, "createDeadEffect").mockImplementation(async () => {})
    const electric = vi.spyOn(SR5_ActorHelper, "electricityDamageEffect").mockImplementation(async () => {})
    await SR5_ActorHelper.takeDamage("d1", {
      damage: {
        value: 8, type: "physical", matrix: {
          value: 0
        }, element: "electricity", isAttack: true
      },
      combat: {
        ammo: {
        }
      },
      threshold: {
      },
    })
    expect(actor.update.mock.calls[0][0]["system.conditionMonitors.matrix.actual.base"]).toBe(4)
    expect(electric).not.toHaveBeenCalled()
  })

  it("une arme non électrique n'atteint pas l'appareil : le MJ est prévenu, aucun jet", async () => {
    const data = deviceElectricResistanceData(attack("electricity"))
    data.damage.element = ""
    expect(await resistance(rollData(), "resistanceCard", device(3), data)).toBeUndefined()
    expect(infos).toContain("SR5.INFO_DeviceOnlyElectricity")
  })
})
