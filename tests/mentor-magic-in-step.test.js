import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review: mentorMagic() repeats the Magic of updateSpecialAttributes; each says so, so that nobody changes one alone
describe("mentorMagic and updateSpecialAttributes", () => {
  it("point at each other", () => {
    expect(readFileSync("modules/entities/actors/utilityActor.js", "utf8")).toMatch(/KEEP IN STEP with mentorMagic\(\)/)
    expect(readFileSync("modules/entities/items/mentor-spirits.js", "utf8")).toMatch(/KEEP IN STEP with SR5_CharacterUtility\.updateSpecialAttributes/)
  })
})
