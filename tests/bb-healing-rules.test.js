import {
  describe, it, expect
} from 'vitest'
import {
  BB_UNDER_FIRE, BB_ADVANCED_MEDKITS, BB_LEDGER, registerBBHealingSettings,
  diagnosisBonus, physicalTotal, canBleed, ledgerAfterWound, ledgerAfterRound, stabilizationThreshold,
  stabilizationReduction, stabilizedTreatmentBoxes, penaltyReduction, ledgerAfterStabilization,
  ledgerWithDiagnosis, ledgerWithoutDiagnosis, ledgerCleaned, advancedMedkitDice, ledgerAfterBleedBox,
  isStabilizeSpell, stabilizeSpellDrain, woundDiagnosisThreshold,
  bbModeDiagnosisDice, spellStabilizes, believedHits, believedStabilizationReduction, stabilizationLabelKey,
} from '../modules/system/bb-healing-rules.js'
import {
  removedButtonKeys
} from '../modules/rolls/roll-helpers/cardRoller.js'

const pc = (physical, overflow = 0, stun = 0) => ({
  conditionMonitors: {
    physical: {
      actual: {
        value: physical
      }
    },
    overflow: {
      actual: {
        value: overflow
      }
    },
    stun: {
      actual: {
        value: stun
      }
    },
  }
})

describe('Balles et Pansements : réglages', () => {
  it('deux réglages de monde décochés par défaut, et un registre caché', () => {
    const registered = new Map()
    const previous = game.settings
    game.settings = {
      ...previous, register: (ns, key, data) => registered.set(key, data)
    }
    registerBBHealingSettings()
    game.settings = previous
    for (const key of [BB_UNDER_FIRE, BB_ADVANCED_MEDKITS]){
      expect(registered.get(key)).toMatchObject({
        scope: 'world', config: true, default: false, type: Boolean, requiresReload: true
      })
    }
    expect(registered.get(BB_LEDGER)).toMatchObject({
      scope: 'world', config: false
    })
  })
})

describe('Balles et Pansements p. 14 : aggravation des blessures', () => {
  it('compte les cases physiques et le surplus', () => {
    expect(physicalTotal(pc(4, 2))).toBe(6)
    expect(canBleed(pc(0))).toBe(true)
    expect(canBleed({
      conditionMonitors: {
        condition: {
        }
      }
    })).toBe(false)
  })

  it('une seule aggravation par patient, toutes les (CON) tours', () => {
    let ledger = ledgerAfterWound({
    }, 'A', 3)
    expect(ledger.A.bleeding).toEqual({
      every: 3, left: 3
    })
    //Une seconde blessure ne relance pas le compteur
    ledger.A.bleeding.left = 1
    expect(ledgerAfterWound(ledger, 'A', 3).A.bleeding.left).toBe(1)
    let r = ledgerAfterRound(ledger, ['A', 'B'])
    expect(r.due).toEqual(['A'])
    expect(r.ledger.A.bleeding.left).toBe(3)
    r = ledgerAfterRound(r.ledger, ['A'])
    expect(r.due).toEqual([])
    expect(r.ledger.A.bleeding.left).toBe(2)
  })

  it('un patient hors du combat ne saigne pas', () => {
    const ledger = ledgerAfterWound({
    }, 'A', 1)
    expect(ledgerAfterRound(ledger, ['B']).due).toEqual([])
  })

  it('compte les cases appliquées', () => {
    const ledger = ledgerAfterBleedBox(ledgerAfterBleedBox(ledgerAfterWound({
    }, 'A', 2), 'A'), 'A')
    expect(ledger.A.bleeding.boxes).toBe(2)
  })
})

