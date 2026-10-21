import {
  describe, it, expect
} from "vitest"
import {
  SETTINGS_CATALOG
} from "../modules/system/settings-catalog.js"
import {
  worldPresetKeys
} from "../modules/system/world-preset-file.js"
import {
  MYSTIC_ADEPT_MASK_DRAIN
} from "../modules/entities/items/mentor-spirits.js"

// Câblage Maison, lot 1 (21/10): the house rules of the system sorted. They stay in the system, off by default, and a
// module of house rules sets them through the presets (decision D3); the world preset file carries every one of them.

const HOUSE = [
  "sr5FreeReload", "sr5HomunculusMaterialArmor", "sr5HostNodes", "sr5CommcodeCipher", "sr5EmulateOverwatchHalf",
  "sr5AugmentationCap", "sr5PickpocketThiefChooses", "sr5StorageDropOnDeath", "sr5StorageDropOnDeathShare",
  "sr5ShopCreationOverLimit", "sr5ShopExpress", "sr5ShopExpressSurcharge", "sr5ShopExpressFactor",
]

describe("the house settings", () => {
  it("are these, and only these", () => {
    const tagged = Object.entries(SETTINGS_CATALOG).filter(([, [, tag]]) => tag === "house").map(([key]) => key)
    expect(tagged.sort()).toEqual([...HOUSE].sort())
  })
  it("leave untagged what is no rule: the thermographic range, the green tint, the guard, the bubbles", () => {
    for (const key of ["sr5VisionRangeThermographic", "sr5LowLightGreenTint", "sr5CheckPlayerRolls",
      "sr5SpellShapingBubbleCost", "sr5WifiRequiresDNI"]) expect(SETTINGS_CATALOG[key][1]).toBeUndefined()
  })
  it("all travel in the world preset file", () => {
    const registry = new Map(HOUSE.map(key => [`sr5.${key}`, {
      key, scope: "world"
    }]))
    expect(worldPresetKeys(registry).sort()).toEqual([...HOUSE].sort())
  })
  it("keeps the mystic adept's Mask a ruling, not a setting", () => {
    expect(MYSTIC_ADEPT_MASK_DRAIN).toBe(true)
    expect(SETTINGS_CATALOG.sr5MysticAdeptMaskDrain).toBeUndefined()
  })
})
