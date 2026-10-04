import {
  describe, it, expect
} from "vitest"
import {
  SR5
} from "../modules/config.js"
import {
  basicSightDetects
} from "../modules/system/vision.js"

// Ultrasound sees "people hidden by an Invisibility spell" (SR5 p. 449). In Foundry, that is the
// work of a detection mode built on seeInvisibility : it only ever detects a token carrying the
// core "invisible" status, which ordinary sight must then fail to see. The system had neither :
// no such status among its own, and a basic sight that threw the core answer away.
const effet = (statut) => ({
  statuses: new Set([statut])
})
const jeton = (...statuts) => ({
  actor: {
    effects: statuts.map(effet)
  }
})

describe("Ultrason et invisibilité (SR5 p. 449, p. 294)", () => {
  it("le système offre l'état que Foundry lit comme invisible", () => {
    expect(SR5.statusEffects.some(s => s.id === "invisible")).toBe(true)
  })

  it("la vision ordinaire ne voit pas ce que Foundry juge invisible", () => {
    expect(basicSightDetects(false, jeton("invisible"))).toBe(false)
  })

  it("la vision ordinaire ne voit toujours pas un corps en projection astrale", () => {
    expect(basicSightDetects(true, jeton("astralInit"))).toBe(false)
  })

  it("la vision ordinaire voit un jeton sans état particulier", () => {
    expect(basicSightDetects(true, jeton())).toBe(true)
    expect(basicSightDetects(true, {
    })).toBe(true)
  })
})
