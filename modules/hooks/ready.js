import SR5TokenHud from "../interface/tokenHud.js"
import {
  runSourceModifiersMigration
} from "../migration-source-modifiers.js"
import {
  runLegacyBiographyMigration
} from "../migration-legacy-biography.js"
import {
  runRuleLocksMigration
} from "../system/rule-locks.js"
import {
  initBBHealing
} from "../system/bb-healing.js"
import {
  SR5_CompendiumUtility
} from "../entities/actors/utilityCompendium.js"
import {
  initLinkMatchesTooltip 
} from "../interface/link-matches-tooltip.js"
import {
  SR5_SpiritTypes
} from "../entities/items/spirit-types.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  sr5DeepenModuleTableOfContents 
} from "../interface/journal-heading-levels.js"
import {
  initCalendarClock
} from "../interface/calendar-clock.js"
import {
  initEffectExpiry
} from "../system/effect-expiry.js"
import {
  initDeadlines
} from "../system/deadlines.js"
import {
  initDrugClock
} from "../system/drug-clock.js"
import {
  initPreparationPotency
} from "../system/preparation-potency.js"
import {
  initDiseases
} from "../system/diseases.js"
import {
  initHunger
} from "../system/hunger.js"
import {
  initInfection
} from "../system/infection.js"
import {
  initCfdTreatment
} from "../system/cfd-treatment.js"
import {
  initAIDissipation
} from "../system/ai-dissipation.js"
import {
  initMonadMatrix
} from "../system/monad-matrix.js"
import {
  initRadiation
} from "../system/radiation.js"
import {
  initIllusions
} from "../system/illusion.js"
import {
  initTacnet
} from "../system/tacnet.js"
import {
  initLivingPersona
} from "../entities/actors/living-persona-hooks.js"

