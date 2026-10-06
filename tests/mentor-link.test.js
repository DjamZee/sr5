import {
  describe, it, expect
} from "vitest"
import {
  isMentorQuality, mentorLinkWarnings, variantPath, mentorNameOf, planMentorConversion, planMentorRevert, CONVERSION_FLAG
} from "../modules/entities/items/mentor-link.js"

const effect = (target, value = 2) => ({
  category: "skills", target, type: "value", value
})
const quality = (id, name, extra = {
}) => ({
  id, type: "itemQuality", name, system: {
    customEffects: [], ...extra.system
  }, flags: extra.flags ?? {
  }
})
const mentor = (id, name) => ({
  id, type: "itemMentorSpirit", name, system: {
  }
})

describe("Mentor Spirit quality (SR5 p. 76)", () => {
  it("recognises the quality by its name or by its link", () => {
    expect(isMentorQuality(quality("q", "Esprit mentor (Aigle) [Magicien]"))).toBe(true)
    expect(isMentorQuality(quality("q", "Mentor Spirit (Wolf)"))).toBe(true)
    expect(isMentorQuality(quality("q", "Avantage lié", {
      system: {
        linkedMentor: "m"
      }
    }))).toBe(true)
    // Counter-check: a quality that merely mentions a mentor is not one
    expect(isMentorQuality(quality("q", "Apprenti de choix"))).toBe(false)
    expect(isMentorQuality(mentor("m", "Esprit mentor"))).toBe(false)
  })
})

describe("link warnings", () => {
  it("is silent when the quality links to the mentor", () => {
    expect(mentorLinkWarnings([quality("q", "Esprit mentor", {
      system: {
        linkedMentor: "m"
      }
    }), mentor("m", "Loup")])).toEqual([])
  })

  it("warns about a mentor without its quality, which still applies", () => {
    expect(mentorLinkWarnings([mentor("m", "Loup")])).toEqual([{
      kind: "missingQuality", mentor: "Loup"
    }])
  })

  it("warns about a quality without a mentor, or linked to a mentor that is gone", () => {
    expect(mentorLinkWarnings([quality("q", "Esprit mentor")])).toEqual([{
      kind: "missingMentor", quality: "Esprit mentor"
    }])
    expect(mentorLinkWarnings([quality("q", "Esprit mentor", {
      system: {
        linkedMentor: "gone"
      }
    })])).toEqual([{
      kind: "missingMentor", quality: "Esprit mentor"
    }])
  })

  it("names both sides when an old quality still carries its bonuses next to a mentor", () => {
    const old = quality("q", "Esprit mentor (Loup) [Magicien]", {
      system: {
        customEffects: [effect("system.skills.tracking.test")]
      }
    })
    expect(mentorLinkWarnings([old, mentor("m", "Loup")])).toContainEqual({
      kind: "double", quality: "Esprit mentor (Loup) [Magicien]", mentor: "Loup"
    })
  })

  it("leaves an old-style quality alone when there is no mentor item", () => {
    expect(mentorLinkWarnings([quality("q", "Esprit mentor (Loup) [Magicien]", {
      system: {
        customEffects: [effect("system.skills.tracking.test")]
      }
    })])).toEqual([])
  })
})

describe("conversion of old mentor qualities", () => {
  it("reads the mentor and the block from the compendium names", () => {
    expect(mentorNameOf("Esprit mentor (Aigle) [Magicien]")).toBe("Aigle")
    expect(mentorNameOf("Esprit Mentor (Adversaire) [Adepte]")).toBe("Adversaire")
    expect(variantPath("Esprit mentor (Aigle) [Magicien]")).toBe("magician")
    expect(variantPath("Esprit Mentor (Adversaire) [Adepte]")).toBe("adept")
    expect(variantPath("Esprit mentor (Chien)")).toBe("all")
  })

  it("makes one mentor of both variants, each effect keeping its block", () => {
    const items = [
      quality("a", "Esprit mentor (Loup) [Adepte]", {
        system: {
          customEffects: [effect("system.skills.tracking.test")]
        }
      }),
      quality("b", "Esprit mentor (Loup) [Magicien]", {
        system: {
          customEffects: [effect("system.skills.spellcasting.spellCategory.combat")]
        }
      }),
    ]
    const plan = planMentorConversion(items, "Esprit mentor")
    expect(plan.create).toHaveLength(1)
    expect(plan.create[0].name).toBe("Loup")
    expect(plan.create[0].customEffects.map(e => e.mentorPath)).toEqual(["adept", "magician"])
    expect(plan.link.map(l => [l.qualityId, l.mentorKey, l.name])).toEqual([["a", "loup", "Esprit mentor"], ["b", "loup", "Esprit mentor"]])
    expect(plan.link[0].original).toEqual({
      name: "Esprit mentor (Loup) [Adepte]", customEffects: [effect("system.skills.tracking.test")]
    })
  })

  it("reuses a mentor item of the same name instead of doubling it", () => {
    const plan = planMentorConversion([quality("q", "Esprit mentor (Loup)", {
      system: {
        customEffects: [effect("x")]
      }
    }), mentor("m", "Loup")], "Esprit mentor")
    expect(plan.create).toEqual([])
    expect(plan.link[0].mentorId).toBe("m")
  })

  it("plans nothing when run again", () => {
    const converted = quality("q", "Esprit mentor", {
      system: {
        customEffects: [], linkedMentor: "m"
      }, flags: {
        sr5: {
          [CONVERSION_FLAG]: {
            name: "Esprit mentor (Loup)"
          }
        }
      }
    })
    expect(planMentorConversion([converted, mentor("m", "Loup")], "Esprit mentor")).toEqual({
      create: [], link: []
    })
  })

  it("goes back: name and effects restored, created mentor removed, reused mentor kept", () => {
    const created = quality("q", "Esprit mentor", {
      system: {
        linkedMentor: "m1"
      }, flags: {
        sr5: {
          [CONVERSION_FLAG]: {
            name: "Esprit mentor (Loup)", customEffects: [effect("x")], createdMentor: true
          }
        }
      }
    })
    const reused = quality("r", "Esprit mentor", {
      system: {
        linkedMentor: "m2"
      }, flags: {
        sr5: {
          [CONVERSION_FLAG]: {
            name: "Esprit mentor (Rat)", customEffects: [], createdMentor: false
          }
        }
      }
    })
    expect(planMentorRevert([created, reused])).toEqual({
      restore: [{
        qualityId: "q", name: "Esprit mentor (Loup)", customEffects: [effect("x")]
      }, {
        qualityId: "r", name: "Esprit mentor (Rat)", customEffects: []
      }],
      remove: ["m1"],
    })
  })
})
