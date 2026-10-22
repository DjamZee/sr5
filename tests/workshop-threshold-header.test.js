import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// The workshop's « Seuil » header (atelier.hbs): measured in game on 22/10, FR and EN, on the drone sheet (column 46 px)
// and on the vehicle item sheet, the narrowest (650 px, column 32.4 px): « Seuil » takes 29.3 px, « Thr. » 23.4 px.
// No overflow, unlike the addictions' header. A longer short label would spill over: this keeps it within the measure.
describe("the workshop's threshold header", () => {
  const template = readFileSync(new URL("../templates/actors/_partials/right-tabs/droneStuff/atelier.hbs", import.meta.url), "utf8")
  const lang = code => JSON.parse(readFileSync(new URL(`../lang/${code}.json`, import.meta.url), "utf8"))

  it("is the short label in its one column", () => {
    expect(template).toContain(`<div class="col-1 SR-TextCenter" data-tooltip="{{localize 'SR5.Threshold'}}">{{localize 'SR5.ThresholdShort'}}</div>`)
  })

  it("keeps a short label no longer than the measured « Seuil », in both languages", () => {
    for (const code of ["fr", "en"]) expect(lang(code)["SR5.ThresholdShort"].length).toBeLessThanOrEqual(5)
  })
})
