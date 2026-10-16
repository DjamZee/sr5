import {
  describe, it, expect
} from "vitest"
import {
  AUTOMATION_PRESETS, rulesPresetValues, presetChanges, taggedBooleanSettings, RULES_PRESET_EXCLUDED,
  plainSettingValue, sameSettingValue, newWorldPresetChanges
} from "../modules/system/settings-presets.js"
import {
  presetLocks
} from "../modules/system/rule-locks.js"
import {
  SETTINGS_CATALOG, SETTINGS_TABS, MENU_CATALOG
} from "../modules/system/settings-catalog.js"

const settings = [
  {
    key: "sr5GrapplingRules", tag: "book", type: Boolean, default: false
  },
  {
    key: "sr5CalledShotsRules", tag: "book", type: Boolean, default: true
  },
  {
    key: "sr5FreeReload", tag: "house", type: Boolean, default: false
  },
  {
    key: "sr5RGTargetSize", tag: "book", type: Boolean, default: false
  },
  {
    key: "sr5ReagentSystem", tag: "book", type: String, default: "core"
  },
]

describe("settings presets (lot 10)", () => {
  it("head the settings window, their menu alone in the first tab", () => {
    expect(SETTINGS_TABS[0].id).toBe("presets")
    expect(MENU_CATALOG.sr5PresetsMenu).toBe("presets")
  })

  it("books and supplements: every option of a book on, house rules at their default", () => {
    expect(rulesPresetValues("book", settings)).toEqual({
      sr5GrapplingRules: true, sr5CalledShotsRules: true, sr5FreeReload: false
    })
  })

  it("house rules: house rules on, the books' options back to the core book", () => {
    expect(rulesPresetValues("house", settings)).toEqual({
      sr5GrapplingRules: false, sr5CalledShotsRules: true, sr5FreeReload: true
    })
  })

  it("both: everything tagged on; never the Run & Gun options, nor a setting that is not a box", () => {
    const values = rulesPresetValues("mixed", settings)
    expect(values).toEqual({
      sr5GrapplingRules: true, sr5CalledShotsRules: true, sr5FreeReload: true
    })
    expect(RULES_PRESET_EXCLUDED.has("sr5RGTargetSize")).toBe(true)
  })

  it("automation: the rule locks all lifted or all on, with the settings of how far the system automates", () => {
    expect(presetChanges({
      automation: "light", rules: ""
    }, settings)).toEqual({
      values: AUTOMATION_PRESETS.light.values, locks: presetLocks("light")
    })
    expect(presetChanges({
      automation: "advanced"
    }, settings).locks).toEqual(presetLocks("book"))
    // Nothing chosen: nothing written
    expect(presetChanges({
      automation: "", rules: ""
    }, settings)).toEqual({
      values: {
      }, locks: null
    })
  })

  it("every key an automation preset writes is a setting of the window", () => {
    for (const preset of Object.values(AUTOMATION_PRESETS)) {
      for (const key of Object.keys(preset.values)) expect(SETTINGS_CATALOG[key]).toBeDefined()
    }
  })

  it("keep a Set as the array it is written with, and find it equal to that array (measured in game, 14/10)", () => {
    expect(plainSettingValue(new Set(["a", "b"]))).toEqual(["a", "b"])
    expect(plainSettingValue(new Set())).toEqual([])
    expect(sameSettingValue(new Set(["a"]), ["a"])).toBe(true)
    expect(sameSettingValue(new Set(["a"]), [])).toBe(false)
    expect(plainSettingValue({
      book: true
    })).toEqual({
      book: true
    })
  })

  it("read the world's tagged boxes from the registry, world scope only", () => {
    const registry = new Map([
      ["sr5.sr5GrapplingRules", {
        scope: "world", type: Boolean, default: false
      }],
      ["sr5.sr5FreeReload", {
        scope: "world", type: Boolean, default: false
      }],
      ["sr5.sr5ReagentSystem", {
        scope: "world", type: String, default: "core"
      }],
      ["sr5.sr5ChooseStyle", {
        scope: "client", type: String, default: "SR5"
      }],
    ])
    expect(taggedBooleanSettings(registry).map(s => s.key).sort()).toEqual(["sr5FreeReload", "sr5GrapplingRules"])
  })
})

describe("the question of a new world applies the Presets menu (lot 16b)", () => {
  it("Automatisation : Avancée = the advanced preset, Légère = the light one, the rules half untouched", () => {
    expect(newWorldPresetChanges("advanced")).toEqual({
      values: AUTOMATION_PRESETS.advanced.values, locks: presetLocks("book")
    })
    expect(newWorldPresetChanges("light")).toEqual({
      values: AUTOMATION_PRESETS.light.values, locks: presetLocks("light")
    })
  })
  it("Personnalisée applies nothing; the window closed, or an old answer, is Avancée (DjamZ, 14/10)", () => {
    expect(newWorldPresetChanges("custom")).toBeNull()
    expect(newWorldPresetChanges(null)).toEqual(newWorldPresetChanges("advanced"))
    expect(newWorldPresetChanges("bookFreeActions")).toEqual(newWorldPresetChanges("advanced"))
  })
})
