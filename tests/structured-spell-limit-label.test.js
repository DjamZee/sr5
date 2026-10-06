import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// M5 M2 (mesuré par Elsa, 06/10) : sort structuré (Arcanes interdites p. 43), la Limite tient après Repousser les
// limites ; la carte affichait pourtant « Limite (Puissance) : Repousser les limites » au lieu de la valeur.
describe("M5 M2 : libellé de la Limite d'un sort structuré après Repousser", () => {
  const card = readFileSync("templates/rolls/rollCardPartial/limitRoll.hbs", "utf8")

  it("montre la valeur de la Limite quand le sort est structuré", () => {
    expect(card).toMatch(/\{\{#if \(and edge\.hasUsedPushTheLimit magic\.structured\)\}\}\s*\{\{limit\.value\}\}/)
  })

  it("garde « Repousser les limites » pour les autres jets", () => {
    expect(card).toMatch(/\{\{else if edge\.hasUsedPushTheLimit\}\}\s*\{\{localize 'SR5\.PushTheLimit'\}\}/)
  })
})
