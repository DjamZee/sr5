import {
  describe, it, expect
} from "vitest"
import {
  accessoryCapacity, capacityTaken, enhancementFits, scopeVision
} from "../modules/entities/items/weapon-accessory-rules.js"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"

// SR5 p. 434-435: imaging scope and periscope "une Capacité de 3 pour contenir des améliorations de vision (voir
// p. 447)", a smartgun's camera "une Capacité de 1". The enhancements mounted in a scope count for the shots of its
// weapon only (arbitrage de DjamZ, 06/10, as the weapon flashlight).

const accessory = (name, over = {
}) => ({
  _id: over._id ?? name, name, isActive: true, system: {
    weaponAccessory: {
      specialEffect: over.specialEffect ?? "", capacity: over.capacity ?? 0, visionEnhancements: over.mounted ?? []
    }
  }
})
const enhancement = (id, capacity, customEffects = {
}, isActive = true) => ({
  _id: id, name: id, system: {
    isActive, capacityTaken: {
      base: capacity, value: capacity
    }, customEffects
  }
})
const THERMO = {
  0: {
    target: "system.visions.thermographic.augmented", type: "boolean", value: "true"
  }
}
const LOWLIGHT = {
  0: {
    target: "system.visions.lowLight.augmented", type: "boolean", value: "true"
  }
}
const FLARE = {
  0: {
    target: "system.itemsProperties.environmentalMod.glare", type: "value", value: -2
  }
}

describe("Capacity of a weapon accessory (SR5 p. 434-435)", () => {
  it("the book's for a known accessory, the written one otherwise", () => {
    expect(accessoryCapacity(accessory("Lunette de visée", {
      specialEffect: "imagingScope"
    }))).toBe(3)
    expect(accessoryCapacity(accessory("Périscope"))).toBe(3)
    expect(accessoryCapacity(accessory("Système smartgun (externe)", {
      specialEffect: "smartgunExternal"
    }))).toBe(1)
    expect(accessoryCapacity(accessory("Bipied"))).toBe(0)
    expect(accessoryCapacity(accessory("Lunette maison", {
      capacity: 4
    }))).toBe(4)
  })

  it("counts what the mounted enhancements take, and refuses one that does not fit", () => {
    const scope = accessory("Lunette de visée", {
      specialEffect: "imagingScope", mounted: [enhancement("a", 1), enhancement("b", 1)]
    })
    expect(capacityTaken(scope.system.weaponAccessory.visionEnhancements)).toBe(2)
    expect(enhancementFits(scope, enhancement("c", 1))).toBe(true)
    expect(enhancementFits(scope, enhancement("d", 2))).toBe(false)
    expect(enhancementFits(accessory("Bipied"), enhancement("e", 1))).toBe(false)
  })
})

describe("Vision enhancements of a scope count for its weapon's shots", () => {
  const thermo = enhancement("thermo", 1, THERMO)
  const scope = accessory("Lunette de visée", {
    specialEffect: "imagingScope", mounted: [thermo]
  })
  const items = new Map([[scope._id, scope], [thermo._id, thermo]])
  const getItem = id => items.get(id)

  it("reads the mounted enhancement and the scope's zoom", () => {
    expect(scopeVision({
      isActive: true, accessory: [scope]
    }, getItem)).toEqual({
      lowLight: false, thermographic: true, glare: 0, zoom: true
    })
  })

  it("nothing when the weapon, the scope or the enhancement is off", () => {
    expect(scopeVision({
      isActive: false, accessory: [scope]
    }, getItem).thermographic).toBe(false)
    expect(scopeVision({
      isActive: true, accessory: [{
        ...scope, isActive: false
      }]
    }, getItem)).toMatchObject({
      thermographic: false, zoom: false
    })
    const off = enhancement("off", 1, LOWLIGHT, false)
    const scope2 = accessory("Lunette", {
      _id: "s2", specialEffect: "imagingScope", mounted: [off]
    })
    expect(scopeVision({
      isActive: true, accessory: [scope2]
    }, id => (id === "off" ? off : scope2)).lowLight).toBe(false)
  })

  it("a mounted enhancement is found as plugged in the accessory", () => {
    const actor = {
      items: [{
        type: "itemWeapon", system: scope.system
      }]
    }
    expect(SR5_UtilityItem.weaponAccessoryHost("thermo", actor)).toBeTruthy()
    expect(SR5_UtilityItem.weaponAccessoryHost("autre", actor)).toBeUndefined()
  })
})

describe("The scope's vision in the environment of the shot (SR5 p. 176-177)", () => {
  const scene = flags => ({
    id: "s", getFlag: (_m, key) => flags[key] ?? 0
  })
  const shooter = (visions = {
  }, glare = 0) => ({
    itemsProperties: {
      environmentalMod: {
        visibility: {
          value: 0
        }, light: {
          value: 0
        }, glare: {
          value: glare
        }, wind: {
          value: 0
        }
      }
    },
    visions: {
      lowLight: {
        isActive: false
      }, thermographic: {
        isActive: false
      }, ultrasound: {
        isActive: false
      }, ...visions
    },
  })
  const columns = (flags, actor, vision) => SR5_CombatHelpers.environmentalColumns(scene(flags), actor, false, undefined, false, 0, null, vision)

  it("thermographic: a row off light and visibility, not twice with the character's own", () => {
    expect(columns({
      environModLight: 2, environModVisibility: 2
    }, shooter(), {
      thermographic: true
    }).slice(0, 2)).toEqual([1, 1])
    expect(columns({
      environModLight: 2
    }, shooter({
      thermographic: {
        isActive: true
      }
    }), {
      thermographic: true
    })[1]).toBe(2)
  })

  it("low-light: partial and dim light count as full light, not total darkness", () => {
    expect(columns({
      environModLight: 2
    }, shooter(), {
      lowLight: true
    })[1]).toBe(0)
    expect(columns({
      environModLight: 3
    }, shooter(), {
      lowLight: true
    })[1]).toBe(3)
  })

  it("flare compensation: the better of the scope's and the character's, never added", () => {
    expect(columns({
      environModGlare: 3
    }, shooter(), {
      glare: -2
    })[1]).toBe(1)
    expect(columns({
      environModGlare: 3
    }, shooter({
    }, -2), {
      glare: -2
    })[1]).toBe(1)
    expect(columns({
      environModGlare: 3
    }, shooter({
    }, 1), {
      glare: 0
    })[1]).toBe(4)
  })

  it("without a scope, nothing changes", () => {
    expect(columns({
      environModLight: 2
    }, shooter(), null)[1]).toBe(2)
  })
})

describe("Flare compensation in a scope", () => {
  it("is read as the Mégapack writes it (customEffects on the glare row)", () => {
    const flare = enhancement("flare", 1, FLARE)
    const scope = accessory("Lunette de visée", {
      specialEffect: "imagingScope", mounted: [flare]
    })
    expect(scopeVision({
      isActive: true, accessory: [scope]
    }, id => (id === "flare" ? flare : scope)).glare).toBe(-2)
  })
})
