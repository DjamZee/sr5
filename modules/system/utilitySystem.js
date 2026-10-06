import {
  SR5ShopConfig
} from "../interface/shop-config.js"
import {
  SR5FactionRegistry
} from "../interface/faction-registry.js"
import {
  SR5FactionsApp
} from "../interface/factions-app.js"
import {
  SR5NegotiationRepair
} from "../interface/negotiation-repair.js"
import {
  registerBBHealingSettings
} from "./bb-healing-rules.js"
import {
  registerSpiritLedger
} from "./spirit-ledger.js"

export class SR5_SystemHelpers {

  // A sheet render that throws (a missing partial, for instance) would otherwise fail without a word
  static async renderSheetLoudly(document, options){
    try {
      return await document.sheet.render(options)
    } catch (err) {
      console.error(err)
      ui.notifications.error(game.i18n.format("SR5.WARN_SheetRenderFailed", {
        name: document.name
      }))
    }
  }

  // Scene units already reported as unrecognised, so the warning is written once and not on every roll.
  static _unknownSceneUnits = new Set()

  static registerSystemSettings() {

    // System Migration Version
    game.settings.register("sr5", "systemMigrationVersion", {
      name: "SR5.TEXT_TBD",
      scope: "world",
      config: false,
      type: String,
      default: 0
    })

    // Computed modifiers emptied in the source (migration-source-modifiers.js): the version run on this world
    game.settings.register("sr5", "sourceModifiersMigration", {
      name: "SR5.TEXT_TBD",
      scope: "world",
      config: false,
      type: Number,
      default: 0
    })

    // Developper Extra Logging Toggle
    game.settings.register("sr5", "sr5Log.active", {
      name: "SR5.SETTINGS_DevLogActive_T",
      hint: "SR5.SETTINGS_DevLogActive_D",
      scope: "client",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })
    // Developper Extra Logging Level
    game.settings.register("sr5", "sr5Log.level", {
      name: "SR5.SETTINGS_DevLogLevel_T",
      hint: "SR5.SETTINGS_DevLogLevel_D",
      scope: "client",
      config: true,
      default: 0,
      type: Number,
      choices: {
        0: "SR5.SETTINGS.LoggingLevelError",
        1: "SR5.SETTINGS.LoggingLevelWarning",
        2: "SR5.SETTINGS.LoggingLevelInfo",
        3: "SR5.SETTINGS.LoggingLevelDebug",
      },
      requiresReload: true
    })

    //Choose CSS Style
    game.settings.register("sr5", "sr5ChooseStyle", {
      name: "SR5.SETTINGS_ChooseStyle_T",
      hint: "SR5.SETTINGS_ChooseStyle_D",
      scope: "client",
      config: true,
      default: "SR5",
      type: String,
      choices: {
        "SR5": "SR5.SETTINGS.Sr5Style",
        "SR6": "SR5.SETTINGS.Sr6Style",
      },
      requiresReload: true
    })

    // SR5 p. 422 leaves the object to the GM. A table can let the thief choose it himself,
    // a ruling of DjamZ (2026-10-05): off by default, the book's way
    game.settings.register("sr5", "sr5PickpocketThiefChooses", {
      name: "SR5.SETTINGS_PickpocketThiefChooses_T",
      hint: "SR5.SETTINGS_PickpocketThiefChooses_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
    })

    // When someone dies, leave a bag on the body holding part of their gear.
    // No rule says so, so it stays off until a table asks for it.
    game.settings.register("sr5", "sr5StorageDropOnDeath", {
      name: "SR5.SETTINGS_StorageDropOnDeath_T",
      hint: "SR5.SETTINGS_StorageDropOnDeath_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
    })

    // SR5 p. 450: picking a lock takes a lockpick kit. On by default, as the book has it
    game.settings.register("sr5", "sr5LockpickRequiresKit", {
      name: "SR5.SETTINGS_LockpickRequiresKit_T",
      hint: "SR5.SETTINGS_LockpickRequiresKit_D",
      scope: "world",
      config: true,
      default: true,
      type: Boolean,
    })

    // SR5 p. 165 and p. 167: switching a device is a free action through a DNI, a simple one otherwise. Off by
    // default: the wireless switch stays free for everyone, the system not knowing who has a DNI
    game.settings.register("sr5", "sr5WifiRequiresDNI", {
      name: "SR5.SETTINGS_WifiRequiresDNI_T",
      hint: "SR5.SETTINGS_WifiRequiresDNI_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
    })

    // SR5 p. 164-165: one free action, and two simple or one complex, per initiative pass. Off by default: an action
    // the character no longer has still goes through, as before
    game.settings.register("sr5", "sr5BlockMissingActions", {
      name: "SR5.SETTINGS_BlockMissingActions_T",
      hint: "SR5.SETTINGS_BlockMissingActions_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
    })

    game.settings.register("sr5", "sr5StorageDropOnDeathShare", {
      name: "SR5.SETTINGS_StorageDropOnDeathShare_T",
      hint: "SR5.SETTINGS_StorageDropOnDeathShare_D",
      scope: "world",
      config: true,
      default: 50,
      type: Number,
    })

    // A garage is a lifestyle Asset with a minimum lifestyle (Run Faster
    // p. 216). Tables that do not track lifestyles can switch the check off.
    game.settings.register("sr5", "sr5StorageCheckGarageLifestyle", {
      name: "SR5.SETTINGS_StorageCheckGarageLifestyle_T",
      hint: "SR5.SETTINGS_StorageCheckGarageLifestyle_D",
      scope: "world",
      config: true,
      default: true,
      type: Boolean,
    })

    // Storage tab: icons in cells, or one detailed row per item. Each player
    // picks their own and it is remembered.
    game.settings.register("sr5", "sr5StorageViewMode", {
      name: "SR5.SETTINGS_StorageViewMode_T",
      hint: "SR5.SETTINGS_StorageViewMode_D",
      scope: "client",
      config: false,
      default: "grid",
      type: String,
    })

    // Compendium browser: add gear without charging it (character creation,
    // or fixing an entry a player already paid for).
    // DjamZ's ruling (2026-10-05): a world setting the gamemaster alone switches. It used to be a client
    // setting, which let a player take free gear; that old per-user value is dropped, not carried over.
    game.settings.register("sr5", "sr5ShopCreationMode", {
      name: "SR5.SETTINGS_ShopCreationMode_T",
      hint: "SR5.SETTINGS_ShopCreationMode_D",
      scope: "world",
      config: false,
      default: false,
      type: Boolean,
    })
    try {
      localStorage.removeItem("sr5.sr5ShopCreationMode")
    } catch (_err) { /* storage blocked: the world value applies anyway */ }

    // Faction Reputation (Cutting Aces p. 156-160): the gamemaster's registry and window
    SR5FactionRegistry.register()
    game.settings.registerMenu("sr5", "sr5FactionsMenu", {
      name: "SR5.FACTION_Title",
      label: "SR5.FACTION_Open",
      hint: "SR5.FACTION_MenuHint",
      icon: "fas fa-people-group",
      type: SR5FactionsApp,
      restricted: true,
    })

    // The Negotiation lost before the key fix: the gamemaster gives it back, once (negotiation-repair.js)
    SR5NegotiationRepair.register()
    game.settings.registerMenu("sr5", "sr5NegotiationRepairMenu", {
      name: "SR5.NEGO_REPAIR_Title",
      label: "SR5.NEGO_REPAIR_Open",
      hint: "SR5.NEGO_REPAIR_MenuHint",
      icon: "fas fa-handshake",
      type: SR5NegotiationRepair,
      restricted: true,
    })

    // Shop shelves and buyers, set from one gamemaster menu (SR5ShopConfig)
    game.settings.registerMenu("sr5", "sr5ShopConfigMenu", {
      name: "SR5.SETTINGS_ShopConfig_T",
      label: "SR5.SETTINGS_ShopConfig_L",
      hint: "SR5.SETTINGS_ShopConfig_D",
      icon: "fas fa-store",
      type: SR5ShopConfig,
      restricted: true,
    })

    // Compendiums left off the shelves: stored as exclusions, so a new compendium is sold by default
    game.settings.register("sr5", "sr5ShopExcludedPacks", {
      scope: "world", config: false, default: [], type: Array,
    })

    // Who may buy: player characters (as before), a folder, the actor's "Can shop" box, or folder or box
    game.settings.register("sr5", "sr5ShopBuyerMode", {
      scope: "world", config: false, default: "owned", type: String,
    })

    game.settings.register("sr5", "sr5ShopBuyerFolder", {
      scope: "world", config: false, default: "", type: String,
    })

    // Optional implant grades, off by default: not every table owns these supplements
    game.settings.register("sr5", "sr5ShopGradeGamma", {
      name: "SR5.SETTINGS_ShopGradeGamma_T",
      hint: "SR5.SETTINGS_ShopGradeGamma_D",
      scope: "world", config: true, default: false, type: Boolean,
    })

    game.settings.register("sr5", "sr5ShopGradeGreyware", {
      name: "SR5.SETTINGS_ShopGradeGreyware_T",
      hint: "SR5.SETTINGS_ShopGradeGreyware_D",
      scope: "world", config: true, default: false, type: Boolean,
    })

    // Gear limits at creation, SR5 p. 66 and p. 420: the book's level by default, the other two
    // levels of p. 66 as presets, or the table's own figures (DjamZ's ruling, 2026-10-05)
    game.settings.register("sr5", "sr5ShopCreationLevel", {
      name: "SR5.SETTINGS_ShopCreationLevel_T",
      hint: "SR5.SETTINGS_ShopCreationLevel_D",
      scope: "world", config: true, default: "standard", type: String,
      choices: {
        street: "SR5.SETTINGS_ShopCreationLevel_street",
        standard: "SR5.SETTINGS_ShopCreationLevel_standard",
        elite: "SR5.SETTINGS_ShopCreationLevel_elite",
        custom: "SR5.SETTINGS_ShopCreationLevel_custom",
      },
    })

    game.settings.register("sr5", "sr5ShopCreationMaxAvailability", {
      name: "SR5.SETTINGS_ShopCreationMaxAvailability_T",
      hint: "SR5.SETTINGS_ShopCreationMaxAvailability_D",
      scope: "world", config: true, default: 12, type: Number,
    })

    game.settings.register("sr5", "sr5ShopCreationMaxRating", {
      name: "SR5.SETTINGS_ShopCreationMaxRating_T",
      hint: "SR5.SETTINGS_ShopCreationMaxRating_D",
      scope: "world", config: true, default: 6, type: Number,
    })

    // What a bonus die costs on an availability test. SR5 p. 420 sells one
    // die per 25 % of the price, up to +12 (four times the price); both are
    // values a table may want to move.
    game.settings.register("sr5", "sr5ShopSurchargePerDie", {
      name: "SR5.SETTINGS_ShopSurchargePerDie_T",
      hint: "SR5.SETTINGS_ShopSurchargePerDie_D",
      scope: "world",
      config: true,
      default: 25,
      type: Number,
    })

    game.settings.register("sr5", "sr5ShopMaxSurchargeDice", {
      name: "SR5.SETTINGS_ShopMaxSurchargeDice_T",
      hint: "SR5.SETTINGS_ShopMaxSurchargeDice_D",
      scope: "world",
      config: true,
      default: 12,
      type: Number,
    })

    // Fencing gear, SR5 p. 421. Every figure of the rule is a setting: the
    // share a found buyer starts from, what a net hit of haggling moves, the
    // threshold to find a buyer at all, what a contact pays per point of
    // Loyalty, and the buyer's own pool — which the book never gives.
    game.settings.register("sr5", "sr5ShopFenceBasePercent", {
      name: "SR5.SETTINGS_ShopFenceBase_T",
      hint: "SR5.SETTINGS_ShopFenceBase_D",
      scope: "world", config: true, default: 25, type: Number,
    })

    game.settings.register("sr5", "sr5ShopFenceStepPercent", {
      name: "SR5.SETTINGS_ShopFenceStep_T",
      hint: "SR5.SETTINGS_ShopFenceStep_D",
      scope: "world", config: true, default: 5, type: Number,
    })

    game.settings.register("sr5", "sr5ShopFenceThreshold", {
      name: "SR5.SETTINGS_ShopFenceThreshold_T",
      hint: "SR5.SETTINGS_ShopFenceThreshold_D",
      scope: "world", config: true, default: 10, type: Number,
    })

    game.settings.register("sr5", "sr5ShopContactFencePercent", {
      name: "SR5.SETTINGS_ShopContactFence_T",
      hint: "SR5.SETTINGS_ShopContactFence_D",
      scope: "world", config: true, default: 5, type: Number,
    })

    game.settings.register("sr5", "sr5ShopFenceBuyerPool", {
      name: "SR5.SETTINGS_ShopFenceBuyerPool_T",
      hint: "SR5.SETTINGS_ShopFenceBuyerPool_D",
      scope: "world", config: true, default: 6, type: Number,
    })

    // The gamemaster's vendors (shop lot C). The world's shelves stay open to the
    // players unless the table wants every purchase to go through a vendor.
    game.settings.register("sr5", "sr5ShopMarketOpen", {
      name: "SR5.SETTINGS_ShopMarketOpen_T",
      hint: "SR5.SETTINGS_ShopMarketOpen_D",
      scope: "world", config: true, default: true, type: Boolean,
    })

    // An item on a vendor's counter has been found already: no availability test
    // (SR5 p. 420, the test is the search). A table may want it all the same.
    // Where the vendor banners are (lot C, part 2): never shipped with the system, the table
    // points at its own folder. Empty, vendors have the plain sign of part 1.
    game.settings.register("sr5", "sr5ShopBannerFolder", {
      name: "SR5.SETTINGS_ShopBannerFolder_T",
      hint: "SR5.SETTINGS_ShopBannerFolder_D",
      scope: "world", config: true, default: "", type: String,
      filePicker: "folder",
    })

    game.settings.register("sr5", "sr5ShopVendorTest", {
      name: "SR5.SETTINGS_ShopVendorTest_T",
      hint: "SR5.SETTINGS_ShopVendorTest_D",
      scope: "world", config: true, default: false, type: Boolean,
    })

    // Which contact types deal in goods, for the Bargaining specialization
    // on availability tests. Free text on the contact sheet, so this is a
    // keyword list the table can edit.
    game.settings.register("sr5", "sr5ShopDealerKeywords", {
      name: "SR5.SETTINGS_ShopDealerKeywords_T",
      hint: "SR5.SETTINGS_ShopDealerKeywords_D",
      scope: "world",
      config: true,
      default: "fixer, intermediaire, intermédiaire, receleur, recéleur, fourgue, marchand, armurier, talismonger, talismancien, dealer, trafiquant, contrebandier, smuggler, arms dealer",
      type: String,
    })

    // Display Help Window
    game.settings.register("sr5", "sr5Help.active", {
      name: "SR5.SETTINGS_HelpActive_T",
      hint: "SR5.SETTINGS_HelpActive_D",
      scope: "client",
      config: true,
      default: true,
      type: Boolean,
      requiresReload: true
    })

    // Matrix Grid Rules
    game.settings.register("sr5", "sr5MatrixGridRules", {
      name: "SR5.SETTINGS_MatrixGridRules_T",
      hint: "SR5.SETTINGS_MatrixGridRules_D",
      scope: "world",
      config: true,
      default: true,
      type: Boolean,
      requiresReload: true
    })

    // Cybereyes replace the eyes the character was born with
    game.settings.register('sr5', 'sr5CyberEyesReplaceNaturalVision', {
      name: 'SR5.SETTINGS_CyberEyesReplaceNaturalVision_T',
      hint: 'SR5.SETTINGS_CyberEyesReplaceNaturalVision_D',
      scope: 'world',
      config: true,
      default: true,
      type: Boolean,
      requiresReload: true
    })

    // Token vision ranges, in meters as the rules give them (0 = only what is lit). getVisionData turns them
    // into the units of the token's scene: written as is, 30 m of thermographic vision drew 30 ft on a map in feet.
    const visionRanges = {
      sr5VisionRangeLowLight: 0,
      sr5VisionRangeThermographic: 30,
      sr5VisionRangeUltrasound: 50,
      sr5VisionRangeAstral: 300,
    }
    for (const [key, range] of Object.entries(visionRanges)) {
      game.settings.register('sr5', key, {
        name: `SR5.SETTINGS_${key.slice(3)}_T`,
        hint: `SR5.SETTINGS_${key.slice(3)}_D`,
        scope: 'world',
        config: true,
        default: range,
        type: Number,
      })
    }

    // Green tint of low-light vision : a visual convention, not a rule (SR5 p. 447 : it lets
    // one see normally), hence off by default. Read when the vision modes are built, at init.
    game.settings.register('sr5', 'sr5LowLightGreenTint', {
      name: 'SR5.SETTINGS_LowLightGreenTint_T',
      hint: 'SR5.SETTINGS_LowLightGreenTint_D',
      scope: 'world',
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // Run & Gun Rules
    game.settings.register("sr5", "sr5CalledShotsRules", {
      name: "SR5.SETTINGS_CalledShotsRules_T",
      hint: "SR5.SETTINGS_CalledShotsRules_D",
      scope: "world",
      config: true,
      default: true,
      type: Boolean,
      requiresReload: true
    })

    // Reagents: the core rules by default, Shadow Spells or Forbidden Arcana at the GM's choice
    // (modules/system/reagents.js). DjamZ's ruling, 2026-10-05
    game.settings.register("sr5", "sr5ReagentSystem", {
      name: "SR5.SETTINGS_ReagentSystem_T",
      hint: "SR5.SETTINGS_ReagentSystem_D",
      scope: "world",
      config: true,
      default: "core",
      type: String,
      choices: {
        "core": "SR5.SETTINGS.ReagentSystemCore",
        "shadowSpells": "SR5.SETTINGS.ReagentSystemShadowSpells",
        "forbiddenArcana": "SR5.SETTINGS.ReagentSystemForbiddenArcana",
      },
      requiresReload: true
    })

    // Grappling (SR5 p. 195-196, Run & Gun p. 126 and 133-138): token statuses, automatic thresholds and holds.
    // Off by default, and off nothing changes. It adds token statuses, hence the reload.
    game.settings.register("sr5", "sr5GrapplingRules", {
      name: "SR5.SETTINGS_GrapplingRules_T",
      hint: "SR5.SETTINGS_GrapplingRules_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // Running (SR5 p. 163-164): the running status is put on by the "Course" or "Sprint" movement action of the token.
    // Checked, it is also put on when a token in combat has gone farther than its walking rate this Combat Turn.
    // Off by default (ruling of DjamZ, 2026-10-04): a token moved by hand to tidy the map would count as running
    game.settings.register("sr5", "sr5RunningFromDistance", {
      name: "SR5.SETTINGS_RunningFromDistance_T",
      hint: "SR5.SETTINGS_RunningFromDistance_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean
    })

    // Kill Code Rules
    game.settings.register("sr5", "sr5KillCodeRules", {
      name: "SR5.SETTINGS_KillCodeRules_T",
      hint: "SR5.SETTINGS_KillCodeRules_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // Bullets & Bandages: healing under fire and advanced medkits (BB p. 14-19), off by default
    registerBBHealingSettings()

    // Flight skill on player characters (in the Athletics skill group)
    game.settings.register("sr5", "sr5FlightSkill", {
      name: "SR5.SETTINGS_FlightSkill_T",
      hint: "SR5.SETTINGS_FlightSkill_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // Rigger 5 Rules
    game.settings.register("sr5", "sr5Rigger5Actions", {
      name: "SR5.SETTINGS_Rigger5Actions_T",
      hint: "SR5.SETTINGS_Rigger5Actions_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // Hide the die and its face on a random table's chat card
    game.settings.register("sr5", "sr5HideTableRoll", {
      name: "SR5.SETTINGS_HideTableRoll_T",
      hint: "SR5.SETTINGS_HideTableRoll_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // SR5 p. 188: in melee, when both fighters suffer the same environmental modifier, the GM may ignore it.
    // Read at roll time, so no reload is needed.
    game.settings.register("sr5", "sr5MeleeEnvironmentBalanced", {
      name: "SR5.SETTINGS_MeleeEnvironmentBalanced_T",
      hint: "SR5.SETTINGS_MeleeEnvironmentBalanced_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
    })

    // Data Trails p. 157: an AI outside any device defends with its Willpower or Intuition alone. The book does not
    // say which one stands in for Logic: the higher one by default. The same one resists matrix damage, which the book
    // leaves unrated (Data Trails p. 157 and 161). Read while the actors are prepared, hence the reload.
    game.settings.register("sr5", "sr5DevicelessAILogicDefense", {
      name: "SR5.SETTINGS_DevicelessAILogicDefense_T",
      hint: "SR5.SETTINGS_DevicelessAILogicDefense_D",
      scope: "world",
      config: true,
      default: "highest",
      type: String,
      choices: {
        "highest": "SR5.SETTINGS_DevicelessAILogicDefense_Highest",
        "intuition": "SR5.SETTINGS_DevicelessAILogicDefense_Intuition",
        "willpower": "SR5.SETTINGS_DevicelessAILogicDefense_Willpower",
      },
      requiresReload: true
    })

    // SR5 p. 403: critters and spirits resist the Drain of an innate spell with Intuition or Charisma, at the GM's
    // discretion; added to Willpower as a tradition attribute is (Shadow Spells p. 19), a reading: the book does not
    // name Willpower. Spirit sheets only. Charisma by default (DjamZ's ruling, 2026-10-06). Read while the actors are prepared
    game.settings.register("sr5", "sr5SpiritDrainAttribute", {
      name: "SR5.SETTINGS_SpiritDrainAttribute_T",
      hint: "SR5.SETTINGS_SpiritDrainAttribute_D",
      scope: "world",
      config: true,
      default: "charisma",
      type: String,
      choices: {
        "charisma": "SR5.Charisma",
        "intuition": "SR5.Intuition",
      },
      requiresReload: true
    })

    // SR5 p. 301 gives a homunculus the Structure of its material as Body, and no Armor: off by default.
    // On, it also gets the Armor of that material (SR5 p. 198). Read while the actors are prepared, hence the reload.
    game.settings.register("sr5", "sr5HomunculusMaterialArmor", {
      name: "SR5.SETTINGS_HomunculusMaterialArmor_T",
      hint: "SR5.SETTINGS_HomunculusMaterialArmor_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      requiresReload: true
    })

    // Cap of the mental and physical attributes. Book (SR5 p. 96): +4 at most from augmentations.
    // Arbitrage de DjamZ: a table may cap only at the augmented maximum (metatype maximum + 4, SR5 p. 68,
    // 290, 312), or not at all. Read while the actors are prepared, hence the reload.
    game.settings.register("sr5", "sr5AugmentationCap", {
      name: "SR5.SETTINGS_AugmentationCap_T",
      hint: "SR5.SETTINGS_AugmentationCap_D",
      scope: "world",
      config: true,
      default: "bonus",
      type: String,
      choices: {
        bonus: "SR5.SETTINGS_AugmentationCap_bonus",
        augmentedMax: "SR5.SETTINGS_AugmentationCap_augmentedMax",
        none: "SR5.SETTINGS_AugmentationCap_none",
      },
      requiresReload: true
    })

    // House rule, off by default (book: SR5 p. 167 and 169): reloading spends no action
    // when the right rounds are in the inventory. Read at the click, no reload needed.
    game.settings.register("sr5", "sr5FreeReload", {
      name: "SR5.SETTINGS_FreeReload_T",
      hint: "SR5.SETTINGS_FreeReload_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean
    })

    // Optional rule (Forbidden Arcana p. 176), off as in the core book: Mask of the mentor
    game.settings.register("sr5", "mentorMask", {
      name: "SR5.SETTINGS_MentorMask_T",
      hint: "SR5.SETTINGS_MentorMask_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean
    })

    // Optional rule (Forbidden Arcana p. 176), off as the book offers it: Spirit Domination, the leash
    game.settings.register("sr5", "spiritLeash", {
      name: "SR5.SETTINGS_SpiritLeash_T",
      hint: "SR5.SETTINGS_SpiritLeash_D",
      scope: "world",
      config: true,
      default: false,
      type: Boolean
    })

    // Indexes, reputation adjustment, spirit traits and banishing totals, written by the active GM alone
    registerSpiritLedger()
  }

  /* Display Shadowrun Themed Log Entries Based on Logging Level
	// Usage: srLog(LEVEL, message, optional data... );
	// LEVEL can be one the following values:
	//      0 for ERRORS logging only
	//      1 for WARNING and ERRORS
	//      2 for INFO, WARNING and ERRORS
	//      3 for DEBUG (all messages)
	*/
  static srLog() {
    if (game.settings.get("sr5", "sr5Log.active")) {
      let userLogLevel = game.settings.get("sr5", "sr5Log.level")
      let msgLogLevel = 0
      let msgLabel = ""
      let tagLabel = ""
      const headerStyle = "color: #fff; background-color: rgba(157, 6, 104, 1); padding: 0 5px; border-radius: 2px;"
      let tagStyle = "color: #fff; padding: 0 5px; border-radius: 2px;"
      let levelColor = ""

      if (!arguments.length) SR5_SystemHelpers.srLog(0, `Logging function 'srLog()' called without any parameters`)
      else {
        if (!arguments[0].toString().match(/^[0-3]$/)) SR5_SystemHelpers.srLog(0, `Logging function 'srLog()' called without a log level`)
        else {
          msgLogLevel = arguments[0]
          delete arguments[0]
          if (!arguments[1]) SR5_SystemHelpers.srLog(0, `Logging function 'srLog()' called with an empty message`)
          else {
            if (msgLogLevel <= userLogLevel) {
              switch (msgLogLevel) {
                case 0:
                  levelColor = "rgba(250, 0, 0, 0.8)"
                  tagLabel = "ERROR"
                  break
                case 1:
                  levelColor = "rgba(250, 120, 0, 0.8)"
                  tagLabel = "WARNING"
                  break
                case 2:
                  levelColor = "rgba(0, 180, 0, 0.8)"
                  tagLabel = "INFORMATION"
                  break
                case 3:
                  levelColor = "rgba(0, 0, 180, 0.6)"
                  tagLabel = "DEBUG"
                  break
                default:
                  SR5_SystemHelpers.srLog(0, `Logging function 'srLog()' called with an unknown '${msgLogLevel}' log level`)
              }
              tagStyle += `background-color: ${levelColor};`

              // Use appropriate console level: error/warn for 0/1, log for 2/3
              // console.error/warn natively provide stack traces, no need to inject manually
              const consoleFn = msgLogLevel === 0 ? 'error' : msgLogLevel === 1 ? 'warn' : msgLogLevel === 3 ? 'debug' : 'log'

              msgLabel = `%cShadowrun 5%c %c${tagLabel}%c ${arguments[1]}`
              let msgDetails = Array.from(arguments).slice(2).map(v => JSON.parse(JSON.stringify(v)))

              console[consoleFn](`${msgLabel}`, headerStyle, "", tagStyle, "", ...msgDetails)
            }
          }
        }
      }
    }
  }

  static srLogPublic(message) {
    console.log(
      `%cShadowrun 5%c %cBROADCAST%c ${message}`,
      "color: #fff; background-color: rgba(157, 6, 104, 1); padding: 0 5px; border-radius: 2px;",
      "",
      "color: #fff; background-color: rgba(157, 6, 104, 0.7); padding: 0 5px; border-radius: 2px;",
      "font-weight: bold;",
    )
  }

  /**
	 * Return the distance between two documents on the canvas
	 * @param firstDocument     The first document
	 * @param secondDocument    The second document
	 * @param scene             The scene both stand on, when it may not be the one on the canvas
	 * @return {distance}       The distance between first and second document based on grid scene round to the nearest integrer.
	 */
  static getDistanceBetweenTwoPoint(firstDocument, secondDocument, scene){
    const grid = scene ? scene.grid : canvas.grid
    const distance = grid.measurePath([firstDocument, secondDocument])
    return distance.distance
  }

  /**
   * How many meters one unit of the current scene's distance measurement is worth.
   *
   * SR5 states every range, radius and reach in meters: the weapon range table is headed "RANGE IN METERS"
   * (SR5 p. 186), a blast loses damage per meter (p. 184) and an area spell covers a radius in meters equal
   * to its Force (p. 283). A scene's unit, on the other hand, is a display setting the GM picks, and Foundry
   * ships "ft" as its default. So the scene is read and converted, never constrained.
   *
   * grid.units is free text, so only the feet spellings are recognised. Anything else -- yards, kilometers,
   * a label the GM typed -- is assumed to be meters and left alone, because guessing at an unknown unit
   * would trade a known wrong answer for an unpredictable one.
   *
   * @param scene      The scene to read, the one on the canvas by default
   * @return {number}   Meters per scene unit (1 when the scene already measures in meters)
   */
  static getSceneUnitInMeters(scene = globalThis.canvas?.scene){
    const units = scene?.grid?.units
    if (typeof units !== "string") return 1
    const normalized = units.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "")
    if (["ft", "feet", "foot", "'", "pi", "pied", "pieds"].includes(normalized)) return 0.3048
    if (normalized !== "" && !["m", "meter", "meters", "metre", "metres"].includes(normalized)) {
      // Leaving an unknown unit alone is the safe choice, but doing it in complete silence would make the
      // day someone plays in yards indistinguishable from a working scene. One line per unseen unit.
      if (game?.settings && !SR5_SystemHelpers._unknownSceneUnits.has(normalized)) {
        SR5_SystemHelpers._unknownSceneUnits.add(normalized)
        SR5_SystemHelpers.srLog(1, `Scene unit "${units}" is not recognised: distances are taken as meters and left unconverted.`)
      }
    }
    return 1
  }

  /**
   * Convert a distance measured on the canvas into the meters the rules are written in
   * @param value     A distance in the scene's own units
   * @param scene     The scene it was measured on, the one on the canvas by default
   * @return {number} The same distance in meters
   */
  static convertSceneUnitsToMeters(value, scene = canvas?.scene){
    return value * SR5_SystemHelpers.getSceneUnitInMeters(scene)
  }

  /**
   * Convert a distance taken from the books into the units the scene draws with
   * @param value     A distance in meters
   * @param scene     The scene it is drawn on, the one on the canvas by default
   * @return {number} The same distance in the scene's own units
   */
  static convertMetersToSceneUnits(value, scene = canvas?.scene){
    return value / SR5_SystemHelpers.getSceneUnitInMeters(scene)
  }

  /**
	 * Return the distance between two documents on the canvas, in meters
	 * @param firstDocument     The first document
	 * @param secondDocument    The second document
	 * @param scene             The scene both stand on, when it may not be the one on the canvas
	 * @return {distance}       The distance between first and second document, in meters, whatever unit the
	 *                          scene measures in. Use this one, not getDistanceBetweenTwoPoint, whenever the
	 *                          result is compared to a value taken from the rules.
	 */
  static getDistanceInMetersBetweenTwoPoint(firstDocument, secondDocument, scene){
    return SR5_SystemHelpers.convertSceneUnitsToMeters(SR5_SystemHelpers.getDistanceBetweenTwoPoint(firstDocument, secondDocument, scene), scene ?? canvas?.scene)
  }

  /**
   * Tell whether a target stands within melee range: the adjacent square, plus one square per point of Reach
   * (SR5 p. 187 gives Reach as a number, the book gives no distance, so the square is the convention).
   *
   * Counted in grid spaces, not in distance, and between the spaces each token covers, not from a corner.
   * - A distance depends on the scene's diagonal rule: under the "exact" rule the adjacent diagonal square is
   *   1.41 squares away, under "rectilinear" it is 2. On a square grid the number of squares between two
   *   cells is the larger of the row and column gaps, whatever the rule.
   * - On a hexagonal grid the cube distance counts hexes exactly. A measured distance between token corners
   *   comes out a hair above one hex for two of the six neighbours, because token positions are rounded to
   *   whole pixels; counting cells needs no tolerance to explain.
   * - A token larger than one space (vehicle, drone, big critter) is in contact through any of its spaces:
   *   the shortest gap between the two footprints counts.
   * @param grid           The scene's grid (canvas.grid)
   * @param attackerCells  The grid offsets the attacker covers (TokenDocument#getOccupiedGridSpaceOffsets)
   * @param targetCells    The grid offsets the target covers
   * @param reach          The weapon's Reach
   * @return {boolean|null}  null on a gridless scene, where there is no space to count
   */
  static isInMeleeRange(grid, attackerCells, targetCells, reach){
    if (!attackerCells?.length || !targetCells?.length) return null
    const gap = grid.isSquare ?
      (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) :
      (a, b) => grid.constructor.cubeDistance(grid.offsetToCube(a), grid.offsetToCube(b))
    let shortest = Infinity
    for (const a of attackerCells) for (const b of targetCells) shortest = Math.min(shortest, gap(a, b))
    return shortest <= reach + 1
  }

  /**
	 * The template an item left on the active scene for a given shot. An item can leave several (a grenade thrown
	 * twice without removing the first circle). When the chat card recorded its template, that one or nothing: if
	 * it was removed since, falling back would silently move or delete an older circle of the same item, so the
	 * caller warns instead. Without a recorded id (a card from before the id was kept, or a roll being prepared
	 * right after its placement), the most recently created one. A MeasuredTemplate carries no _stats in Foundry
	 * 13.351 (checked in game), so "most recent" is the last one in the scene's collection, which keeps creation order.
	 * @param itemKey       The item's id, or its uuid when `flag` is "itemUuid"
	 * @param templateId    The template recorded on the shot's chat card, if any
	 * @param flag          Which flags.sr5 field holds the item: "item" (its id) or "itemUuid"
	 * @return {MeasuredTemplateDocument|undefined}
	 */
  static findItemTemplate(itemKey, templateId, flag = "item"){
    let templates = canvas.scene?.templates
    if (!templates) return undefined
    if (templateId){
      let own = templates.get(templateId)
      return own?.flags.sr5?.[flag] === itemKey ? own : undefined
    }
    let latest
    for (let t of templates){
      if (t.flags.sr5?.[flag] === itemKey) latest = t
    }
    return latest
  }

  /**
	 * Get the position of a template based on the id of the item which has created it
	 * @param itemId                     The item's id which has created the template
	 * @param templateId                 The shot's own template, if known (see findItemTemplate)
	 * @return {templatePosition || 0}   The coordinates of the template on the grid scene
	 */
  static async getTemplateItemPosition(itemId, templateId){
    let gridUnit = canvas.scene.grid.size
    let templatePosition = 0
    let templateItem = SR5_SystemHelpers.findItemTemplate(itemId, templateId)
    if (templateItem) {
      //token position is based on top left grid.
      //player will probably launch grenade on the token, so we need to tweak the position of the grenade template
      templatePosition = {
        x: templateItem.x - (gridUnit/2), y: templateItem.y - (gridUnit/2)
      }
    }
    return templatePosition
  }
}

export class SR5_UiModifications {

  static init() {
    SR5_SystemHelpers.srLog(2, `Initializing Shadowrun 5 User Interface Modifications`)
  }

  static ready() {
  }

  static async addHelpWindow() {
    let template = "systems/sr5/templates/interface/help.hbs"
    const html = await foundry.applications.handlebars.renderTemplate(template)

    if (game.settings.get("sr5", "sr5Help.active")) {
      let target = document.querySelector("#sr5help")
      if (!target)
        document.getElementById('pause').insertAdjacentHTML("afterend", html)
    }
  }

}