import {
  describe, it, expect
} from "vitest"
import {
  WEAPON_ACCESSORY_CATALOG
} from "../modules/data/weaponAccessoryCatalog.js"

//Hidden arm slide (SR5 p. 434): "un modificateur de -1 à la Dissimulation de l'arme", like the concealable
//holster: both make the weapon easier to hide, so both lower its Concealability modifier
describe("Hidden arm slide", () => {
  const concealment = key => WEAPON_ACCESSORY_CATALOG[key].itemEffects
    .filter(e => e.target === "system.concealment")
    .reduce((sum, e) => sum + e.value, 0)

  it("lowers the weapon's Concealability modifier by 1", () => {
    expect(concealment("hiddenArmSlide")).toBe(-1)
  })
})
