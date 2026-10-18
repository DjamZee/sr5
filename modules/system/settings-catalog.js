/**
 * Where each system setting is shown in the settings window (B10).
 *
 * No setting is registered or renamed here: every key keeps its registration, its scope,
 * its type and its default where it already was, so a world loses nothing. Once all of them
 * are registered, captureSystemSettings() takes the visible ones (config: true) out of Foundry's
 * general list and hands them to the window, which sorts them into the tabs below.
 *
 * A setting registered later without a line here still shows, in the "other" tab, and the test
 * (tests/settings-window.test.js) fails until it is given its tab.
 */

export const SETTINGS_WINDOW_MENU = "sr5SettingsWindow"

// The tabs, in the order the window shows them (DjamZ's order, 09/10; the Matrix tab, which he did not name, stays
// after Magic). A tab with nothing the user may see is left out; "other" only catches a setting without its line.
export const SETTINGS_TABS = [
  // The presets head the window (lot 10, decision of 09/10): its only entry is their menu
  {
    id: "presets", label: "SR5.SETTINGS_Tab_Presets", icon: "fas fa-wand-magic-sparkles"
  },
  {
    id: "interface", label: "SR5.SETTINGS_Tab_Interface", icon: "fas fa-display"
  },
  {
    id: "combat", label: "SR5.SETTINGS_Tab_Combat", icon: "fas fa-crosshairs"
  },
  {
    id: "magic", label: "SR5.SETTINGS_Tab_Magic", icon: "fas fa-hat-wizard"
  },
  {
    id: "matrix", label: "SR5.SETTINGS_Tab_Matrix", icon: "fas fa-network-wired"
  },
  {
    id: "rigging", label: "SR5.SETTINGS_Tab_Rigging", icon: "fas fa-car"
  },
  {
    id: "panCrown", label: "SR5.SETTINGS_Tab_PanCrown", icon: "fas fa-circle-nodes"
  },
  {
    id: "vision", label: "SR5.SETTINGS_Tab_Vision", icon: "fas fa-eye"
  },
  {
    id: "body", label: "SR5.SETTINGS_Tab_Body", icon: "fas fa-heart-pulse"
  },
  {
    id: "gear", label: "SR5.SETTINGS_Tab_Gear", icon: "fas fa-box-open"
  },
  {
    id: "shop", label: "SR5.SETTINGS_Tab_Shop", icon: "fas fa-store"
  },
  {
    id: "time", label: "SR5.SETTINGS_Tab_Time", icon: "fas fa-calendar-days"
  },
  {
    id: "gm", label: "SR5.SETTINGS_Tab_GM", icon: "fas fa-user-secret"
  },
  {
    id: "other", label: "SR5.SETTINGS_Tab_Other", icon: "fas fa-ellipsis"
  },
]

// The labels a setting may carry: an optional rule printed in a book, or a rule the books do not have
export const SETTINGS_TAGS = {
  book: "SR5.SETTINGS_Tag_Book",
  house: "SR5.SETTINGS_Tag_House",
}

