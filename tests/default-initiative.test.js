import {
  describe, it, expect, vi
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// G11 (décision de DjamZ, 06/10) : une IA sans appareil est un persona seul, elle démarre en initiative matricielle
// (Data Trails p. 157-158) ; sur un appareil ou dans un corps, en initiative physique.

const initiatives = () => ({
  astralInit: {
  }, matrixInit: {
  }, physicalInit: {
  }
})
const character = (depth, items = []) => ({
  type: "actorPc", items, system: {
    activeSpecialAttribute: depth ? "depth" : "magic", initiatives: initiatives()
  }
})
const device = {
  type: "itemDevice", system: {
    isActive: true
  }
}

describe("G11 : initiative par défaut d'une IA", () => {
  it("IA sans appareil : matricielle", () => {
    expect(SR5_CharacterUtility.defaultInitiative(character(true))).toBe("matrixInit")
  })
  it("IA sur un appareil actif : physique", () => {
    expect(SR5_CharacterUtility.defaultInitiative(character(true, [device]))).toBe("physicalInit")
  })
  it("personnage ordinaire : physique", () => {
    expect(SR5_CharacterUtility.defaultInitiative(character(false))).toBe("physicalInit")
  })
  it("esprit : astrale ; appareil : matricielle ; drone : physique", () => {
    expect(SR5_CharacterUtility.defaultInitiative({
      type: "actorSpirit", system: {
        type: "air", initiatives: initiatives()
      }
    })).toBe("astralInit")
    expect(SR5_CharacterUtility.defaultInitiative({
      type: "actorDevice", system: {
      }
    })).toBe("matrixInit")
    expect(SR5_CharacterUtility.defaultInitiative({
      type: "actorDrone", system: {
      }
    })).toBe("physicalInit")
  })
})
