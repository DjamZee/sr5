import {
  describe, it, expect
} from "vitest"
import {
  existsSync, readFileSync
} from "node:fs"
import {
  isFollowedMentor, mentorMagic, mentorPowerPoints, mentorMaskOn
} from "../modules/entities/items/mentor-spirits.js"

// The itemMentorSpirit type is declared everywhere a type of item has to be (SR5 p. 76, 323-324)
describe("itemMentorSpirit declaration", () => {
  it("is a document type with its default icon", () => {
    const system = JSON.parse(readFileSync("system.json", "utf8"))
    expect(system.documentTypes.Item).toHaveProperty("itemMentorSpirit")
    expect(existsSync("assets/img/items/itemMentorSpirit.svg")).toBe(true)
  })

  it("has a default name, without which the sheet's + creates nothing", () => {
    expect(readFileSync("modules/entities/items/utilityItem.js", "utf8")).toContain('case "itemMentorSpirit":')
    expect(JSON.parse(readFileSync("lang/fr.json", "utf8"))["SR5.MentorSpiritNew"]).toBe("Nouvel esprit mentor")
  })

  it("has its blocks, its layout and preloaded templates that exist", () => {
    const registry = readFileSync("modules/interface/item-block-registry.js", "utf8")
    expect(registry).toContain("mentorSpiritSummary")
    expect(registry).toContain("mentorSpiritStat")
    expect(readFileSync("modules/interface/item-default-layout.js", "utf8"))
      .toContain("itemMentorSpirit: () => _threeTabLayout('mentorSpiritSummary', 'mentorSpiritStat')")
    const preloaded = readFileSync("modules/templates.js", "utf8").match(/systems\/sr5\/templates\/[^"]*mentorSpirit[^"]*\.hbs/g)
    expect(preloaded.length).toBe(4)
    for (const path of preloaded) expect(existsSync(path.replace("systems/sr5/", ""))).toBe(true)
  })

  it("is named in both languages, with the Mask setting", () => {
    for (const lang of ["fr", "en"]) {
      const json = JSON.parse(readFileSync(`lang/${lang}.json`, "utf8"))
      expect(json.TYPES.Item.itemMentorSpirit).toBeTruthy()
      expect(json["SR5.SETTINGS_MentorMask_T"]).toBeTruthy()
      expect(json["SR5.MentorPathDrawback"]).toBeTruthy()
    }
  })

  it("lets each effect of a mentor pick its block in the effect editor", () => {
    expect(readFileSync("templates/items/_partial/effect/effect.hbs", "utf8"))
      .toContain("system.customEffects.{{@key}}.mentorPath")
  })
})

describe("mentor spirit on the actor (SR5 p. 76, 324; Forbidden Arcana p. 176)", () => {
  it("follows only the first mentor", () => {
    const items = [{
      id: "a", type: "itemQuality"
    }, {
      id: "b", type: "itemMentorSpirit"
    }, {
      id: "c", type: "itemMentorSpirit"
    }]
    expect(isFollowedMentor(items[1], items)).toBe(true)
    expect(isFollowedMentor(items[2], items)).toBe(false)
  })

  it("reads the Magic left after the Essence lost to augmentations (review R1)", () => {
    const magic = {
      natural: {
        base: 2, modifiers: []
      }, augmented: {
        value: 0, modifiers: []
      }
    }
    expect(mentorMagic(magic)).toBe(2)
    // 1.5 Essence of cyberware: 2 points of Magic lost, the mentor lies dormant as the sheet says
    const essence = {
      modifiers: [{
        type: "itemAugmentation", value: -1.5
      }, {
        type: "base", value: 6
      }]
    }
    expect(mentorMagic(magic, essence)).toBe(0)
    // A stale augmented value from the previous preparation is not read
    expect(mentorMagic({
      ...magic, augmented: {
        value: 5, modifiers: []
      }
    }, essence)).toBe(0)
    // GreyWare: one more point per implant (BTB p. 142)
    expect(mentorMagic(magic, undefined, 1)).toBe(1)
    expect(mentorMagic(undefined)).toBe(0)
  })

  it("gives adepts the free Power Points, and 1 more with the Mask rule", () => {
    const system = {
      freePowerPoints: 0.5, mask: true
    }
    expect(mentorPowerPoints("adept", system, false, 4)).toBe(0.5)
    expect(mentorPowerPoints("adept", system, true, 4)).toBe(1.5)
    expect(mentorPowerPoints("magician", system, true, 4)).toBe(0)
    expect(mentorPowerPoints("adept", system, true, 0)).toBe(0)
  })

  it("puts the Mask on a magician only with the optional rule", () => {
    expect(mentorMaskOn("magician", {
      mask: true
    }, true, 3)).toBe(true)
    expect(mentorMaskOn("magician", {
      mask: true
    }, false, 3)).toBe(false)
    expect(mentorMaskOn("adept", {
      mask: true
    }, true, 3)).toBe(false)
    expect(mentorMaskOn("magician", {
      mask: false
    }, true, 3)).toBe(false)
  })
})
