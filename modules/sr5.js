// Import hook handlers
import {
  SR5_GrappleHelpers
} from './rolls/roll-helpers/grapple.js'
import {
  SR5Conceal
} from './interface/conceal.js'
import {
  onRenderSacrificeCard
} from './system/blood-magic.js'
import {
  sr5HookInit 
} from './hooks/init.js'
import {
  sr5HookReady 
} from './hooks/ready.js'
import {
  sr5HookHotbarDrop 
} from './hooks/hotbar-drop.js'
import {
  sr5HookRenderChatMessageHTML, sr5HookRenderChatLog 
} from './hooks/render-chat-message.js'
import {
  sr5HookRenderPlayers,
  sr5HookRenderFolderConfig,
  sr5HookRenderDialog,
  sr5HookRenderDialogV2,
  sr5HookRenderSettingsConfig,
  sr5HookRenderControlsConfig,
  sr5HookRenderDocumentOwnershipConfig,
  sr5HookRenderDocumentSheetConfig,
  sr5HookRenderWorldConfig,
  sr5HookRenderCombatTrackerConfig,
  sr5HookRenderMacroConfig,
} from './hooks/render-ui.js'
import {
  sr5HookMarkForeignWindow
} from './hooks/window-scope.js'
import {
  sr5HookCreateToken, sr5HookUpdateToken, sr5HookPreDeleteToken, sr5HookDeleteToken 
} from './hooks/token.js'
import {
  onMoveToken, clearRunning
} from './system/running.js'
import {
  registerAgilityZeroHooks
} from './system/agility-zero.js'
import {
  registerIceHostHooks
} from './system/ice-host.js'
import {
  registerInsectRaceHooks
} from './entities/actors/insect-race-hooks.js'
import {
  registerCyberlimbNotice
} from './system/cyberlimb-notice.js'
import {
  registerRiggerEjectionHooks
} from './system/rigger-ejection.js'
import {
  registerChaseHooks
} from './system/chase.js'
import {
  registerFactionsControl
} from './interface/factions-app.js'
import {
  registerConControls
} from './interface/con-app.js'
import {
  registerSwarmHooks
} from './system/swarm.js'
import {
  onBlightCreated, sweepBlight
} from './system/blight-strikes.js'
import {
  onSprintCard
} from './system/sprint-fatigue.js'
import {
  sr5HookCanvasInit,
  sr5HookDeleteCombatCumulativeDefense,
  sr5HookCreateCombatant,
  sr5HookUpdateCombatant,
  sr5HookDeleteCombatActions,
  sr5HookDeleteCombatGrapple,
  sr5HookCloseCombatantConfig,
} from './hooks/combat.js'
import {
  sr5HookCreateActor, sr5HookPreUpdateActor, sr5HookUpdateActor, sr5HookDeleteActor, sr5HookPreUpdateActorDeltaCreation
} from './hooks/actor.js'
import {
  onCreationHeaderControls, stripCreationOnCreate
} from './system/creation-actor.js'
import {
  sr5HookPreUpdateItem, sr5HookCreateItem, sr5HookUpdateItem, sr5HookDeleteItem
} from './hooks/item.js'
import {
  sr5HookDeleteActiveEffect, sr5HookCreateActiveEffect 
} from './hooks/active-effect.js'
import {
  sr5HookCanvasReady, sr5HookCanvasReadyAreaEffects, sr5HookCanvasReadyVisionRanges, sr5HookDrawMeasuredTemplate, sr5HookDeleteMeasuredTemplate, sr5HookUpdateMeasuredTemplate, sr5HookCreateMeasuredTemplate, sr5HookUpdateScene 
} from './hooks/canvas.js'
import {
  sr5HookRenderCompendium, sr5HookRenderCompendiumDirectory, sr5HookCompendiumDocumentChanged
} from './hooks/compendium.js'
import {
  renderSceneIndicators, sr5HookUpdateSceneIndicators
} from './interface/scene-indicators.js'
import {
  sr5HookExpireManaShifts
} from './system/mana-shift.js'
import {
  sr5PlaceChatJumpToBottom 
} from './interface/chat-jump-to-bottom.js'
import {
  sr5AddTableFormulaField, sr5AddResultQuantityField
} from './interface/table-config.js'
import {
  sr5HookRenderTablePayout
} from './interface/table-payout.js'
import {
  sr5HookRenderTableActions
} from './interface/table-actions.js'
import {
  sr5HookCompendiumDrawContext, sr5HookCompendiumDrawHeader, sr5HookCompendiumDrawFolder
} from './interface/table-from-compendium.js'
import {
  sr5KeepSidebarSettingsLast
} from './interface/sidebar-tab-order.js'
import {
  SR5StorageLock
} from './interface/storage-lock-actions.js'
import {
  SR5SharedVision, sr5HookUpdateTokenSharedVision, sr5HookUpdateActorSharedVision, sr5HookUpdateItemSharedVision,
  sr5HookResetJumpedInRiggers
} from './interface/shared-vision.js'
import {
  recordDefense
} from './system/defense-once.js'
import {
  onUserConnected
} from './system/relay-watch.js'
import {
  SR5ShopStock
} from './interface/shop-stock.js'
import {
  SR5ShopWindow
} from './interface/shop-window.js'
import {
  SR5DealershipWindow
} from './interface/dealership-window.js'
import {
  SR5ShopVendor
} from './interface/shop-vendor.js'
import {
  seedOverwatch, sr5HookOverwatchDrop, sr5HookPreUpdateTokenOverwatch, sr5HookPreUpdateActorDeltaOverwatch,
  sr5HookUpdateTokenOverwatch
} from './system/overwatch-guard.js'
import {
  registerEssenceHoleHooks
} from './system/essence-hole.js'
import {
  registerImplantRegisterHooks
} from './system/implant-register.js'
import {
  registerPreparationRegisterHooks
} from './system/preparation-register.js'
import {
  registerBoneAugmentationGuard
} from './system/bone-augmentation-guard.js'
import {
  registerPanCrownHooks
} from './canvas/pan-crown/pan-crown-layer.js'
import {
  registerCommcodeHooks
} from './interface/commcode-traffic.js'
import {
  onDroneSlavedChange
} from './system/slave-sync.js'

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

