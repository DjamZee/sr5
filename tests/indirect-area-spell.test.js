import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// SR5 p. 285: an indirect area spell has a threshold of 3; once reached, DV = Force + hits above the threshold,
// counted after the defense (Reaction + Intuition, as against a ranged attack).
describe("Sort indirect de zone, seuil de 3", () => {
  it("Puissance 5, 6 succès, 1 en défense : 5 nets, VD 7", () => {
    expect(SR5_CombatHelpers.indirectAreaSpellDamage(5, 5, 3)).toBe(7)
  })
  it("des succès nets jusqu'au seuil n'ajoutent rien : VD = Puissance", () => {
    expect(SR5_CombatHelpers.indirectAreaSpellDamage(5, 2, 3)).toBe(5)
    expect(SR5_CombatHelpers.indirectAreaSpellDamage(5, 3, 3)).toBe(5)
  })
  it("seuil manqué : 2D6 m de déviation, moins 1 m par succès, jamais négatif", () => {
    expect(SR5_CombatHelpers.indirectAreaSpellScatter(9, 2)).toBe(7)
    expect(SR5_CombatHelpers.indirectAreaSpellScatter(2, 2)).toBe(0)
    expect(SR5_CombatHelpers.indirectAreaSpellScatter(2, 1 + 2)).toBe(0)
  })
  it("l'ancien calcul, Puissance + succès nets, aurait donné 10", () => {
    expect(SR5_CombatHelpers.indirectAreaSpellDamage(5, 5, 3)).not.toBe(10)
  })
})
