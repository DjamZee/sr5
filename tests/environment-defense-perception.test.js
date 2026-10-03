import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"
import defense from "../modules/rolls/roll-prepare-case/rollData-Defense.js"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// SR5 p. 176: environmental modifiers "reflect the conditions surrounding the action".
// Each scene carries distinct values so a test tells which one was read.
function scene(id, flags) {
  return {
    id,
    getFlag: (_module, key) => flags[key]
  }
}
const sceneAttaque = scene("attaque", {
  environModLight: "2", environModWind: "2"
}) // -3 in melee (light only, p. 188)
const sceneRegardee = scene("regardee", {
  environModLight: "1"
}) // -1

const modifier = () => ({
  base: 0, value: 0, modifiers: []
})
function actorSystem() {
  return {
    itemsProperties: {
      environmentalMod: {
        visibility: modifier(), light: modifier(), glare: modifier(), wind: modifier()
      }
    },
    visions: {
      lowLight: {
        isActive: false
      }, astral: {
        isActive: false
      }
    },
  }
}

let avant, avertissements
beforeEach(() => {
  avant = {
    canvas: globalThis.canvas, game: globalThis.game, ui: globalThis.ui
  }
  avertissements = []
  globalThis.ui = {
    notifications: {
      warn: m => avertissements.push(m), info: () => {}
    }
  }
  globalThis.canvas = {
    scene: sceneRegardee
  }
  const scenes = new Map([[sceneAttaque.id, sceneAttaque], [sceneRegardee.id, sceneRegardee]])
  globalThis.game = {
    i18n: {
      localize: k => k, format: k => k
    },
    scenes,
    actors: {
      get: () => null
    },
  }
})
afterEach(() => {
  globalThis.canvas = avant.canvas
  globalThis.game = avant.game
  globalThis.ui = avant.ui
})

describe("environmentScene", () => {
  it("reads the scene an attack card was rolled on, whatever the clicker is looking at", () => {
    expect(SR5_CombatHelpers.environmentScene("attaque")).toBe(sceneAttaque)
  })
  it("falls back to the canvas when the card has no scene or it was deleted", () => {
    expect(SR5_CombatHelpers.environmentScene()).toBe(sceneRegardee)
    expect(SR5_CombatHelpers.environmentScene(null)).toBe(sceneRegardee)
    expect(SR5_CombatHelpers.environmentScene("supprimee")).toBe(sceneRegardee)
  })
})