describe('Balles et Pansements p. 14-15 : stabilisation', () => {
  it('seuil : les cases physiques et le surplus pour un patient qui saigne', () => {
    expect(stabilizationThreshold(pc(6, 2, 5), true)).toBe(8)
  })

  it('seuil : la somme des deux moniteurs sinon (la VO l\'emporte)', () => {
    expect(stabilizationThreshold(pc(3, 0, 4), false)).toBe(7)
  })

  it('chaque succès en trop baisse les malus de blessure', () => {
    expect(stabilizationReduction(9, 7)).toBe(2)
    expect(stabilizationReduction(5, 7)).toBe(0)
  })

  it('la réduction dure jusqu\'à son échéance', () => {
    const ledger = ledgerAfterStabilization(ledgerAfterWound({
    }, 'A', 3), 'A', 2, 1000)
    expect(ledger.A.bleeding).toBeNull()
    expect(penaltyReduction(ledger.A, 999)).toBe(2)
    expect(penaltyReduction(ledger.A, 1000)).toBe(0)
  })

  it('prolonger le test garde la meilleure réduction encore en cours', () => {
    let ledger = ledgerAfterStabilization({
    }, 'A', 3, 2000)
    ledger = ledgerAfterStabilization(ledger, 'A', 1, 1500)
    expect(ledger.A.stabilized.reduction).toBe(3)
  })
})

describe('Balles et Pansements p. 15-16 : diagnostic et traitement', () => {
  it('diagnostic : +2, +1 sur complication, -2 sur échec critique', () => {
    expect(diagnosisBonus({
      hits: 2
    }, 2)).toBe(2)
    expect(diagnosisBonus({
      hits: 2, glitchRoll: true
    }, 2)).toBe(1)
    expect(diagnosisBonus({
      hits: 0, criticalGlitchRoll: true
    }, 2)).toBe(-2)
    expect(diagnosisBonus({
      hits: 1
    }, 2)).toBe(0)
  })

  it('seuil proposé au MJ selon les cases (table p. 15)', () => {
    expect([0, 2, 3, 5, 6, 9, 10].map(woundDiagnosisThreshold)).toEqual([1, 1, 2, 2, 3, 3, 5])
  })

  it('le bonus ne sert qu\'une fois', () => {
    const ledger = ledgerWithDiagnosis({
    }, 'A', 2)
    expect(ledger.A.diagnosis).toBe(2)
    expect(ledgerWithoutDiagnosis(ledger, 'A').A.diagnosis).toBeUndefined()
  })

  it('patient stabilisé : 2 cases par succès, plafond au plus haut de la compétence et du médikit', () => {
    expect(stabilizedTreatmentBoxes(7, 2, 2, 4, false)).toBe(8)
    expect(stabilizedTreatmentBoxes(7, 2, 3, 0, false)).toBe(6)
    //Armure complète : succès divisés par deux d'abord (SR5 p. 207)
    expect(stabilizedTreatmentBoxes(7, 2, 6, 0, true)).toBe(6)
  })

  it('le registre oublie les entrées vides, garde le patient stabilisé dont la réduction a expiré', () => {
    const ledger = {
      A: {
        bleeding: null, stabilized: {
          reduction: 1, until: 10
        }
      },
      B: {
        diagnosis: 2
      },
      C: {
        bleeding: null, stabilized: null
      },
    }
    const cleaned = ledgerCleaned(ledger, 20)
    expect(Object.keys(cleaned)).toEqual(['A', 'B'])
    expect(cleaned.A.stabilized.reduction).toBe(0)
  })

  it('un patient stabilisé sans succès en trop reste stabilisé', () => {
    const ledger = ledgerCleaned(ledgerAfterStabilization(ledgerAfterWound({
    }, 'A', 3), 'A', 0, 1000), 0)
    expect(ledger.A.stabilized).toBeTruthy()
    expect(ledger.A.bleeding).toBeNull()
  })
})

describe('Balles et Pansements p. 18-19 : médikits avancés', () => {
  it('indice en dés, et -3 sans fournitures', () => {
    expect(advancedMedkitDice(4, 3)).toBe(4)
    expect(advancedMedkitDice(4, 0)).toBe(1)
  })
})

