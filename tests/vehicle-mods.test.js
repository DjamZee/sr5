import {
  describe, it, expect
} from 'vitest'
import {
  vehicleModKind, fittedMods, fittedRating, replacedVehicleAttribute, replacedVehicleAttributeOf
} from '../modules/system/vehicle-mods.js'
import {
  droneAutopilot
} from '../modules/entities/actors/rcc.js'

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