export function sr5HookReady() {
  // Register the GM-authored spirit types, so that they are offered wherever
  // the official ones are, then keep the list in step with the world.
  SR5_SpiritTypes.reload().catch(e => SR5_SystemHelpers.srLog(1, `Spirit types could not be registered: ${e}`))
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, (item) => {
      if (item.type !== "itemSpiritType") return
      SR5_SpiritTypes.reload().catch(e => SR5_SystemHelpers.srLog(1, `Spirit types could not be registered: ${e}`))
    })
  }
  // Deleting or adding a whole compendium fires no item hook, and would
  // otherwise leave a type in the list with nothing behind it.
  for (const hook of ["createCompendium", "deleteCompendium"]) {
    Hooks.on(hook, () => {
      SR5_SpiritTypes.reload().catch(e => SR5_SystemHelpers.srLog(1, `Spirit types could not be registered: ${e}`))
    })
  }

  // Apply UI theme based on setting
  const chosenStyle = game.settings.get("sr5", "sr5ChooseStyle") ?? "SR5"
  const themeClass = chosenStyle === "SR6" ? "sr-theme-sr6" : "sr-theme-sr5"
  document.body.classList.add(themeClass)

  // Compendium choices for the base items settings
  SR5_CompendiumUtility.refreshCompendiumChoices()
  // The active GM reads the reference compendiums' index in the background (not awaited)
  SR5_CompendiumUtility.preloadIndexes()

  // Translate the headers of the core "link matches" tooltip
  initLinkMatchesTooltip()

  // The Sixth World clock: date and time for all, advance and "go to" for the GM
  initCalendarClock()
  // Effects in minutes, hours, days, weeks, months: counted on the clock, the GM removes them
  initEffectExpiry()
  // Dated deadlines: withdrawal tests (SR5 p. 79-80), months of rent paid (SR5 p. 377)
  initDeadlines()
  // Drugs: end of the effect and of the crash on the clock (SR5 p. 411-412, Chrome Flesh p. 194)
  initDrugClock()
  // Alchemical preparations: loss of Potency on the clock (SR5 p. 309)
  initPreparationPotency()
  // Diseases: incubation and resistance tests on the clock (Run Faster p. 111-112)
  initDiseases()
  initHunger()
  initInfection()
  // Treating CFD: NanoScrub hours on the clock, Overwriters at the end of each Combat Turn (Dark Terrors p. 87)
  initCfdTreatment()
  // Dissipation of an AI (Data Trails p. 161): offered to the active GM
  initAIDissipation()
  // A Monad of the original strain whose Core or swarm fills (Dark Terrors p. 88): offered to the active GM
  initMonadMatrix()
  // Radiation zones: resistance tests on the clock (Run & Gun p. 164-165)
  initRadiation()
  // Bullets & Bandages p. 14-16: wounds of 5+ bleed by Combat Turn, the GM adds each box
  initBBHealing()
  // Invisibility and Mask: the active GM keeps the thresholds and who has seen through (SR5 p. 294)
  initIllusions()
  // RP-Tac: a lowered Device Rating trims the roster (Run & Gun p. 119)
  initTacnet()
  // Every technomancer has her living persona, kept by the system (SR5 p. 236, 253): the active GM gives it
  initLivingPersona()

  // The deeper table of contents also reaches the window of Monk's Enhanced Journal
  sr5DeepenModuleTableOfContents()

  //Token hud, for every user: a player owns tokens too (his drone shares its vision, SR5 p. 241).
  //Each button of it checks the right of the user itself. No canvas (a window with no size), no HUD.
  if (canvas?.hud) canvas.hud.token = new SR5TokenHud()

  //game.settings.set("sr5", "systemMigrationVersion", "0.0.1");
  // Determine whether a system migration is required and feasible
  if ( !game.user.isGM ) return
  const {
    version: currentVersion, newWorld
  } = sr5WorldMigrationState()
  const NEEDS_MIGRATION_VERSION = "13.0.0-alpha.22"
  const needsMigration = !newWorld && (!currentVersion || foundry.utils.isNewerVersion(NEEDS_MIGRATION_VERSION, currentVersion)) //isNewerVersion(v0, v1)

  // Perform the migration, then the migrations tied to a feature rather than to a version number;
  // a new world has nothing to migrate, it is recorded at the version of the system
  if (newWorld) game.settings.set("sr5", "systemMigrationVersion", game.system.version)
  sr5RunMigrations(needsMigration)

  // Computed modifiers written in the source by a prepared copy: emptied once per world
  runSourceModifiersMigration().catch(err => console.error("SR5 | source modifiers migration failed", err))

  // The v12 biography keys the database still holds: unset once per world
  runLegacyBiographyMigration().catch(err => console.error("SR5 | legacy biography migration failed", err))

  // The three settings that were rule locks, copied into the boxes of the rule locks menu once per world (B13);
  // a world no migration ever ran in is new, and starts with the book
  runRuleLocksMigration({
    newWorld
  }).catch(err => console.error("SR5 | rule locks migration failed", err))

  // The spent cards whose card left the chat log: the registry is written whole at every card spent
  import("../rolls/roll-helpers/miscellaneous.js")
    .then(({
      SR5_MiscellaneousHelpers
    }) => SR5_MiscellaneousHelpers.purgeConsumed())
    .catch(err => console.error("SR5 | spent cards purge failed", err))
}

/**
 * The system migration recorded in this world, and whether the world is new. Foundry V13 returns the default of
 * systemMigrationVersion cast to its type ("0", truthy), so the stored setting is read instead: a new world never
 * wrote it and holds no actor nor item. A world with actors or items but no record (made before the migrations)
 * still migrates. Scenes and journals are not counted: Foundry's welcome scene appears at the first launch.
 * @returns {{version: string|null, newWorld: boolean}}
 */
export function sr5WorldMigrationState() {
  const stored = game.settings.storage?.get("world")?.getSetting?.("sr5.systemMigrationVersion")
  const value = stored ? game.settings.get("sr5", "systemMigrationVersion") : null
  const version = value && value !== "0" ? String(value) : null
  const empty = ["actors", "items"].every(key => !game[key]?.size)
  return {
    version, newWorld: !stored && empty
  }
}

/**
 * The version migration runs first; a feature migration then runs once per world, flagged by its own setting,
 * so that a world already migrated past the version threshold still gets it.
 * @param {boolean} needsMigration   Whether the world is below the version migration threshold
 */
export async function sr5RunMigrations(needsMigration) {
  const migration = new game.sr5.migration()
  if (needsMigration) await migration.migrateWorld()
  await migration.migrateHeadcaseNanite()
  await migration.migrateFlashlightEffect()
}