describe('Balles et Pansements p. 15 : sort Stabilisation (Drain de la VO)', () => {
  it('reconnaît le sort en anglais et en français', () => {
    expect(isStabilizeSpell('Stabilisation')).toBe(true)
    expect(isStabilizeSpell(' Stabilize ')).toBe(true)
    expect(isStabilizeSpell('Soins')).toBe(false)
  })

  it('Drain = (cases d\'aggravation + surplus) / 2 arrondi au supérieur, plancher 2', () => {
    expect(stabilizeSpellDrain(3, 4)).toBe(4)
    expect(stabilizeSpellDrain(0, 1)).toBe(2)
  })

  it('Stabilisation stabilise si la Puissance couvre aggravation + surplus', () => {
    const entry = {
      bleeding: {
        boxes: 2
      }
    }
    expect(spellStabilizes('Stabilisation', 5, entry, 3)).toBe(true)
    expect(spellStabilizes('Stabilisation', 4, entry, 3)).toBe(false)
    //Ni saignement ni surplus : rien à stabiliser
    expect(spellStabilizes('Stabilize', 6, {
    }, 0)).toBe(false)
  })

  it('Soins stabilise d\'office hors surplus (p. 16)', () => {
    const entry = {
      bleeding: {
        boxes: 0
      }
    }
    expect(spellStabilizes('Soins', 1, entry, 0)).toBe(true)
    expect(spellStabilizes('Heal', 1, entry, 2)).toBe(false)
    expect(spellStabilizes('Soins', 1, {
    }, 0)).toBe(false)
    expect(spellStabilizes('Boule de feu', 6, entry, 0)).toBe(false)
  })
})

describe('Balles et Pansements : ce que le MJ croit d\'une carte', () => {
  it('le bonus de diagnostic va au traitement (mode par défaut) et à la stabilisation', () => {
    expect(bbModeDiagnosisDice('treatment', 2)).toBe(2)
    expect(bbModeDiagnosisDice('stabilization', -2)).toBe(-2)
    expect(bbModeDiagnosisDice('diagnosis', 2)).toBe(0)
    expect(bbModeDiagnosisDice('none', 2)).toBe(0)
  })

  it('les succès sont bornés par la réserve, multipliée par les jets du test étendu', () => {
    expect(believedHits(40, 6, 1)).toBe(6)
    expect(believedHits(9, 4, 3)).toBe(9)
    expect(believedHits(9, 4, 2)).toBe(8)
  })

  it('la réduction se recalcule de la même façon pour le bouton et pour le MJ', () => {
    expect(believedStabilizationReduction({
      hits: 99
    }, 4, 2, 5)).toBe(3)
    expect(believedStabilizationReduction({
      hits: 6
    }, 4, 2, 5)).toBe(1)
  })

  it('une carte rafraîchie efface par « -= » les boutons qu\'elle n\'a plus', () => {
    expect(removedButtonKeys({
      actionEnd: {
      }, bbStabilize: {
      }, extended: {
      }
    }, {
      bbStabilize: {
      }
    })).toEqual({
      '-=actionEnd': null, '-=extended': null
    })
    expect(removedButtonKeys(undefined, {
    })).toEqual({
    })
  })
})

// A spell or a first aid on a bleeding patient stabilizes without lowering the wound modifiers: the button, the
// confirmation and the done mark then say "Stabilize", not "wound modifiers -0"
describe('stabilizationLabelKey', () => {
  it('names the reduction only when there is one', () => {
    expect(stabilizationLabelKey("SR5.BB_StabilizeButton", 2)).toBe("SR5.BB_StabilizeButton")
    expect(stabilizationLabelKey("SR5.BB_StabilizeButton", 0)).toBe("SR5.BB_StabilizeButtonNoReduction")
    expect(stabilizationLabelKey("SR5.BB_StabilizeDone", "0")).toBe("SR5.BB_StabilizeDoneNoReduction")
    expect(stabilizationLabelKey("SR5.BB_StabilizeConfirm", undefined)).toBe("SR5.BB_StabilizeConfirmNoReduction")
  })
})
