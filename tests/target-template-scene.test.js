import {
  describe, it, expect
} from "vitest"
import {
  checkIfTargetIsInTemplate
} from "../modules/rolls/roll-prepare-case/rollData-Weapon.js"

// A linked target is the same actor on every scene: smoke it stands in on scene A was read when it was shot at
// on scene B, and the attacker took the template's visibility malus there too.
describe("checkIfTargetIsInTemplate", () => {
  const smoke = (scene) => ({
    type: "itemEffect", system: {
      type: "areaEffect", ownerID: `tpl-${scene}`, ownerItem: `Scene.${scene}.MeasuredTemplate.tpl-${scene}`,
      customEffects: [{
        category: "environmentalModifiers", target: "system.itemsProperties.environmentalMod.visibility", value: 2
      }]
    }
  })
  const attacker = {
    items: []
  }
  const empty = () => ({
    visibility: 0, light: 0, glare: 0, wind: 0
  })

  it("reads the template of the scene the attack is made on", async () => {
    const target = {
      items: [smoke("A")]
    }
    expect((await checkIfTargetIsInTemplate(attacker, target, empty(), "A")).visibility).toBe(2)
  })

  it("ignores a template standing on another scene", async () => {
    const target = {
      items: [smoke("A")]
    }
    expect((await checkIfTargetIsInTemplate(attacker, target, empty(), "B")).visibility).toBe(0)
  })
})