describe("melee defense", () => {
  function defender() {
    const system = actorSystem()
    system.defenses = {
      defend: {
        modifiers: []
      }
    }
    system.specialProperties = {
      fullDefenseValue: 0
    }
    system.skills = {
    }
    system.limits = {
      physicalLimit: {
        value: 5
      }
    }
    return {
      type: "actorPc", system, items: [], getFlag: () => undefined, setFlag: () => {}
    }
  }
  function attackCard(sceneId, attackerMod) {
    return {
      roll: {
        hits: 2
      },
      owner: {
      },
      damage: {
        toxin: {
        }
      },
      combat: {
        firingMode: {
        }, reach: 0, ammo: {
        }, calledShot: {
        }, environmentalMod: attackerMod
      },
      target: {
        sceneId
      },
      test: {
        type: "weapon", typeSub: "meleeWeapon"
      },
      magic: {
        spell: {
        }
      },
    }
  }
  function rollData() {
    return {
      test: {
      }, dicePool: {
        modifiers: []
      }, combat: {
        activeDefenses: {
        }, firingMode: {
        }, ammo: {
        }
      },
      previousMessage: {
      }, damage: {
      }, target: {
      }, dialogSwitch: {
      }, magic: {
        spell: {
        }
      },
    }
  }
  const envMod = data => data.dicePool.modifiers.find(m => m.type === "environmentalSceneMod")?.value ?? 0

  it("reads the attack's scene, not the one the defender is looking at", async () => {
    const data = await defense(rollData(), defender(), attackCard("attaque"))
    expect(envMod(data)).toBe(-3)
    expect(data.target.sceneId).toBe("attaque")
  })
  it("falls back to the canvas for a card rolled before the scene was kept", async () => {
    const data = await defense(rollData(), defender(), attackCard(undefined))
    expect(envMod(data)).toBe(-1)
  })

  describe("SR5 p. 188 option: ignore an environment equal for both fighters", () => {
    const option = active => {
      globalThis.game.settings = {
        get: (ns, key) => ns === "sr5" && key === "sr5MeleeEnvironmentBalanced" && active
      }
    }
    it("off by default: the modifier applies even when equal", async () => {
      const data = await defense(rollData(), defender(), attackCard("attaque", -3))
      expect(envMod(data)).toBe(-3)
    })
    it("on: an equal modifier is ignored", async () => {
      option(true)
      const data = await defense(rollData(), defender(), attackCard("attaque", -3))
      expect(envMod(data)).toBe(0)
    })
    it("on: a different modifier still applies", async () => {
      option(true)
      const data = await defense(rollData(), defender(), attackCard("attaque", 0))
      expect(envMod(data)).toBe(-3)
    })
    it("on: a card rolled before the option keeps the modifier", async () => {
      option(true)
      const data = await defense(rollData(), defender(), attackCard("attaque", null))
      expect(envMod(data)).toBe(-3)
    })
    it("on the attack side, compares with the target's own modifier", () => {
      option(true)
      const cible = {
        system: actorSystem()
      }
      const cibleVN = {
        system: actorSystem()
      }
      cibleVN.system.visions.lowLight.isActive = true
      const contre = SR5_CombatHelpers.meleeEnvironmentalMod(sceneAttaque, cible)
      expect(contre).toBe(-3)
      expect(SR5_CombatHelpers.meleeEnvironmentBalanced(-3, contre)).toBe(true)
      // low-light vision treats dim light as full light (p. 177): the target sees, the attacker does not
      expect(SR5_CombatHelpers.meleeEnvironmentBalanced(-3, SR5_CombatHelpers.meleeEnvironmentalMod(sceneAttaque, cibleVN))).toBe(false)
      // a target with no environmental data (a device) is never balanced
      expect(SR5_CombatHelpers.meleeEnvironmentalMod(sceneAttaque, {
        system: {
        }
      })).toBe(null)
      expect(SR5_CombatHelpers.meleeEnvironmentBalanced(-3, null)).toBe(false)
    })
  })
})

describe("sight perception", () => {
  function field() {
    return {
      value: 0, style: {
      }
    }
  }
  function dialog() {
    const fields = {
    }
    const html = {
      querySelector: sel => (fields[sel] ??= field())
    }
    const dialogData = {
      owner: {
        actorId: "a"
      },
      dicePool: {
        base: 8, modifiers: []
      },
      limit: {
        modifiers: {
        }
      },
      various: {
      },
    }
    const roll = new SR5_RollDialog({
      position: {
      }, setPosition: () => {}
    }, null, dialogData)
    return {
      roll, html, fields, dialogData
    }
  }
  const actor = {
    system: {
      ...actorSystem(),
      skills: {
        perception: {
          perceptionType: {
            sight: {
              test: {
                value: 0
              }, limit: {
                value: 1
              }
            }
          }
        }
      }
    }
  }
  const selectSight = async (d) => {
    globalThis.game.actors.get = () => actor
    await d.roll._selectModifiers({
      currentTarget: {
        dataset: {
          target: "dicePoolModOerceptionType", modifier: "perceptionType"
        }
      },
      target: {
        value: "sight"
      },
    }, d.html, d.dialogData)
  }

  it("applies the scene's modifier and still sets the perception type and limit", async () => {
    const d = dialog()
    await selectSight(d)
    const env = d.dialogData.dicePool.modifiers.find(m => m.type === "environmentalSceneMod")
    expect(env?.value).toBe(-1)
    expect(d.fields['[data-modifier="environmentalSceneMod"]'].value).toBe(-1)
    expect(d.dialogData.various.perceptionType).toBe("sight")
    expect(d.dialogData.limit.modifiers.perception.value).toBe(1)
  })
  it("warns when there is no scene instead of skipping silently", async () => {
    globalThis.canvas = {
      scene: null
    }
    const d = dialog()
    await selectSight(d)
    expect(d.dialogData.dicePool.modifiers.some(m => m.type === "environmentalSceneMod")).toBe(false)
    expect(avertissements).toContain("SR5.WARN_NoSceneForEnvironment")
    expect(d.dialogData.various.perceptionType).toBe("sight")
  })
})
