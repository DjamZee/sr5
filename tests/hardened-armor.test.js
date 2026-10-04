import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// N49 — SR5 p. 397 (Hardened Armor): the attack's modified DV, net hits already in it, against the rating modified by AP
describe("Armure renforcée, VD modifiée", () => {
  it("Boule de feu Puissance 6, 5 succès nets, seuil 3 : VD 8 contre armure 8, arrêtée", () => {
    const dv = SR5_CombatHelpers.indirectAreaSpellDamage(6, 5, 3)
    expect(dv).toBe(8)
    expect(SR5_CombatHelpers.isStoppedByHardenedArmor(dv, 8, 0)).toBe(true)
  })
  it("ne recompte pas les succès nets : l'ancien test 8 + 5 = 13 laissait passer l'attaque", () => {
    expect(SR5_CombatHelpers.isStoppedByHardenedArmor(8, 10, 0)).toBe(true)
  })
  it("la PA réduit l'indice", () => {
    expect(SR5_CombatHelpers.isStoppedByHardenedArmor(8, 10, -2)).toBe(true)
    expect(SR5_CombatHelpers.isStoppedByHardenedArmor(9, 10, -2)).toBe(false)
  })
})