// Key (without the "sr5." namespace) → [tab, tag]. The tag is left out when the setting only tells
// the system how far to automate the book's rule, or how to show it.
export const SETTINGS_CATALOG = {
  // Rule locks: the gamemaster never stopped by them (idea 11, lot 16b), under their menu, which
  // sits in the presets tab since the rule locks tab was merged into it (relecture djamz.13, R9)
  sr5RuleLocksGMExempt: ["presets"],
  // Combat (sr5BlockMissingActions, a rule lock, is edited from the rule locks menu since B13)
  sr5FreeReload: ["combat", "house"],
  sr5CalledShotsRules: ["combat", "book"],
  sr5GrapplingRules: ["combat", "book"],
  sr5RunningFromDistance: ["combat"],
  sr5MeleeEnvironmentBalanced: ["combat", "book"],
  // The optional rules of Run & Gun, RG1 to RG6 (RG p. 121-125, lot 10): together, in the book's order
  sr5RGNoAttackLimit: ["combat", "book"],
  sr5RGTargetSize: ["combat", "book"],
  sr5RGMovementModifiers: ["combat", "book"],
  sr5RGAlternativeInitiative: ["combat", "book"],
  sr5RGArmorAsPenalty: ["combat", "book"],
  sr5RGDefenselessDamage: ["combat", "book"],
  // Healing under fire and advanced medkits are played in combat (DjamZ, 09/10)
  sr5BBUnderFireRules: ["combat", "book"],
  sr5BBAdvancedMedkits: ["combat", "book"],
  // Magic
  sr5ReagentSystem: ["magic", "book"],
  sr5SpiritDrainAttribute: ["magic"],
  // No tag: pictures, not a rule (DjamZ's own, 14/10)
  sr5SpiritDefaultImages: ["magic"],
  mentorMask: ["magic", "book"],
  spiritLeash: ["magic", "book"],
  sr5HomunculusMaterialArmor: ["magic", "house"],
  // No tag: the book gives the bubbles (SR5 p. 329) but no rate on a grid; this only says how they are automated
  sr5SpellShapingBubbleCost: ["magic"],
  // Matrix
  sr5MatrixGridRules: ["matrix"],
  sr5KillCodeRules: ["matrix", "book"],
  sr5OverwatchGMOnly: ["matrix", "book"],
  sr5HostNodes: ["matrix", "house"],
  // The key cipher of the commcode messages and files, a house rule of DjamZ (lot 39)
  sr5CommcodeCipher: ["matrix", "house"],
  sr5DevicelessAILogicDefense: ["matrix"],
  sr5EmulateOverwatchHalf: ["matrix", "house"],
  sr5WifiRequiresDNI: ["matrix"],
  // Rigging
  sr5Rigger5Actions: ["rigging", "book"],
  sr5Rigger5AdvancedDriving: ["rigging", "book"],
  sr5DroneModRules: ["rigging", "book"],
  // PAN crown
  panCrownVisibility: ["panCrown"],
  // The gamemaster's reveal, to the whole table or player by player (idea 10, lot 16b)
  panCrownRevealScope: ["panCrown"],
  panCrownAmbienceCap: ["panCrown"],
  panCrownOpening: ["panCrown"],
  panCrownArKey: ["panCrown"],
  panCrownAmbience: ["panCrown"],
  // Perception and vision
  sr5CyberEyesReplaceNaturalVision: ["vision"],
  sr5VisionRangeLowLight: ["vision"],
  sr5VisionRangeThermographic: ["vision", "house"],
  sr5VisionRangeUltrasound: ["vision"],
  sr5VisionRangeAstral: ["vision"],
  sr5LowLightGreenTint: ["vision", "house"],
  // Body, health and augmentations
  // A character's Flight skill: no tab fits it better (DjamZ, 09/10)
  sr5FlightSkill: ["body"],
  sr5AugmentationCap: ["body"],
  sr5EssenceHole: ["body", "book"],
  sr5AugmentationBundles: ["body", "book"],
  sr5RevealDiseases: ["body"],
  sr5WithdrawalModifier: ["body"],
  sr5HungerMonthDays: ["body"],
  // Looting and spoils, once "gear and storage" (sr5LockpickRequiresKit and sr5StorageCheckGarageLifestyle, rule locks, are edited from the
  // rule locks menu since B13)
  sr5PickpocketThiefChooses: ["gear", "house"],
  sr5StorageDropOnDeath: ["gear", "house"],
  sr5StorageDropOnDeathShare: ["gear", "house"],
  // A backpack, a locker and a credstick for each new player character (relecture djamz.13, R8)
  sr5StarterKit: ["gear"],
  // Shop
  sr5ShopMarketOpen: ["shop"],
  sr5ShopCreationLevel: ["shop"],
  sr5ShopCreationMaxAvailability: ["shop"],
  sr5ShopCreationMaxRating: ["shop"],
  sr5ShopCreationOverLimit: ["shop", "house"],
  sr5ShopGradeGamma: ["shop", "book"],
  sr5ShopGradeGreyware: ["shop", "book"],
  sr5ShopVendorTest: ["shop"],
  sr5ShopSurchargePerDie: ["shop"],
  sr5ShopMaxSurchargeDice: ["shop"],
  sr5ShopDealerKeywords: ["shop"],
  sr5ShopDelivery: ["shop"],
  sr5ShopExpress: ["shop", "house"],
  sr5ShopExpressSurcharge: ["shop", "house"],
  sr5ShopExpressFactor: ["shop", "house"],
  sr5ShopFenceBasePercent: ["shop"],
  sr5ShopFenceStepPercent: ["shop"],
  sr5ShopFenceThreshold: ["shop"],
  sr5ShopContactFencePercent: ["shop"],
  sr5ShopFenceBuyerPool: ["shop"],
  sr5ShopBannerFolder: ["shop"],
  // Calendar and durations
  sr5CalendarStartYear: ["time"],
  sr5CalendarCombatTime: ["time"],
  sr5CalendarRevealDeadlines: ["time"],
  // Gamemaster's tools
  "compendium.creaturePowers": ["gm"],
  "compendium.spritePowers": ["gm"],
  "compendium.baseWeapons": ["gm"],
  // The "+" of each one: custom compendiums read after it (lot 9)
  "compendium.creaturePowersExtra": ["gm"],
  "compendium.spritePowersExtra": ["gm"],
  "compendium.baseWeaponsExtra": ["gm"],
  sr5GMOnlyItemEffects: ["gm"],
  sr5CheckPlayerRolls: ["gm"],
  // Cutting Aces social rules (lot 21): next to the factions and the con tracker
  sr5CuttingAcesSocial: ["gm", "book"],
  // Interface
  sr5ChooseStyle: ["interface"],
  "sr5Help.active": ["interface"],
  sr5RuleReminders: ["interface"],
  sr5DressModuleWindows: ["interface"],
  sr5HideTableRoll: ["interface"],
  sr5IndirectEffectDisplay: ["interface"],
  "sr5Log.active": ["interface"],
  "sr5Log.level": ["interface"],
}

