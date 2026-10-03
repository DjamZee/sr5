import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// A scene whose SR5 tab was never saved has no environmental flags at all: Foundry's getFlag
// returns undefined, not 0. Each missing flag must count as the "normal" row of its column
// (clear, full light, no glare, no wind - SR5 p. 176), never wipe out the whole modifier.
// Saved flags come from a <select>, so they are strings.
function scene(flags) {
  return {
    getFlag: (_module, key) => flags[key]
  }
}

function acteur({
  lowLight = false
} = {
}) {
  return {
    itemsProperties: {
      environmentalMod: {
        visibility: {
          value: 0
        },
        light: {
          value: 0
        },
        glare: {
          value: 0
        },
        wind: {
          value: 0
        },
      }
    },
    visions: {
      lowLight: {
        isActive: lowLight
      }
    },
  }
}

const mod = (flags, noWind = false, acteurOptions) =>
  SR5_CombatHelpers.handleEnvironmentalModifiers(scene(flags), acteur(acteurOptions), noWind)

describe("handleEnvironmentalModifiers on a scene that was never configured", () => {
  it("gives no modifier when no flag exists", () => {
    expect(mod({
    })).toBe(0)
  })

  it("keeps total darkness when it is the only flag set", () => {
    expect(mod({
      environModLight: "3"
    })).toBe(-6)
    expect(mod({
      environModLight: 3
    }, true)).toBe(-6)
  })

  it("keeps each column when the others are missing", () => {
    expect(mod({
      environModVisibility: "2"
    })).toBe(-3)
    expect(mod({
      environModGlare: "1"
    })).toBe(-1)
    expect(mod({
      environModWind: "3"
    })).toBe(-6)
  })

  it("still applies low-light vision with partial flags", () => {
    expect(mod({
      environModLight: "2"
    }, false, {
      lowLight: true
    })).toBe(0)
    expect(mod({
      environModLight: "3"
    }, false, {
      lowLight: true
    })).toBe(-6)
  })

  it("reads the scene on the canvas, not the active one", () => {
    // SR5 p. 176: the conditions surrounding the action. The GM shows a dark scene while another is active.
    const affichee = scene({
      environModLight: "2", environModWind: "2"
    })
    const active = scene({
    })
    const avant = {
      canvas: globalThis.canvas, game: globalThis.game
    }
    globalThis.canvas = {
      scene: affichee
    }
    globalThis.game = {
      scenes: {
        active
      }
    }
    try {
      expect(SR5_CombatHelpers.environmentScene()).toBe(affichee)
      expect(SR5_CombatHelpers.handleEnvironmentalModifiers(SR5_CombatHelpers.environmentScene(), acteur(), false)).toBe(-6)
    } finally {
      globalThis.canvas = avant.canvas
      globalThis.game = avant.game
    }
  })

  it("warns instead of rolling silently when there is no scene", () => {
    const avertissements = []
    const avant = {
      ui: globalThis.ui, game: globalThis.game
    }
    globalThis.ui = {
      notifications: {
        warn: m => avertissements.push(m)
      }
    }
    globalThis.game = {
      i18n: {
        localize: k => k
      }
    }
    try {
      expect(SR5_CombatHelpers.handleEnvironmentalModifiers(null, acteur(), false)).toBe(0)
      expect(avertissements).toEqual(["SR5.WARN_NoSceneForEnvironment"])
    } finally {
      globalThis.ui = avant.ui
      globalThis.game = avant.game
    }
  })

  it("survives an area effect that only sets one column", () => {
    const resultat = SR5_CombatHelpers.handleEnvironmentalModifiers(scene({
    }), acteur(), false, {
      light: 3
    })
    expect(resultat).toBe(-6)
  })
})
