// Being ejected (SR5 p. 268, 271): a rigger is thrown out of the vehicle he is jumped into when it is destroyed or
// bricked, or when the commlink or RCC he uses is. He takes dumpshock and loses control of the vehicle: out of control
// (SR5 p. 203) until the start of the next Combat Turn, when its autopilot takes over again. A pulled cable, the third
// case of p. 271, is left to the gamemaster: the system does not know of the cable.
// The vehicle is under the autopilot mode at once, so that no further damage reaches the rigger through it; the
// "out of control" status keeps it from acting until the next Combat Turn.
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"
import {
  _getSRStatusEffect
} from "./effectsList.js"
import {
  isJumpedInDrone
} from "./shared-vision.js"
import {
  monitorFull, ejectionOver, droneWrecked
} from "./rigging-rules.js"

// Not card-helpers' isActiveGM (N2): false here, instead of an error, before the world has its users (init)
function isActiveGM() {
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}

function pilotOf(drone) {
  return drone?.system?.attributes?.pilot?.augmented?.value
}

// The drones of the world, unlinked tokens included
function worldDrones() {
  const drones = new Map()
  for (const actor of game.actors ?? []) if (actor.type === "actorDrone") drones.set(actor.uuid, actor)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens) {
    if (!token.actorLink && token.actor?.type === "actorDrone") drones.set(token.actor.uuid, token.actor)
  }
  return [...drones.values()]
}

// The drones under the ejection's status, found without building every unlinked token's actor: the effects of one
// live in its token's delta
function ejectedDrones() {
  const marked = effects => Array.from(effects ?? []).some(e => e.flags?.sr5?.ejection)
  const drones = new Map()
  for (const actor of game.actors ?? []) if (actor.type === "actorDrone" && marked(actor.effects)) drones.set(actor.uuid, actor)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens) {
    if (token.actorLink || !marked(token.delta?.effects)) continue
    if (token.actor?.type === "actorDrone") drones.set(token.actor.uuid, token.actor)
  }
  return [...drones.values()]
}

/** The drones a rigger is jumped into, found by his actor or his token */
export function dronesJumpedInBy(rigger, drones = worldDrones()) {
  const ids = new Set([rigger?.id, rigger?.token?.id].filter(Boolean))
  return drones.filter(drone => isJumpedInDrone(drone) && ids.has(drone.system.vehicleOwner.id))
}

/** The vehicle is destroyed or bricked under the rigger: dumpshock (SR5 p. 268), and the vehicle is lost */
export async function ejectFromDrone(drone) {
  if (!isJumpedInDrone(drone)) return false
  const rigger = SR5_EntityHelpers.getRealActorFromID(drone.system.vehicleOwner.id)
  if (rigger) SR5_ActorHelper.dumpshockIfInVR(rigger, {
    jumpedIn: true
  })
  await loseControl(drone)
  return true
}

/** The commlink or RCC the rigger uses is bricked: the brick deals the dumpshock (matrix.js), the vehicles are lost */
export async function ejectRigger(rigger) {
  const drones = dronesJumpedInBy(rigger)
  for (const drone of drones) await loseControl(drone)
  return drones.length
}

async function loseControl(drone) {
  const combat = game.combat?.started ? game.combat : null
  const hasPilot = Number(pilotOf(drone)) > 0
  //sr5Ejection: this change of mode is the ejection itself, not someone taking the vehicle over
  await drone.update({
    "system.controlMode": "autopilot"
  }, {
    sr5Ejection: true
  })
  let message = "SR5.INFO_RiggerEjectedAutopilot"
  if (combat || !hasPilot) {
    const effect = await _getSRStatusEffect("noAction")
    effect.name = game.i18n.localize("SR5.STATUSES_OutOfControl")
    effect.flags.sr5 = {
      ejection: combat ? {
        combatId: combat.id, round: combat.round
      } : {
      }
    }
    await drone.createEmbeddedDocuments("ActiveEffect", [effect])
    message = hasPilot ? "SR5.INFO_RiggerEjectedOutOfControl" : "SR5.INFO_RiggerEjectedNoPilot"
  }
  //Destroyed or bricked: no autopilot is left to take it over
  if (droneWrecked(drone.system)) message = "SR5.INFO_RiggerEjectedWrecked"
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: drone
    }),
    content: `<p>${game.i18n.format(message, {
      name: drone.name
    })}</p>`,
  })
}

async function endEjection(drone, effects, message) {
  await drone.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id))
  if (message) await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: drone
    }),
    content: `<p>${game.i18n.format(message, {
      name: drone.name
    })}</p>`,
  })
}

function ejectionEffects(drone) {
  return (drone?.effects ?? []).filter(e => e.flags?.sr5?.ejection)
}

// At the start of a new Combat Turn, the autopilot takes the ejected vehicles over again (SR5 p. 271)
async function onCombatRound(combat, changed) {
  if (!isActiveGM() || !("round" in (changed ?? {
  }))) return
  for (const drone of ejectedDrones()) {
    if (droneWrecked(drone.system)) continue
    const over = ejectionEffects(drone).filter(e => ejectionOver(e.flags.sr5.ejection, combat, pilotOf(drone)))
    if (over.length) await endEjection(drone, over, "SR5.INFO_AutopilotTakesOver")
  }
}

// The encounter ends: there is no next Combat Turn to wait for, the autopilot has the vehicle
async function onCombatDeleted(combat) {
  if (!isActiveGM()) return
  for (const drone of ejectedDrones()) {
    if (!(Number(pilotOf(drone)) > 0) || droneWrecked(drone.system)) continue
    const over = ejectionEffects(drone).filter(e => e.flags.sr5.ejection.combatId === combat.id)
    if (over.length) await endEjection(drone, over, "SR5.INFO_AutopilotTakesOver")
  }
}

// Someone else takes the vehicle (SR5 p. 271), or the gamemaster sets its mode: it is no longer out of control
async function onDroneUpdated(actor, changed, options) {
  if (!isActiveGM() || options?.sr5Ejection || actor?.type !== "actorDrone") return
  if (foundry.utils.getProperty(changed ?? {
  }, "system.controlMode") === undefined) return
  const effects = ejectionEffects(actor)
  if (effects.length) await endEjection(actor, effects)
}

// The device in use is bricked: switched off by the same write that fills its matrix monitor (matrix.js)
async function onDeviceUpdated(item, changed) {
  if (!isActiveGM() || item?.type !== "itemDevice" || !item.parent) return
  if (foundry.utils.getProperty(changed ?? {
  }, "system.isActive") !== false) return
  if (!monitorFull(item.system?.conditionMonitors?.matrix)) return
  const rigger = item.parent
  //A rigger whose sheet still says AR was in VR all the same: the brick skipped his dumpshock (SR5 p. 229, 268)
  if (await ejectRigger(rigger) && rigger.system?.matrix?.userMode === "ar") SR5_ActorHelper.dumpshockIfInVR(rigger, {
    bricked: true, jumpedIn: true
  })
}

export function registerRiggerEjectionHooks() {
  const log = e => console.error("SR5 | rigger ejection", e)
  Hooks.on("updateCombat", (combat, changed) => onCombatRound(combat, changed).catch(log))
  Hooks.on("deleteCombat", combat => onCombatDeleted(combat).catch(log))
  Hooks.on("updateActor", (actor, changed, options) => onDroneUpdated(actor, changed, options).catch(log))
  Hooks.on("updateItem", (item, changed) => onDeviceUpdated(item, changed).catch(log))
}

export const _test = {
  onCombatRound, onCombatDeleted, onDroneUpdated, onDeviceUpdated, loseControl
}
