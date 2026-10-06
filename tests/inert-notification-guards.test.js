import {
  describe, it, expect, beforeEach, vi
} from "vitest"

//The attack card as a GM wrote it: its reading again is tested in attack-card.test.js
vi.mock("../modules/rolls/roll-helpers/attack-card.js", () => ({
  trustedAttackCard: async chatData => chatData,
}))
vi.mock("../modules/rolls/roll-prepare-helpers.js", () => ({
  SR5_PrepareRollHelper: {
    getBaseDicepool: () => 0,
    getDicepoolModifiers: () => [],
    getBaseLimit: () => 0,
    getLimitModifiers: () => [],
    getActiveDefenseValue: () => 0,
    getTargetedActor: async () => ({
      type: "actorPc", items: []
    }),
  },
}))
vi.mock("../modules/rolls/roll-helpers/combat.js", () => ({
  SR5_CombatHelpers: {
    handleEnvironmentalModifiers: () => 0, environmentScene: () => null
  },
}))
vi.mock("../modules/rolls/roll-helpers/miscellaneous.js", () => ({
  SR5_MiscellaneousHelpers: {
    addActions: (actions) => actions
  },
}))

import banishingResistance from "../modules/rolls/roll-prepare-case/rollData-BanishingResistance.js"
import bindingResistance from "../modules/rolls/roll-prepare-case/rollData-BindingResistance.js"
import decompilingResistance from "../modules/rolls/roll-prepare-case/rollData-DecompilingResistance.js"
import registeringResistance from "../modules/rolls/roll-prepare-case/rollData-RegisteringResistance.js"
import iceDefense from "../modules/rolls/roll-prepare-case/rollData-IceDefense.js"
import ritual from "../modules/rolls/roll-prepare-case/rollData-Ritual.js"
import defense from "../modules/rolls/roll-prepare-case/rollData-Defense.js"
import resonanceAction from "../modules/rolls/roll-prepare-case/rollData-ResonanceAction.js"

// In V13 ui.notifications.warn/info return the notification, a truthy object. "return ui.notifications.warn(...)"
// in a rollData builder handed that object to roll-prepare.js, whose "if (rollData)" opened a roll dialog anyway.
// Each refused case must now give back nothing.

let warned

beforeEach(() => {
  warned = []
  const notify = (m) => {
    warned.push(m)
    return {
      id: warned.length, message: m
    }
  }
  globalThis.ui = {
    notifications: {
      warn: notify, info: notify
    }
  }
})

const rollData = () => ({
  test: {
  }, dicePool: {
  }, limit: {
  }, combat: {
    actions: [], activeDefenses: {
    }, ammo: {
    }, firingMode: {
    }
  },
  matrix: {
  }, dialogSwitch: {
  }, previousMessage: {
  }, damage: {
  }, target: {
    hasTarget: true
  },
})

describe("guards that refuse a roll give back nothing", () => {
  it("banishing resistance of a non-spirit", async () => {
    expect(await banishingResistance(rollData(), {
      type: "actorPc"
    }, {
    })).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NotASpirit"])
  })

  it("binding resistance of a non-spirit", async () => {
    expect(await bindingResistance(rollData(), {
      type: "actorPc"
    }, {
    })).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NotASpirit"])
  })

  it("decompiling resistance of a non-sprite", async () => {
    expect(await decompilingResistance(rollData(), {
      type: "actorPc"
    }, {
    })).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NotASprite"])
  })

  it("registering resistance of a non-sprite", async () => {
    expect(await registeringResistance(rollData(), {
      type: "actorPc"
    }, {
    })).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NotASprite"])
  })

  it("IC defense by an actor that cannot defend", async () => {
    expect(await iceDefense(rollData(), {
      type: "actorDrone"
    }, {
    })).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_InvalidActorType"])
  })

  it("ritual without reagents", async () => {
    expect(await ritual(rollData(), {
      system: {
        magic: {
          reagents: 0
        }
      }
    }, {
      system: {
      }
    })).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NoReagents"])
  })

  it("astral combat defense of a defender who is not in the astral", async () => {
    const actor = {
      type: "actorPc", name: "Kim", items: [],
      system: {
        defenses: {
          defend: {
            modifiers: []
          }
        }, specialProperties: {
        }, visions: {
          astral: {
            isActive: false
          }
        }
      },
    }
    const chatData = {
      roll: {
        hits: 2
      }, owner: {
      }, damage: {
      }, target: {
      }, test: {
        typeSub: "astralCombat", type: "skill"
      },
      combat: {
        ammo: {
        }, firingMode: {
        }
      },
    }
    expect(await defense(rollData(), actor, chatData)).toBeUndefined()
    expect(warned).toEqual(["SR5.INFO_TargetIsNotInAstral"])
  })

  it("decompiling a target that is not a sprite", async () => {
    const actor = {
      system: {
        matrix: {
          resonanceActions: {
            decompileSprite: {
              test: {
                modifiers: []
              }, actionType: "complex"
            }
          }
        },
        specialAttributes: {
          resonance: {
            augmented: {
              value: 4
            }
          }
        },
      },
    }
    expect(await resonanceAction(rollData(), "decompileSprite", actor)).toBeUndefined()
    expect(warned).toEqual(["SR5.WARN_NotASprite"])
  })
})
