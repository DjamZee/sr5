import {
  describe, it, expect
} from 'vitest'
import {
  vehicleModKind, fittedMods, fittedRating, replacedVehicleAttribute, replacedVehicleAttributeOf, armorCapReduction, addedArmor,
  hasBullBar, modSlotUse, slotsRefusal
} from '../modules/system/vehicle-mods.js'
import {
  droneAutopilot
} from '../modules/entities/actors/rcc.js'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'

const mod = (name, system = {
}) => ({
  type: "itemVehicleMod", name, system: {
    isActive: true, itemRating: 0, ...system
  }
})

describe('The kind of a vehicle mod (Rigger 5.0 p. 153-173)', () => {
  it('reads the kind chosen on the sheet first', () => {
    expect(vehicleModKind(mod("Mon blindage maison", {
      effectKind: "armor"
    }))).toBe("armor")
    expect(vehicleModKind(mod("Pare-buffle", {
      effectKind: "nonsense"
    }))).toBe("")
  })
  it('knows the Mégapack mods by their name', () => {
    expect(vehicleModKind(mod("Pare-buffle"))).toBe("bullBar")
    expect(vehicleModKind(mod("Remplacement de l'Autopilote (indice 4-7)"))).toBe("autopilotReplacement")
    expect(vehicleModKind(mod("Remplacement de l’Autopilote"))).toBe("autopilotReplacement")
    expect(vehicleModKind(mod("Remplacement des Senseurs (indice 1-3)"))).toBe("sensorReplacement")
    expect(vehicleModKind(mod("Blindage (standard)"))).toBe("armor")
    expect(vehicleModKind(mod("Blindage (dissimulé)"))).toBe("armor")
    expect(vehicleModKind(mod("Système de protection des passagers (SPP)"))).toBe("passengerProtection")
    expect(vehicleModKind(mod("Cocon de rigger"))).toBe("riggerCocoon")
    expect(vehicleModKind(mod("Senseurs tactiles"))).toBe("tactileSensors")
    expect(vehicleModKind(mod("Camouflage de la signature"))).toBe("signatureMasking")
    expect(vehicleModKind(mod("Adaptation métahumaine (troll)"))).toBe("metahumanAdaptation")
  })
  it('does not take the other armor mods for the Armor mod', () => {
    expect(vehicleModKind(mod("Blindage personnel renforcé"))).toBe("")
    expect(vehicleModKind(mod("Blindage électromagnétique"))).toBe("")
    expect(vehicleModKind(mod("Blindage spécifique"))).toBe("")
  })
  it('only reads vehicle mods', () => {
    expect(vehicleModKind({
      type: "itemGear", name: "Pare-buffle", system: {
      }
    })).toBe("")
  })
  it('counts the fitted mods only, factory ones on demand', () => {
    const items = [mod("Pare-buffle"), mod("Pare-buffle", {
      isActive: false
    }), mod("Camouflage de la signature", {
      itemRating: 3, isFactory: true
    }), mod("Camouflage de la signature", {
      itemRating: 2
    })]
    expect(fittedMods(items, "bullBar")).toHaveLength(1)
    expect(fittedRating(items, "signatureMasking")).toBe(3)
    expect(fittedRating(items, "signatureMasking", {
      factory: false
    })).toBe(2)
    expect(fittedRating(items, "riggerCocoon")).toBe(0)
  })
})

describe('Autopilot and Sensor replacement (Rigger 5.0 p. 170)', () => {
  const replacement = (name, rating, extra = {
  }) => mod(name, {
    itemRating: rating, customEffects: {
      0: {
        target: name.includes("Senseurs") ? "system.attributes.sensor.augmented" : "system.attributes.pilot.augmented", type: "ratingReplace", multiplier: 1
      }
    }, ...extra
  })
  it('the replacement gives the value, it does not add to it', () => {
    expect(replacedVehicleAttribute([replacement("Remplacement de l'Autopilote (indice 4-7)", 5)], "pilot")).toBe(5)
    expect(replacedVehicleAttribute([replacement("Remplacement des Senseurs (indice 1-3)", 3)], "sensor")).toBe(3)
    expect(replacedVehicleAttribute([replacement("Remplacement des Senseurs (indice 1-3)", 3)], "pilot")).toBe(null)
  })
  it('a mod known by its kind alone replaces too, the highest wins', () => {
    expect(replacedVehicleAttribute([mod("Autopilote maison", {
      effectKind: "autopilotReplacement", itemRating: 4
    }), replacement("Remplacement de l'Autopilote (indice 1-3)", 2)], "pilot")).toBe(4)
  })
  it('a factory or a switched off replacement changes nothing', () => {
    expect(replacedVehicleAttribute([replacement("Remplacement de l'Autopilote", 6, {
      isFactory: true
    })], "pilot")).toBe(null)
    expect(replacedVehicleAttribute([replacement("Remplacement de l'Autopilote", 6, {
      isActive: false
    })], "pilot")).toBe(null)
  })
  it('tells the effects it reads in the base', () => {
    expect(replacedVehicleAttributeOf({
      target: "system.attributes.pilot.augmented", type: "ratingReplace"
    })).toBe("pilot")
    expect(replacedVehicleAttributeOf({
      target: "system.attributes.pilot.augmented", type: "rating"
    })).toBe(null)
    expect(replacedVehicleAttributeOf({
      target: "system.attributes.handling.augmented", type: "valueReplace"
    })).toBe(null)
  })
  it('the drone autopilot that caps its autosofts reads the replacement, then the bonuses', () => {
    const items = [replacement("Remplacement de l'Autopilote", 5), mod("Bonus", {
      itemRating: 1, customEffects: {
        0: {
          target: "system.attributes.pilot.augmented", type: "rating", multiplier: 1
        }
      }
    })]
    expect(droneAutopilot({
      attributes: {
        pilot: {
          natural: {
            base: 2
          }
        }
      }
    }, items)).toBe(6)
  })
})