// Submenus (registerMenu key, without the namespace) → tab. They head their tab.
export const MENU_CATALOG = {
  sr5PresetsMenu: "presets",
  sr5RuleLocksMenu: "presets",
  sr5ShopConfigMenu: "shop",
  sr5FactionsMenu: "gm",
  sr5ConTrackerMenu: "gm",
  sr5NegotiationRepairMenu: "gm",
  sr5TokenDefaultsMenu: "gm",
}

// What captureSystemSettings took out of Foundry's list: setting ids, and the submenus by key
const captured = {
  settings: new Set(), menus: new Map()
}

export function capturedSettingIds() {
  return [...captured.settings]
}

export function capturedMenus() {
  return captured.menus
}

/**
 * Take the system's visible settings and submenus out of Foundry's general list, for the window.
 * Called once every setting is registered; a second call picks up those registered since.
 * Only `config` changes (to false), so each value is still read and written under its own key.
 * @param {object} settings game.settings
 * @param {string} namespace
 */
export function captureSystemSettings(settings = game.settings, namespace = "sr5") {
  for (const setting of settings.settings.values()) {
    if (setting.namespace !== namespace || !setting.config) continue
    setting.config = false
    captured.settings.add(setting.id)
  }
  for (const [key, menu] of [...settings.menus.entries()]) {
    if (menu.namespace !== namespace || key === `${namespace}.${SETTINGS_WINDOW_MENU}`) continue
    captured.menus.set(key, menu)
    settings.menus.delete(key)
  }
}

// The tab and the tag of a setting or a submenu (its key without the namespace)
export function catalogEntry(key) {
  const [tab, tag] = SETTINGS_CATALOG[key] ?? [MENU_CATALOG[key] ?? "other"]
  return {
    tab, tag: tag ?? null
  }
}
