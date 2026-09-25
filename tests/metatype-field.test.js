import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// Every actor holds its metatype in 'biography.metatype'. 'biography.characterMetatype' is the
// legacy key the migration renames, still read for an actor not migrated yet. Reading only one of
// the two left such a character without its metatype, and so without the vision that metatype is
// owed (SR5 p. 68).
const acteur = (biography) => ({
  system: {
    biography
  }
})

describe("SR5_CharacterUtility.getMetatype", () => {
  it("reads the field a player character sheet writes", () => {
    expect(SR5_CharacterUtility.getMetatype(acteur({
      metatype: "dwarf"
    }))).toBe("dwarf")
  })

  it("reads the field a grunt carries", () => {
    expect(SR5_CharacterUtility.getMetatype(acteur({
      characterMetatype: "troll"
    }))).toBe("troll")
  })

  // The migration renames 'characterMetatype' to 'metatype' and keeps 'metatype' when both exist,
  // so 'metatype' is the one that wins here too.
  it("prefers the current field when an actor not migrated yet holds both", () => {
    expect(SR5_CharacterUtility.getMetatype(acteur({
      characterMetatype: "elf", metatype: "ork"
    }))).toBe("ork")
  })

  it("returns nothing for a character that has no metatype", () => {
    expect(SR5_CharacterUtility.getMetatype(acteur({
      metatype: "", characterMetatype: ""
    }))).toBe("")
    expect(SR5_CharacterUtility.getMetatype(acteur({
    }))).toBe("")
    expect(SR5_CharacterUtility.getMetatype({
      system: {
      }
    })).toBe("")
    expect(SR5_CharacterUtility.getMetatype(undefined)).toBe("")
  })
})