describe('Armor added to a vehicle: at most its Body (Rigger 5.0 p. 161)', () => {
  it('takes off what goes beyond the Body', () => {
    expect(armorCapReduction(6, 4)).toBe(2)
    expect(armorCapReduction(4, 4)).toBe(0)
    expect(armorCapReduction(2, 4)).toBe(0)
  })
  it('counts the armor of the fitted Armor mods only, factory left out', () => {
    const items = [mod("Blindage (standard)", {
      itemRating: 5
    }), mod("Blindage (dissimulé)", {
      itemRating: 2, isFactory: true
    }), mod("Monture d'arme manuelle protégée")]
    const modifiers = [{
      source: "Blindage (standard)", value: 5
    }, {
      source: "Monture d'arme manuelle protégée", value: 6
    }, {
      source: "Blindage (dissimulé)", value: 2
    }]
    expect(addedArmor(items, modifiers)).toBe(5)
  })
})

describe('Ram plate (Rigger 5.0 p. 164)', () => {
  it('is read on the fitted mods', () => {
    expect(hasBullBar([mod("Pare-buffle")])).toBe(true)
    expect(hasBullBar([mod("Pare-buffle", {
      isActive: false
    })])).toBe(false)
  })
  it('the collision table keeps its values, one step up with a ram plate, never beyond the last', () => {
    expect(SR5_ConverterHelpers.collisionDamage(10, 3)).toBe(10)
    expect(SR5_ConverterHelpers.collisionDamage(10, 3, 1)).toBe(20)
    expect(SR5_ConverterHelpers.collisionDamage(5, 1, 1)).toBe(5)
    expect(SR5_ConverterHelpers.collisionDamage(10, 11, 1)).toBe(100)
    expect(SR5_ConverterHelpers.collisionDamage(10, 0, 1)).toBe(0)
    expect(SR5_ConverterHelpers.collisionDamageMeters(10, 30)).toBe(10)
    expect(SR5_ConverterHelpers.collisionDamageMeters(10, 30, 1)).toBe(20)
  })
  it('raises the damage dealt, not the damage the rammer takes', () => {
    const ramming = {
      targetIsVehicle: true, angle: "side", attackerSpeed: 3, attackerLocomotion: "ground", bullBar: true
    }
    const base = SR5_ConverterHelpers.rammingAttackDamage(ramming, 10)
    expect(base).toBe(20)
    expect(ramming.bullBarBonus).toBe(10)
    const damages = SR5_ConverterHelpers.rammingDefenseDamages(ramming, {
      defenderIsVehicle: true, defenderBody: 8, damageBase: base, netHits: 2
    })
    expect(damages.target).toBe(22)
    expect(damages.initiator).toBe(6)
  })
  it('without a ram plate nothing changes', () => {
    const ramming = {
      targetIsVehicle: true, angle: "side", attackerSpeed: 3, attackerLocomotion: "ground"
    }
    expect(SR5_ConverterHelpers.rammingAttackDamage(ramming, 10)).toBe(10)
    expect(ramming.bullBarBonus).toBe(0)
  })
})

describe('Slots cannot be gone beyond (Rigger 5.0 p. 153-154)', () => {
  const use = (type, slots, extra = {
  }) => ({
    type, isActive: true, slots: {
      value: slots
    }, ...extra
  })
  const free = {
    weapons: {
      value: 1
    }, protection: {
      value: 0
    }
  }
  it('reads the slots a fitted mod takes, factory ones even switched off', () => {
    expect(modSlotUse(use("weapons", 2))).toEqual({
      category: "weapons", slots: 2
    })
    expect(modSlotUse(use("weapons", 2, {
      isActive: false
    }))).toBe(null)
    expect(modSlotUse(use("weapons", 2, {
      isActive: false, isFactory: true
    }))).toEqual({
      category: "weapons", slots: 2
    })
    expect(modSlotUse(use("equipment", 2))).toBe(null)
  })
  it('refuses a mod fitted beyond the slots left', () => {
    expect(slotsRefusal(free, null, {
      category: "weapons", slots: 2
    })).toEqual({
      category: "weapons", needed: 2, free: 1
    })
    expect(slotsRefusal(free, null, {
      category: "weapons", slots: 1
    })).toBe(null)
  })
  it('a mod that grows counts what it already held', () => {
    expect(slotsRefusal(free, {
      category: "weapons", slots: 2
    }, {
      category: "weapons", slots: 3
    })).toBe(null)
    expect(slotsRefusal(free, {
      category: "weapons", slots: 2
    }, {
      category: "weapons", slots: 4
    })).toEqual({
      category: "weapons", needed: 4, free: 3
    })
  })
  it('never refuses a change that takes no more, even on a vehicle already over its slots', () => {
    const over = {
      protection: {
        value: -2
      }
    }
    expect(slotsRefusal(over, {
      category: "protection", slots: 3
    }, {
      category: "protection", slots: 3
    })).toBe(null)
    expect(slotsRefusal(over, {
      category: "protection", slots: 3
    }, null)).toBe(null)
  })
})