// Register all hooks
Hooks.once('init', sr5HookInit)
Hooks.once('ready', sr5HookReady)
// The GMs remember the Overwatch Scores, to be told of a lowering a player writes
Hooks.once('ready', seedOverwatch)
Hooks.on('updateActor', sr5HookOverwatchDrop)
Hooks.on('updateToken', sr5HookUpdateTokenOverwatch)
// A player lowers the score of an unlinked token through the token or its delta too, not only through the actor
Hooks.on('preUpdateToken', sr5HookPreUpdateTokenOverwatch)
Hooks.on('preUpdateActorDelta', sr5HookPreUpdateActorDeltaOverwatch)
Hooks.once('canvasReady', sr5HookCanvasReady)
Hooks.once('renderChatLog', sr5HookRenderChatLog)
Hooks.on('renderChatLog', sr5PlaceChatJumpToBottom)
Hooks.on('renderChatInput', sr5PlaceChatJumpToBottom)

Hooks.on('hotbarDrop', sr5HookHotbarDrop)
Hooks.on('renderPlayers', sr5HookRenderPlayers)
Hooks.on('renderChatMessageHTML', sr5HookRenderChatMessageHTML)
Hooks.on('renderFolderConfig', sr5HookRenderFolderConfig)
Hooks.on('renderApplicationV2', sr5HookMarkForeignWindow)
Hooks.on('renderApplication', sr5HookMarkForeignWindow)
Hooks.on('renderDialog', sr5HookRenderDialog)
Hooks.on('renderDialogV2', sr5HookRenderDialogV2)
Hooks.on('renderSettingsConfig', sr5HookRenderSettingsConfig)
Hooks.on('renderControlsConfig', sr5HookRenderControlsConfig)
Hooks.on('renderDocumentOwnershipConfig', sr5HookRenderDocumentOwnershipConfig)
Hooks.on('renderDocumentSheetConfig', sr5HookRenderDocumentSheetConfig)
Hooks.on('renderWorldConfig', sr5HookRenderWorldConfig)
Hooks.on('renderCombatTrackerConfig', sr5HookRenderCombatTrackerConfig)
Hooks.on('renderMacroConfig', sr5HookRenderMacroConfig)
Hooks.on('canvasInit', sr5HookCanvasInit)
Hooks.on('createToken', sr5HookCreateToken)
Hooks.on('updateToken', sr5HookUpdateToken)
Hooks.on('preDeleteToken', sr5HookPreDeleteToken)
Hooks.on('deleteToken', sr5HookDeleteToken)
//Slaving (lot R5): the box "Appareil asservi" of a deployed drone puts its vehicle in the rigger's PAN list, or takes it out
Hooks.on('updateActor', (...args) => onDroneSlavedChange(...args).catch(e => console.error(e)))
Hooks.on('createCombatant', sr5HookCreateCombatant)
Hooks.on('updateCombatant', sr5HookUpdateCombatant)
Hooks.on('deleteCombat', sr5HookDeleteCombatCumulativeDefense)
Hooks.on('deleteCombat', sr5HookDeleteCombatActions)
Hooks.on('deleteCombat', sr5HookDeleteCombatGrapple)
//Running (SR5 p. 163-164): put on by a move, it falls when the encounter ends
Hooks.on('moveToken', onMoveToken)
Hooks.on('deleteCombat', clearRunning)
//Sprint fatigue (SR5 p. 174): counted and resisted by the active GM from the Sprint test card
Hooks.on('createChatMessage', message => onSprintCard(message).catch(e => console.error(e)))
Hooks.on('renderChatMessageHTML', SR5_GrappleHelpers.onRenderHoldCard)
//SR5 p. 422: the request of a search for hidden objects, resolved by the GM (conceal.js)
Hooks.on('renderChatMessageHTML', SR5Conceal.onRenderSearchCard)
//Sacrifice (Street Grimoire p. 90): the card of a melee wound, its points asked by the magician's owner (blood-magic.js)
Hooks.on('renderChatMessageHTML', onRenderSacrificeCard)
//An escape a player rolled frees her once the active GM has read its card again (grapple.js)
Hooks.on('createChatMessage', message => SR5_GrappleHelpers.onEscapeCard(message))
Hooks.on('updateChatMessage', message => SR5_GrappleHelpers.onEscapeCard(message))
//A target defends once against one attack: the active GM records each defense card (system/defense-once.js)
//A GM who leaves takes the requests still waiting on him: their senders are told to click again (system/relay-watch.js)
Hooks.on('userConnected', onUserConnected)
Hooks.on('createChatMessage', message => recordDefense(message).catch(e => console.error("SR5 | defense not recorded", e)))
Hooks.on('closeCombatantConfig', sr5HookCloseCombatantConfig)
Hooks.on('preUpdateItem', sr5HookPreUpdateItem)
Hooks.on('createItem', sr5HookCreateItem)
Hooks.on('updateItem', sr5HookUpdateItem)
Hooks.on('deleteItem', sr5HookDeleteItem)
Hooks.on('createActor', sr5HookCreateActor)
Hooks.on('preUpdateActor', sr5HookPreUpdateActor)
Hooks.on('updateActor', sr5HookUpdateActor)
Hooks.on('deleteActor', sr5HookDeleteActor)
Hooks.on('createActiveEffect', sr5HookCreateActiveEffect)
Hooks.on('deleteActiveEffect', sr5HookDeleteActiveEffect)
Hooks.on('renderCompendium', sr5HookRenderCompendium)
Hooks.on('renderCompendiumDirectory', sr5HookRenderCompendiumDirectory)
for (const hook of ['createItem', 'updateItem', 'deleteItem', 'createActor', 'updateActor', 'deleteActor']) {
  Hooks.on(hook, sr5HookCompendiumDocumentChanged)
}
Hooks.on('renderRollTableSheet', sr5AddTableFormulaField)
Hooks.on('renderTableResultConfig', sr5AddResultQuantityField)
Hooks.on('renderChatMessageHTML', sr5HookRenderTablePayout)
Hooks.on('renderChatMessageHTML', sr5HookRenderTableActions)
// A compendium, or one of its folders, drawn as a table
Hooks.on('getCompendiumContextOptions', sr5HookCompendiumDrawContext)
Hooks.on('getHeaderControlsCompendium', sr5HookCompendiumDrawHeader)
Hooks.on('getFolderContextOptions', sr5HookCompendiumDrawFolder)
Hooks.on('renderSidebar', SR5ShopWindow.onRenderSidebar)
Hooks.on('renderSidebar', SR5DealershipWindow.onRenderSidebar)
// A sale or a restock on a vendor: its open shop window redraws
for (const hook of ['createItem', 'updateItem', 'deleteItem', 'updateActor']) Hooks.on(hook, SR5ShopVendor.onVendorChanged)
// A contact the gamemaster puts on a vendor searches for it
Hooks.on('createItem', SR5ShopVendor.onContactAdded)
Hooks.on('renderSidebar', sr5KeepSidebarSettingsLast)
Hooks.on('getHeaderControlsDocumentSheetV2', SR5ShopStock.onHeaderControls)
// A character in creation (lot C0): the gamemaster's switch, refused to a player
Hooks.on('getHeaderControlsDocumentSheetV2', onCreationHeaderControls)
Hooks.on('preCreateActor', stripCreationOnCreate)
Hooks.on('preUpdateActorDelta', sr5HookPreUpdateActorDeltaCreation)
Hooks.on('drawMeasuredTemplate', sr5HookDrawMeasuredTemplate)
Hooks.on('deleteMeasuredTemplate', sr5HookDeleteMeasuredTemplate)
Hooks.on('createMeasuredTemplate', sr5HookCreateMeasuredTemplate)
Hooks.on('updateMeasuredTemplate', sr5HookUpdateMeasuredTemplate)
Hooks.on('updateScene', sr5HookUpdateScene)
Hooks.on('updateScene', sr5HookUpdateSceneIndicators)
Hooks.on('updateWorldTime', sr5HookExpireManaShifts)
Hooks.on('canvasReady', renderSceneIndicators)
Hooks.on('canvasReady', sr5HookCanvasReadyAreaEffects)
Hooks.on('canvasReady', sr5HookCanvasReadyVisionRanges)
// Shared vision: through a drone or a device (SR5 p. 241)
Hooks.on('updateToken', sr5HookUpdateTokenSharedVision)
Hooks.on('canvasReady', () => SR5SharedVision.renderIndicator())
Hooks.on('renderPlayers', () => SR5SharedVision.renderIndicator())
Hooks.on('updateActor', sr5HookUpdateActorSharedVision)
Hooks.on('updateItem', sr5HookUpdateItemSharedVision)
Hooks.on('createActiveEffect', (effect) => {
  if (effect.parent instanceof Actor) SR5SharedVision.checkViewers(effect.parent)
})
Hooks.on('canvasReady', () => SR5SharedVision.checkViewers())
// Locked storages: the other players' rights follow the lock (SR5 p. 365)
SR5StorageLock.registerHooks()
// Essence lost to a removed implant (SR5 p. 53, Faille d'Essence CF p. 74): the active GM keeps the hole
registerEssenceHoleHooks()
// The reserved implant fields: the active GM puts back what a player's client let through (system/implant-register.js)
registerImplantRegisterHooks()
// A preparation's start and pace: the active GM puts back what a player's client let through (system/preparation-register.js)
registerPreparationRegisterHooks()
// Two bone lacings, or a lacing and bone density, switched on by a player: the active GM switches it off (SR5 p. 458, 462)
registerBoneAugmentationGuard()
// Agility brought to 0: the "immobilized" status follows it (séance H, H8)
registerAgilityZeroHooks()
// An IC uses its host's matrix attributes (SR5 p. 249): prepared again once the host is, or when it changes
registerIceHostHooks()
registerInsectRaceHooks()
// The cyberlimb enhancements raise the limb only: the active GM is told once which characters to check (SR5 p. 459)
registerCyberlimbNotice()
// A rigger ejected from his vehicle: it is out of control until the next Combat Turn, then on autopilot (SR5 p. 271)
registerRiggerEjectionHooks()
// Vehicle chases: the window in the token controls, and the turn that follows the encounter (R12)
registerChaseHooks()
// Faction Reputation: the gamemaster's window in the token controls too (lot 10)
registerFactionsControl()
// Cutting Aces social rules: the con tracker and the bartering window in the token controls (lot 21)
registerConControls()
// Drone swarms: a member that changes, enters or leaves the scene prepares its swarm again (Rigger 5.0 p. 35)
registerSwarmHooks()
// The crown of a PAN follows its token and its devices (couronne du PAN, lot 2)
registerPanCrownHooks()
// Messages and calls between commcodes (lot 14, SR5 p. 241): the register, the requests to the GM, the windows
registerCommcodeHooks()
// ...and the communication devices already in the world get their commcode (relecture djamz.13, arbitrage de DjamZ)
Hooks.once('ready', () => import('./interface/commcode-default.js').then(m => m.fillMissingCommcodes())
  .catch(e => console.error("SR5 | commcode", e)))
// Blight strikes: sustained spells, active foci and astral fall (Better Than Bad p. 141)
Hooks.on('createItem', onBlightCreated)
// ...and an actor under Blight is put in order at the world's load, by the active GM (Clémence's review)
Hooks.once('ready', () => sweepBlight().catch(e => console.error("SR5 | Blight", e)))
for (const hook of ['createActor', 'deleteActor', 'createToken', 'deleteToken', 'canvasReady']) Hooks.on(hook, sr5HookResetJumpedInRiggers)
