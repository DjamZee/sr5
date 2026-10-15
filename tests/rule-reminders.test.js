import {
  describe, it, expect
} from 'vitest'
import {
  stripRuleReferences, isCapReminder
} from '../modules/system/rule-reminders.js'

// Réglage « Rappel des règles » décoché (lot R2) : les textes du système perdent leurs renvois aux pages
describe('stripRuleReferences', () => {
  it('ôte une parenthèse qui ne contient que des renvois', () => {
    expect(stripRuleReferences("Samouraï des rues mange la poussière (Interruption, -5 Initiative) : aucun test, il est étendu (SR5 p. 170, 182)."))
      .toBe("Samouraï des rues mange la poussière (Interruption, -5 Initiative) : aucun test, il est étendu.")
    expect(stripRuleReferences("Arcanes Interdites (p. 180-184)")).toBe("Arcanes Interdites")
    expect(stripRuleReferences("Lockdown (p. 206)")).toBe("Lockdown")
    expect(stripRuleReferences("pas de test (p. 420)")).toBe("pas de test")
    expect(stripRuleReferences("le tir de couverture (voir p. 181) dure")).toBe("le tir de couverture dure")
  })

  it('garde le reste de la parenthèse', () => {
    expect(stripRuleReferences("Modificateurs environnementaux (éblouissement faible de la lampe torche, Run & Gun p. 69)"))
      .toBe("Modificateurs environnementaux (éblouissement faible de la lampe torche)")
    expect(stripRuleReferences("(p. 232 : 1 de 101 m à 1 km)")).toBe("(1 de 101 m à 1 km)")
    expect(stripRuleReferences("(voir Dégainer rapidement, p. 167)")).toBe("(voir Dégainer rapidement)")
    // Un fragment mis plus tard entre parenthèses (SR5.FlashlightGlare)
    expect(stripRuleReferences("éblouissement faible de la lampe torche, Run & Gun p. 69")).toBe("éblouissement faible de la lampe torche")
    expect(stripRuleReferences("Recul (SR5 p. 175) :")).toBe("Recul :")
    // La source déjà ôtée de la valeur insérée : « ({source}) » avec source = « SR5 p. 420 »
    expect(stripRuleReferences("hors de portée à la création (). Le MJ peut passer par Équiper."))
      .toBe("hors de portée à la création. Le MJ peut passer par Équiper.")
  })

  it('reconnaît les formes « p. N, Livre » et les renvois multiples', () => {
    expect(stripRuleReferences("un modificateur d’éblouissement faible (p. 175, SR5).")).toBe("un modificateur d’éblouissement faible.")
    expect(stripRuleReferences("les règles de réparation (p. 148, SR5 et p. 154, Run & Gun).")).toBe("les règles de réparation.")
    expect(stripRuleReferences("Le livre (Rigger 5.0 p. 191, Kill Code p. 45) le dit.")).toBe("Le livre le dit.")
    expect(stripRuleReferences("lu en VF p. 177 et VO p. 174-175")).not.toMatch(/p\.\s?\d/)
  })

  it('laisse intact un texte sans renvoi', () => {
    const text = "Run & Gun RG4 : l'ordre change (règle optionnelle)"
    expect(stripRuleReferences(text)).toBe(text)
    expect(stripRuleReferences(undefined)).toBe(undefined)
  })
})

describe('isCapReminder', () => {
  it('ne vise que les notes de plafond à 0', () => {
    expect(isCapReminder({
      type: "augmentationCap", value: 0
    })).toBe(true)
    expect(isCapReminder({
      type: "augmentationCap", value: -2
    })).toBe(false)
    expect(isCapReminder({
      type: "itemEffect", value: 0
    })).toBe(false)
  })
})
