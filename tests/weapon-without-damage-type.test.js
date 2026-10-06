import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "fs"

// SR5 p. 171: damage is either Physical or Stun. A weapon entered without a type gave "Encaisser VD : 4undefined"
// and damage that no condition monitor took: the attacker now picks the type in the roll dialog.
describe("Weapon without a damage type", () => {
  const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
  const weapon = read("../modules/rolls/roll-prepare-case/rollData-Weapon.js")
  const dialog = read("../templates/rolls/roll-dialog.hbs")
  const partial = read("../templates/rolls/rollDialogPartial/astralDamageType.hbs")

  it("asks for the type in the roll dialog", () => {
    expect(weapon).toContain("if (!rollData.damage.type) rollData.dialogSwitch.chooseDamageType = true")
    expect(weapon.indexOf("rollData.damage.type = itemData.damageType")).toBeLessThan(weapon.indexOf("if (!rollData.damage.type)"))
  })
  it("shows a damage type choice written back to the roll", () => {
    expect(dialog).toContain("{{#if dialogSwitch.chooseDamageType}}")
    expect(partial).toContain('data-modifier="damageType"')
    expect(partial).toContain("lists.damageTypes")
  })
})
