import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  sr5HookCreateActor, homunculusLeavesAstral
} from "../modules/hooks/actor.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"

// M4 D2 (mesuré par Tilda, 06/10) : un homoncule créé lançait l'initiative astrale 6 + 3D6 au lieu de (P + 1) + 1D6
// (SR5 p. 301) : il est toujours physique.

const initiatives = (astral = false) => ({
  astralInit: {
    isActive: astral
  }, matrixInit: {
    isActive: false
  }, physicalInit: {
    isActive: false
  }
})
const spirit = (type, astral = false) => ({
  type: "actorSpirit", items: [], effects: [], _source: {
    system: {
      initiatives: initiatives(astral)
    }
  }, system: {
    type, force: {
      base: 3, value: 3, modifiers: []
    }, initiatives: initiatives(astral)
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.game.user = {
    id: "gm", isGM: true
  }
  vi.spyOn(SR5_ActorHelper, "redrawCreatorSheet").mockImplementation(() => {})
})

describe("M4 D2 : l'homoncule est en initiative physique (SR5 p. 301)", () => {
  it("initiative par défaut : physique pour l'homoncule, astrale pour un autre esprit", () => {
    expect(SR5_CharacterUtility.defaultInitiative(spirit("homunculus"))).toBe("physicalInit")
    expect(SR5_CharacterUtility.defaultInitiative(spirit("air"))).toBe("astralInit")
  })

  it("passé homoncule après une création astrale : la préparation joue la physique", () => {
    const actor = spirit("homunculus", true)
    SR5_CharacterUtility.updateSpiritValues(actor)
    expect(actor.system.initiatives.astralInit.isActive).toBe(false)
    expect(actor.system.initiatives.physicalInit.isActive).toBe(true)
  })

  it("à la création, l'homoncule n'est pas basculé en astral", async () => {
    const sw = vi.spyOn(SR5_CharacterUtility, "switchToInitiative").mockResolvedValue(true)
    await sr5HookCreateActor(spirit("homunculus"))
    expect(sw).not.toHaveBeenCalled()
    await sr5HookCreateActor(spirit("air"))
    expect(sw).toHaveBeenCalledWith(expect.anything(), "astralInit")
  })

  it("un esprit changé en homoncule quitte l'initiative astrale enregistrée, par le MJ qui l'a changé", async () => {
    const sw = vi.spyOn(SR5_CharacterUtility, "switchToInitiative").mockResolvedValue(true)
    await homunculusLeavesAstral(spirit("homunculus", true), {
      system: {
        type: "homunculus"
      }
    }, "gm")
    expect(sw).toHaveBeenCalledWith(expect.anything(), "physicalInit")
    sw.mockClear()
    await homunculusLeavesAstral(spirit("homunculus", true), {
      system: {
        type: "homunculus"
      }
    }, "other")
    expect(sw).not.toHaveBeenCalled()
  })
})
