import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from "node:fs"

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  gruntProfileEssence, gruntEssenceFromForm, gruntEssenceMax, knowsEssenceExpansion, ESSENCE_DRAIN_MAX
} = await import('../modules/system/grunt-profile-essence.js')

// A grunt's profile prints its Essence (SR5 p. 381): without implants on the sheet, it stayed at 6 (Philippine#6139, 16/10)
describe("Essence typed on a grunt's profile", () => {
  const template = readFileSync(new URL("../templates/actors/_partials/left-tabs/derived/essence.hbs", import.meta.url), "utf8")

  it("is a field of the grunt sheet only", () => {
    expect(template).toContain(`{{#if (eq actor.type 'actorGrunt')}}`)
    expect(template).toContain(`name="system.essence.base"`)
    const field = template.indexOf(`name="system.essence.base"`)
    expect(template.lastIndexOf(`{{#if (eq actor.type 'actorGrunt')}}`, field)).toBeGreaterThan(-1)
  })

  it("is lowered further by the implants on the sheet", () => {
    const actor = {
      items: [],
      system: {
        essence: {
          base: 4.5, value: 0, holeAmount: 0, holeBase: 0,
          modifiers: [{
            source: "Datajack", type: "itemAugmentation", value: -0.1
          }],
        },
      },
    }
    SR5_CharacterUtility.updateEssence(actor)
    expect(actor.system.essence.value).toBeCloseTo(4.4)
  })
})

// Relecture djamz.17 : aucune borne (vidé → 0, −2 → −2, 9 → 9, « 4,5 » → NaN)
describe("Essence of a grunt's profile, bounded", () => {
  it("is kept between 0 and 6", () => {
    expect(gruntProfileEssence("-2")).toBe(0)
    expect(gruntProfileEssence("9")).toBe(6)
    expect(gruntProfileEssence(-2)).toBe(0)
    expect(gruntProfileEssence(9)).toBe(6)
    expect(gruntProfileEssence("0")).toBe(0)
    expect(gruntProfileEssence("6")).toBe(6)
  })

  it("reads the decimal comma", () => {
    expect(gruntProfileEssence("4,5")).toBe(4.5)
    expect(gruntProfileEssence(" 3.2 ")).toBe(3.2)
  })

  it("goes back to 6 when emptied, as the help says", () => {
    expect(gruntProfileEssence("")).toBe(6)
    expect(gruntProfileEssence("   ", 3)).toBe(6)
    expect(gruntProfileEssence(null)).toBe(6)
    expect(gruntProfileEssence(undefined)).toBe(6)
  })

  it("keeps the previous value when unreadable", () => {
    expect(gruntProfileEssence("abc", 4)).toBe(4)
    expect(gruntProfileEssence(NaN)).toBe(6)
  })

  it("is read from the field as typed when the sheet is submitted", () => {
    const form = {
      elements: {
        "system.essence.base": {
          value: "4,5"
        }
      }
    }
    expect(gruntEssenceFromForm(form, {
      system: {
        essence: {
          base: NaN
        }
      }
    }).system.essence.base).toBe(4.5)
    expect(gruntEssenceFromForm(form, {
      "system.essence.base": NaN
    })["system.essence.base"]).toBe(4.5)
    const other = {
      name: "x"
    }
    expect(gruntEssenceFromForm({
      elements: {
      }
    }, other)).toEqual({
      name: "x"
    })
  })

  it("is bounded on a grunt whatever wrote it, not on a PC", () => {
    const actor = (type, base) => ({
      type, items: [],
      system: {
        essence: {
          base, value: 0, holeAmount: 0, holeBase: 0, modifiers: []
        }
      },
    })
    const grunt = actor("actorGrunt", 9)
    SR5_CharacterUtility.updateEssence(grunt)
    expect(grunt.system.essence.value).toBe(6)
    const negative = actor("actorGrunt", -2)
    SR5_CharacterUtility.updateEssence(negative)
    expect(negative.system.essence.value).toBe(0)
    const pc = actor("actorPc", 5)
    SR5_CharacterUtility.updateEssence(pc)
    expect(pc.system.essence.value).toBe(5)
  })
})

// Relecture du 21/10, D7 (rule read by Élise): Essence Drain doubles the maximum Essence (Dark Terrors p. 169: « un vampire
// ayant une Essence maximale de 12 »), +1 per grade of Initiation with the metamagic Essence Expansion
describe("Essence of a grunt with Essence Drain", () => {
  const grunt = (base, {
    drain = true, items = [], grade = 0, key = false
  } = {
  }) => ({
    type: "actorGrunt", items,
    system: {
      specialProperties: {
        essenceDrain: drain
      },
      magic: {
        initiationGrade: grade, metamagics: {
          essenceExpansion: key
        }
      },
      essence: {
        base, value: 0, holeAmount: 0, holeBase: 0, modifiers: []
      },
    },
  })
  const expansion = name => ({
    type: "itemMetamagic", name
  })

  it("is bounded at 6 without it, at 12 with it", () => {
    expect(ESSENCE_DRAIN_MAX).toBe(12)
    expect(gruntEssenceMax(grunt(6, {
      drain: false
    }))).toBe(6)
    expect(gruntEssenceMax(grunt(6))).toBe(12)
    expect(gruntEssenceMax(null)).toBe(6)
  })
  it("adds a grade of Initiation each with Essence Expansion, known by its key or its name, FR or VO", () => {
    expect(gruntEssenceMax(grunt(6, {
      grade: 3
    }))).toBe(12)
    expect(gruntEssenceMax(grunt(6, {
      grade: 3, key: true
    }))).toBe(15)
    expect(gruntEssenceMax(grunt(6, {
      grade: 2, items: [expansion("Expansion d’Essence")]
    }))).toBe(14)
    expect(knowsEssenceExpansion(grunt(6, {
      items: [expansion("Essence Expansion")]
    }))).toBe(true)
    expect(knowsEssenceExpansion(grunt(6, {
      items: [expansion("Centrage")]
    }))).toBe(false)
    // Without Essence Drain, the metamagic changes nothing
    expect(gruntEssenceMax(grunt(6, {
      drain: false, grade: 3, key: true
    }))).toBe(6)
  })
  it("shows the Essence a drain raised above 6, and still bounds it", () => {
    const vampire = grunt(7)
    SR5_CharacterUtility.updateEssence(vampire)
    expect(vampire.system.essence.value).toBe(7)
    const glutton = grunt(13)
    SR5_CharacterUtility.updateEssence(glutton)
    expect(glutton.system.essence.value).toBe(12)
    const human = grunt(7, {
      drain: false
    })
    SR5_CharacterUtility.updateEssence(human)
    expect(human.system.essence.value).toBe(6)
  })
  it("reads the typed field with the actor's bound", () => {
    const form = {
      elements: {
        "system.essence.base": {
          value: "9,5"
        }
      }
    }
    expect(gruntEssenceFromForm(form, {
      "system.essence.base": 0
    }, 6, 12)["system.essence.base"]).toBe(9.5)
    expect(gruntEssenceFromForm(form, {
      "system.essence.base": 0
    }, 6)["system.essence.base"]).toBe(6)
    expect(gruntProfileEssence("15", 6, 12)).toBe(12)
    expect(readFileSync(new URL("../modules/entities/actors/gruntSheet.js", import.meta.url), "utf8"))
      .toMatch(/gruntEssenceFromForm\(form, data, [^)]*gruntEssenceMax\(this\.document\)\)/)
  })
})
