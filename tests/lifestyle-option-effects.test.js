import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  SR5
} from "../modules/config.js"
import {
  lifestyleOptionEffectKey
} from "../modules/entities/items/lifestyle-options.js"

const fr = JSON.parse(readFileSync(new URL("../lang/fr.json", import.meta.url), "utf8"))
const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"))

describe("the tooltip of a lifestyle option (Run Faster p. 210)", () => {
  it("every option finds its game effect, in French and in English", () => {
    for (const name of Object.keys(SR5.allLifestyleOptions)) {
      const key = lifestyleOptionEffectKey(name)
      expect(fr[key], `${name} (${key})`).toBeTypeOf("string")
      expect(en[key], `${name} (${key})`).toBeTypeOf("string")
    }
  })
  it("the three increases show their own text", () => {
    expect(lifestyleOptionEffectKey("addComforts")).toBe("SR5.LifeStyleAddComforts_GE")
    expect(lifestyleOptionEffectKey("addSecurity")).toBe("SR5.LifeStyleAddSecurity_GE")
    expect(lifestyleOptionEffectKey("addNeighborhood")).toBe("SR5.LifeStyleAddNeighborhood_GE")
    expect(lifestyleOptionEffectKey("armory")).toBe("SR5.LifeStyleOptionArmory_GE")
  })
})
