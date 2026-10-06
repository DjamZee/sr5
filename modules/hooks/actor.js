import {
  SR5_CharacterUtility
} from "../entities/actors/utilityActor.js"
import {
  GM_ONLY_ACTOR_PATHS, stripGMOnlyChanges
} from "../entities/items/spirit-bonds.js"
import {
  guardActorOverwatch
} from "../system/overwatch-guard.js"
import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"
import {
  SR5Combat
} from "../system/srcombat.js"
import {
  SR5_Jammer
} from "../system/jammer.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_SpiritTypes
} from "../entities/items/spirit-types.js"

export async function sr5HookCreateActor(actor) {
  SR5_ActorHelper.redrawCreatorSheet(actor)
  if ( !game.user.isGM ) return

  //Add itemDevice to Drone/Sprite/Agent if they have none.
  if (actor.type === "actorDrone" || actor.type === "actorSprite" || actor.type === "actorAgent"){
    let hasDevice = false
    for (let i of actor.items){
      if (i.type === "itemDevice") hasDevice = true
    }

    if (!hasDevice){
      let deviceItem = {
        "name": game.i18n.localize("SR5.Device"),
        "type": "itemDevice",
        "system.isActive": true,
        "system.type": "baseDevice",
      }
      await actor.createEmbeddedDocuments("Item", [deviceItem])
    }
  }

  //A homunculus is always physical (SR5 p. 301): it starts in physical initiative, the others astral
  if (actor.type ==="actorSpirit" && SR5_SpiritTypes.baseType(actor.system.type) !== "homunculus") {
    SR5_CharacterUtility.switchToInitiative(actor, "astralInit")
  }
}

//A spirit changed into a homunculus (or a type based on it) drops the astral initiative it was made with: written once
//by the gamemaster who changed it, the preparation already playing it physical (updateSpiritValues)
export async function homunculusLeavesAstral(actor, data, userId){
  if (actor.type !== "actorSpirit" || data.system?.type === undefined || userId !== game.user?.id || !game.user.isGM) return
  if (SR5_SpiritTypes.baseType(actor.system.type) !== "homunculus") return
  const initiativeEffect = actor.effects.find(e => e.origin === "initiativeMode")
  if (actor._source?.system?.initiatives?.astralInit?.isActive) await actor.update({
    "system.initiatives.astralInit.isActive": false, "system.initiatives.physicalInit.isActive": true,
  })
  if (initiativeEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [initiativeEffect.id])
}

// Data Trails p. 157-158: an AI's persona carries its own marks only while it has no device. Many updates write the
// prepared data back, where an AI on a device shows the marks of that device: they must not land on the persona.
// GM ruling (05/10): the marks left on the persona when the AI loaded onto a device stay there, so such an update
// leaves them alone; only an update that means to change them (a hacker who reboots, the AI that reboots) goes through.
export function sr5HookPreUpdateActor(document, changes, options = {
}) {
  //Indexes, reputation adjustment and spirit traits are the gamemaster's (Street Grimoire p. 207, Forbidden Arcana
  //p. 169-176): a player's update that would change them loses those paths, checked before anything is written
  if (!game.user?.isGM) {
    const refused = stripGMOnlyChanges(changes, document, GM_ONLY_ACTOR_PATHS)
    if (refused.length) ui.notifications.warn(game.i18n.localize("SR5.WARN_SpiritBondsGMOnly"))
    //The Overwatch Score only rises, but for a reboot or an Emulate swap: an update that would leave it lower, in
    //whatever form, is refused (overwatch-guard.js)
    if (!guardActorOverwatch(document, changes, options)) return false
  }
  if (options.sr5PersonaMarks) return
  if (!SR5_CharacterUtility.isDepthActive(document) || SR5_CharacterUtility.isDevicelessAI(document)) return
  delete changes["system.matrix.marks"]
  if (changes.system?.matrix) delete changes.system.matrix.marks
}

export async function sr5HookUpdateActor(document, data, _options, userId) {
  await homunculusLeavesAstral(document, data, userId)
  //The sheet's wireless and equip toggles write the items through the actor, so no updateItem is sent: a
  //physical jammer changed that way is measured again from here (SR5 p. 443)
  for (let change of Array.isArray(data.items) ? data.items : []){
    let item = document.items?.get?.(change._id)
    if (SR5_Jammer.isJammer(item) && change.system) SR5_Jammer.refreshItem(item)
  }
  //The sheet pins an item through the actor, items included : at that point the updateItem hook
  //still reads the actor as it was, so the tokens are served again from here
  if (data.items && userId === game.user?.id) await SR5_CharacterUtility.refreshVisionOfTokens(document)

  //The active GM alone: with two GMs connected, each one compared and adjusted the same fighter.
  //An attribute changed on the sheet moves the initiative at once, not at the next wound (Reaction + Intuition)
  if (game.combat && game.user?.isGM && game.users?.activeGM?.id === game.user.id && SR5Combat.updateMovesInitiative(data)) {
    for (const id of SR5Combat.initTargetsOfActor(document)) await SR5Combat.changeInitInCombatHelper(id)
  }

  //Keep deck condition monitor synchro with agent condition monitor
  if (document.type === "actorAgent" && data.system?.conditionMonitors?.matrix && (document.testUserPermission(game.user, 3) || (game.user?.isGM))){
    await SR5_ActorHelper.keepDeckSynchroWithAgent(document)
  }

  //Keep edge monitor synchro with tokens
  if (document.type === "actorGrunt" && data.system?.conditionMonitors?.edge && (document.testUserPermission(game.user, 3) || (game.user?.isGM))){
    await SR5_ActorHelper.keepEdgeSynchroWithGrunt(document)
  }

  //A deployed drone switching its wireless leaves or joins its owner's connected objects, which the owner
  //computes when prepared: prepare it again (N91)
  if (document.type === "actorDrone" && data.system?.wirelessTurnedOn !== undefined) {
    const owner = SR5_EntityHelpers.getRealActorFromID(document.system.creatorId)
    if (owner) {
      owner.reset()
      if (owner.sheet?.rendered) owner.sheet.render()
    }
  }

  //Propagate owner data changes to linked drones and agents
  if ((document.type === "actorPc" || document.type === "actorGrunt") && (document.testUserPermission(game.user, 3))) {
    await SR5_CharacterUtility.updateControledVehicle(document)
    if (document.items.find(item => item.system.type === "agent")) await SR5_CharacterUtility.updateProgramAgent(document)
  }

  // Re-render open item sheets when actor data changes (e.g. metamagic toggles affect spell display)
  for (const item of document.items) {
    if (item.sheet?.rendered) item.sheet.render()
  }
}

// When an actor is deleted, remove all its tokens from every scene
export async function sr5HookDeleteActor(actor, options, userId) {
  if (game.user.id !== userId) return
  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(t => t.actorId === actor.id)
    if (tokens.length) {
      await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id))
    }
  }
}
