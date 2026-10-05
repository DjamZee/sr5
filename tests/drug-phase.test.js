import {
  describe, it, expect
} from "vitest"
import {
  migrateDrugSource, drugPhaseFlags, phaseFromFlags, drugEffectApplies, nextDrugPhase
} from "../modules/entities/items/drug-phase.js"

//A drug as the compendiums stored it: the effects of the crash ticked "wireless"
function oldDrug({
  isActive = false, wirelessTurnedOn = false
} = {
}){
  return {
    isActive, wirelessTurnedOn,
    customEffects: [
      {
        target: "system.attributes.charisma.augmented", type: "value", value: 1, wifi: false
      },
      {
        target: "system.attributes.willpower.augmented", type: "value", value: -1, wifi: true
      }
    ]
  }
}

describe("Migration des drogues vers la phase montée / descente", () => {
  it("une drogue rangée devient sans phase, ses effets « sans fil » deviennent la descente", () => {
    const s = migrateDrugSource(oldDrug())
    //No phase stored: the field takes its initial value, ""
    expect(s.phase ?? "").toBe("")
    expect(s.customEffects.map(e => e.phase)).toEqual(["rise", "crash"])
    expect(s.customEffects.every(e => e.wifi === false)).toBe(true)
  })

  it("une drogue déjà en descente reste en descente", () => {
    const s = migrateDrugSource(oldDrug({
      wirelessTurnedOn: true
    }))
    expect(s.phase).toBe("crash")
    expect(s.isActive).toBe(false)
    expect(s.wirelessTurnedOn).toBe(true)
  })

  it("une drogue en montée reste en montée", () => {
    expect(migrateDrugSource(oldDrug({
      isActive: true
    })).phase).toBe("rise")
  })

  it("rejouée deux fois, la migration ne change rien et ne perd rien", () => {
    const once = migrateDrugSource(oldDrug({
      wirelessTurnedOn: true
    }))
    const snapshot = structuredClone(once)
    const twice = migrateDrugSource(once)
    expect(twice).toEqual(snapshot)
    expect(twice.customEffects).toHaveLength(2)
  })

  it("une phase déjà posée l'emporte sur les anciens drapeaux", () => {
    const s = migrateDrugSource({
      phase: "rise", isActive: false, wirelessTurnedOn: true, customEffects: []
    })
    expect(s.phase).toBe("rise")
    expect(s.isActive).toBe(true)
    expect(s.wirelessTurnedOn).toBe(false)
  })

  it("une phase vide ne l'emporte pas sur un drapeau levé (source ancienne, macro)", () => {
    expect(migrateDrugSource({
      phase: "", isActive: true
    })).toMatchObject({
      phase: "rise", isActive: true, wirelessTurnedOn: false
    })
    expect(migrateDrugSource({
      phase: "", isActive: false, wirelessTurnedOn: true
    })).toMatchObject({
      phase: "crash", isActive: false, wirelessTurnedOn: true
    })
  })

  it("une mise à jour partielle {isActive: false} n'efface pas une descente", () => {
    expect(migrateDrugSource({
      isActive: false
    })).toEqual({
      isActive: false
    })
  })

  it("une drogue sans phase ni drapeau reste sans phase", () => {
    expect(migrateDrugSource({
      phase: "", isActive: false, wirelessTurnedOn: false
    }).phase).toBe("")
    expect(migrateDrugSource({
      isActive: false, wirelessTurnedOn: false
    })).toEqual({
      isActive: false, wirelessTurnedOn: false
    })
  })

  it("une mise à jour partielle sans état ne remet pas la drogue à zéro", () => {
    const s = migrateDrugSource({
      quantity: 3
    })
    expect(s).toEqual({
      quantity: 3
    })
  })

  it("accepte les effets rangés en objet (clés numériques)", () => {
    const s = migrateDrugSource({
      customEffects: {
        0: {
          wifi: true
        }
      }
    })
    expect(s.customEffects[0].phase).toBe("crash")
  })
})

describe("Bascule montée / descente", () => {
  it("les drapeaux suivent la phase", () => {
    expect(drugPhaseFlags("")).toEqual({
      isActive: false, wirelessTurnedOn: false
    })
    expect(drugPhaseFlags("rise")).toEqual({
      isActive: true, wirelessTurnedOn: false
    })
    expect(drugPhaseFlags("crash")).toEqual({
      isActive: false, wirelessTurnedOn: true
    })
    expect(phaseFromFlags(true, false)).toBe("rise")
    expect(phaseFromFlags(false, true)).toBe("crash")
    expect(phaseFromFlags(false, false)).toBe("")
  })

  it("un clic avance d'un cran : rien, montée, descente, rien", () => {
    expect(nextDrugPhase("")).toBe("rise")
    expect(nextDrugPhase("rise")).toBe("crash")
    expect(nextDrugPhase("crash")).toBe("")
  })

  it("un effet ne vaut que dans sa phase", () => {
    expect(drugEffectApplies({
      phase: "rise"
    }, "rise")).toBe(true)
    expect(drugEffectApplies({
      phase: "rise"
    }, "crash")).toBe(false)
    expect(drugEffectApplies({
      phase: "crash"
    }, "crash")).toBe(true)
    expect(drugEffectApplies({
      phase: "crash"
    }, "")).toBe(false)
    //The box of the effect editor
    expect(drugEffectApplies({
      phase: true
    }, "crash")).toBe(true)
    expect(drugEffectApplies({
      phase: false, wifi: true
    }, "rise")).toBe(true)
    //Not yet migrated: the former convention
    expect(drugEffectApplies({
      wifi: true
    }, "crash")).toBe(true)
    expect(drugEffectApplies({
    }, "rise")).toBe(true)
  })
})
