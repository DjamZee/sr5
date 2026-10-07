import {
  describe, it, expect
} from 'vitest'
import {
  vehicleModKind, fittedMods, fittedRating
} from '../modules/system/vehicle-mods.js'

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
