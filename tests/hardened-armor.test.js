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

// N61 — SR5 p. 397: half the rating modified by AP, « arrondie au supérieur », counts as automatic hits
describe("Armure renforcée, succès automatiques", () => {
  it("l'exemple du dragon : indice 8, sans PA, 4 succès", () => expect(SR5_CombatHelpers.hardenedArmorAutoHits(8, 0)).toBe(4))
  it("un indice impair s'arrondit au supérieur : 9 donne 5", () => expect(SR5_CombatHelpers.hardenedArmorAutoHits(9, 0)).toBe(5))
  it("la PA compte avant l'arrondi : 10 PA -3 donne 4", () => expect(SR5_CombatHelpers.hardenedArmorAutoHits(10, -3)).toBe(4))
  it("jamais négatif", () => expect(SR5_CombatHelpers.hardenedArmorAutoHits(2, -6)).toBe(0))
})
