import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "fs"
import {
  aimForPerfectionReminder
} from "../modules/rolls/roll-prepare-case/rollData-Weapon.js"

//Aim for Perfection (Assassin's Primer p. 15): "must opt for a Called Shot" unless it does not fit; the dialog reminds it
describe("Aim for Perfection reminder", () => {
  it("is raised by the quality only", () => {
    expect(aimForPerfectionReminder({
      specialProperties: {
        calledShotHalved: true
      }
    })).toBe(true)
    expect(aimForPerfectionReminder({
      specialProperties: {
        calledShotHalved: false
      }
    })).toBe(false)
  })
  it("is shown by the attack dialog", () => {
    const template = readFileSync(new URL("../templates/rolls/rollDialogPartial/calledShots.hbs", import.meta.url), "utf8")
    expect(template).toContain("{{#if combat.calledShot.aimForPerfection}}")
    expect(template).toContain("SR5.AimForPerfectionReminder")
  })
})
