import {
  describe, it, expect
} from "vitest"
import {
  planMentorMigration, CONVERSION_FLAG, REVERTED_FLAG
} from "../modules/entities/items/mentor-link.js"
import {
  readFileSync
} from "node:fs"

// World migration of the former mentor qualities (DjamZ, 16/10: the quality « Esprit mentor » is bought, the mentor
// item of the Megapack carries the effects)
const effect = (target, value = 2) => ({
  category: "skills", target, type: "value", value
})
const quality = (id, name, extra = {
}) => ({
  id, type: "itemQuality", name, system: {
    customEffects: [effect("system.skills.perception.test")], ...extra.system
  }, flags: extra.flags ?? {
  }
})
const mentor = (id, name) => ({
  id, type: "itemMentorSpirit", name, system: {
  }
})
const SOURCES = ["Aigle", "Loup", "Chatte"]

describe("world migration of the former mentor qualities", () => {
  it("links each former quality to a copy of the Megapack's mentor, named after the generic quality", () => {
    const plan = planMentorMigration([quality("q", "Esprit mentor (Loup) [Magicien]")], SOURCES, "Esprit mentor", "magician")
    expect(plan.create).toEqual([{
      key: "loup", name: "Loup", mysticPath: ""
    }])
    expect(plan.link).toEqual([{
      qualityId: "q", mentorKey: "loup", name: "Esprit mentor",
      original: {
        name: "Esprit mentor (Loup) [Magicien]", customEffects: [effect("system.skills.perception.test")]
      }
    }])
    expect(plan.missing).toEqual([])
  })

  it("gives a mystic adept the block of the variant held (SR5 p. 324), and none when both are held", () => {
    expect(planMentorMigration([quality("q", "Esprit mentor (Aigle) [Adepte]")], SOURCES, "Esprit mentor", "mysticalAdept").create[0].mysticPath).toBe("adept")
    const both = planMentorMigration([quality("a", "Esprit mentor (Aigle) [Adepte]"), quality("m", "Esprit mentor (Aigle) [Magicien]")], SOURCES, "Esprit mentor", "mysticalAdept")
    expect(both.create).toEqual([{
      key: "aigle", name: "Aigle", mysticPath: ""
    }])
    expect(both.link.map(l => l.qualityId)).toEqual(["a", "m"])
    // An adept follows the Adept block by its type: nothing to write on the item
    expect(planMentorMigration([quality("q", "Esprit mentor (Aigle) [Adepte]")], SOURCES, "Esprit mentor", "adept").create[0].mysticPath).toBe("")
  })

  it("reuses a mentor item of the same name already on the actor, even without the Megapack", () => {
    const plan = planMentorMigration([quality("q", "Esprit mentor (Chien) [Magicien]"), mentor("m", "Chien")], [], "Esprit mentor", "magician")
    expect(plan.create).toEqual([])
    expect(plan.link[0]).toMatchObject({
      qualityId: "q", mentorId: "m"
    })
    expect(plan.missing).toEqual([])
  })

  it("leaves as it was a quality whose mentor has no item: no Megapack, or no mentor of that name", () => {
    const items = [quality("q", "Esprit mentor (Licorne) [Magicien]")]
    expect(planMentorMigration(items, [], "Esprit mentor", "magician")).toEqual({
      create: [], link: [], missing: [{
        qualityId: "q", name: "Esprit mentor (Licorne) [Magicien]"
      }]
    })
    expect(planMentorMigration(items, SOURCES, "Esprit mentor", "magician").missing).toHaveLength(1)
  })

  it("is idempotent: converted, linked, reverted or effect-less qualities, and the generic one, are skipped", () => {
    const items = [
      quality("c", "Esprit mentor", {
        flags: {
          sr5: {
            [CONVERSION_FLAG]: {
              name: "Esprit mentor (Loup) [Magicien]"
            }
          }
        }, system: {
          customEffects: [], linkedMentor: "m"
        }
      }),
      quality("r", "Esprit mentor (Loup) [Magicien]", {
        flags: {
          sr5: {
            [REVERTED_FLAG]: true
          }
        }
      }),
      quality("e", "Esprit mentor (Loup) [Magicien]", {
        system: {
          customEffects: []
        }
      }),
      quality("g", "Esprit mentor"),
      mentor("m", "Loup"),
    ]
    expect(planMentorMigration(items, SOURCES, "Esprit mentor", "magician")).toEqual({
      create: [], link: [], missing: []
    })
  })
})

describe("wiring of the world migration", () => {
  const conversion = readFileSync(new URL("../modules/entities/items/mentor-conversion.js", import.meta.url), "utf8")
  const ready = readFileSync(new URL("../modules/hooks/ready.js", import.meta.url), "utf8")
  const fr = JSON.parse(readFileSync(new URL("../lang/fr.json", import.meta.url), "utf8"))
  const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"))

  it("runs at load, for the active GM only, with no button", () => {
    expect(ready).toMatch(/runMentorMigration\(\)\.catch/)
    expect(conversion).toMatch(/export async function runMentorMigration\(\)\{\s*if \(!game\.user\.isGM \|\| game\.users\.activeGM\?\.id !== game\.user\.id\) return/)
  })

  it("marks the reverted qualities, so that the migration does not undo the GM's choice", () => {
    expect(conversion).toMatch(/\[`flags\.sr5\.\$\{REVERTED_FLAG\}`\]: true/)
  })

  it("has its texts in both languages", () => {
    for (const key of ["SR5.MentorMigrationTitle", "SR5.MentorMigrationConverted", "SR5.MentorMigrationLeft", "SR5.MentorMigrationLine", "SR5.MentorMigrationMissing"]){
      expect(fr[key], key).toBeTruthy()
      expect(en[key], key).toBeTruthy()
    }
  })
})
