// The disconnection of the Flicker IC (Kill Code p. 74): « Si vous avez deux marks sur vous, il vous déconnecte de la
// matrice, en vous infligeant au passage les dommages du choc d'éjection. Bien que vous ayez été déconnecté de la
// matrice, votre avatar, lui, ne disparaît pas tant que vous ne vous reconnectez pas en utilisant le même appareil, ou
// après [Indice d'appareil] tours de combats. Il reste là où vous l'avez laissé, incapable d'agir ».
// It is no reboot. Élise's ruling of 16/10 on Corentin's proposal, where the book says nothing:
// - the dumpshock at once (the character is thrown out), and the link lock goes with the connection;
// - an effect « Déconnecté (avatar inerte) » for [Device Rating] combat turns: no matrix action meanwhile;
// - the marks and the Overwatch Score stay while the avatar stays (other IC may still trace or analyse it);
// - when the effect runs out, or when the character reconnects (reboots its device), the full reboot: marks erased,
//   score at 0, out of the host; no second dumpshock.
// Plain rules first, with no Foundry in them, so that tests can read them.

import {
  isLinkLockEffect, linkLockStatusIds
} from "./link-lock.js"

export const FLICKER_DISCONNECTION = "flickerDisconnection"

/** The combat turns the avatar stays: the Device Rating of the device it was connected with, 1 at least */
export function flickerTurns(device){
  return Math.max(1, Number(device?.system?.deviceRating) || 0)
}

/** Is the actor disconnected by a Flicker, its avatar still in the Matrix? */
export function isFlickerDisconnected(actor){
  return [...(actor?.items ?? [])].some(i => i.type === "itemEffect" && i.system?.type === FLICKER_DISCONNECTION)
}

/** The effect item of the disconnection */
export function flickerEffectData({
  ice, turns, name, target
}){
  return {
    type: "itemEffect",
    name,
    "system.type": FLICKER_DISCONNECTION,
    "system.ownerID": ice?.isToken ? ice.token?.id : ice?.id,
    "system.ownerName": ice?.name ?? "",
    "system.durationType": "round",
    "system.duration": turns,
    "system.target": target,
  }
}

/**
 * The Flicker disconnects the character: dumpshock now, the link locks gone, the effect for [Device Rating] combat
 * turns. Nothing if it is already disconnected.
 * @param {Object} ice      the IC
 * @param {Object} target   the character
 * @param {Object} device   the device it was connected with
 * @return {Promise<Boolean>}
 */
export async function disconnectByFlicker(ice, target, device){
  if (!target || isFlickerDisconnected(target)) return false
  const {
    SR5_ActorHelper
  } = await import("../entities/actors/entityActor-helpers.js")
  SR5_ActorHelper.dumpshockIfInVR(target)
  const locks = target.items.filter(i => isLinkLockEffect(i)).map(i => i.id)
  if (locks.length) await target.deleteEmbeddedDocuments("Item", locks)
  const statuses = linkLockStatusIds(target)
  if (statuses.length) await target.deleteEmbeddedDocuments("ActiveEffect", statuses)
  const turns = flickerTurns(device)
  await target.createEmbeddedDocuments("Item", [flickerEffectData({
    ice, turns, name: game.i18n.localize("SR5.EffectFlickerDisconnected"),
    target: game.i18n.format("SR5.EffectFlickerDisconnectedTarget", {
      turns
    }),
  })])
  ui.notifications.info(game.i18n.format("SR5.INFO_FlickerDisconnected", {
    name: target.isToken ? target.token?.name ?? target.name : target.name, turns
  }))
  return true
}

/** The avatar leaves the Matrix for good: the full reboot, with no second dumpshock (the effect is already gone, or
 *  rebootDeck removes it) */
export async function endFlickerDisconnection(actor){
  if (typeof actor?.rebootDeck !== "function") return
  await actor.rebootDeck(null, {
    dumpshock: false
  })
}
