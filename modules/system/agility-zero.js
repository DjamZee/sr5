// Agility brought to 0 (séance H, H8, decision of DjamZ): the "immobilized" status is laid on the actor, and taken off
// when Agility comes back. The book says it case by case, never as a general rule: Mana Bonds and Bonds (Street
// Grimoire p. 116, "immobilisées et incapables de bouger leurs membres"), Nerve Strike (Street Grimoire), the whip's
// called shot and high gravity (Run & Gun). What being immobilized allows (crawling at a quarter of the speed,
// defending with a penalty) stays the gamemaster's call: the status only shows it.

import {
  worldActors
} from "./world-actors.js"

export const AGILITY_ZERO_STATUS = "agilityZero"

export const agilityZeroStatusEffect = {
  img: "icons/svg/paralysis.svg",
  id: AGILITY_ZERO_STATUS,
  name: "SR5.STATUSES_AgilityZero",
  origin: AGILITY_ZERO_STATUS
}

// "Réduite à 0": an Agility the modifiers bring down to 0. A sheet still blank (natural Agility 0) is not immobilized
export function isAgilityZero(actor) {
  const agility = actor?.system?.attributes?.agility
  if (!agility) return false
  const natural = Number(agility.natural?.value), augmented = Number(agility.augmented?.value)
  return natural > 0 && Number.isFinite(augmented) && augmented <= 0
}

// The actors whose status is being written: a second hook before the first write lands does not write it twice.
// The write itself fires createActiveEffect / deleteActiveEffect, which checks again and finds nothing to do
const PENDING = new Set()

// Written by the active gamemaster alone, never by a player's client
export async function syncAgilityZero(actor) {
  if (!game.users?.activeGM?.isSelf || !actor?.system?.attributes?.agility) return
  const want = isAgilityZero(actor)
  if (want === !!actor.statuses?.has(AGILITY_ZERO_STATUS)) return
  const key = actor.uuid ?? actor.id
  if (PENDING.has(key)) return
  PENDING.add(key)
  try {
    await actor.toggleStatusEffect(AGILITY_ZERO_STATUS, {
      active: want
    })
  }
  finally {
    PENDING.delete(key)
  }
}

// The actor a changed document belongs to: itself, or the actor carrying the item or the effect
function actorOf(document) {
  if (document instanceof Actor) return document
  return document?.parent instanceof Actor ? document.parent : null
}

// At the world's load, the active gamemaster puts every actor in order: an Agility at 0 from before the status, or
// changed while no gamemaster was connected, carries it; a status left on an Agility that came back loses it
// (Clémence's review). syncAgilityZero writes nothing for an actor already in order
export async function sweepAgilityZero(actors = worldActors()) {
  if (!game.users?.activeGM?.isSelf) return
  for (const actor of actors) await syncAgilityZero(actor).catch(e => console.error("SR5 | agility 0 status", e))
}

// Agility moves with the actor, its items (augmentations, drugs, item effects) and its active effects
export function registerAgilityZeroHooks() {
  Hooks.once("ready", () => sweepAgilityZero())
  for (const hook of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, document => {
      const actor = actorOf(document)
      if (actor) syncAgilityZero(actor).catch(e => console.error("SR5 | agility 0 status", e))
    })
  }
}
