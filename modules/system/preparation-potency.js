// Alchemical potency (SR5 p. 309): a preparation keeps its full Potency for (Potency × 2) hours, then loses 1, and 1
// more every hour after; at 0 it is no longer magical. The preparation notes the world time it was made at and its
// starting Potency; when the clock moves, the active GM writes the Potency it has come down to.
//
// What slows the loss is set by the gamemaster on the preparation (decision G9 of DjamZ, 06/10), not recognised by name:
// - the full time: × 3 for Durable Preparations (Forbidden Arcana p. 39) and the Godi (p. 71), × 4 for the Islamic
//   alchemist practitioner (p. 39) and the Sacrifice of blood magic (p. 127); only the longest one counts;
// - the pace: one point a day instead of an hour with the Fixation metamagic (SR5 p. 329).
// What hastens it stays the gamemaster's, who lowers the Potency by hand: a fovea (Street Grimoire p. 34), a dispersion
// circle (p. 123), a substituted alchera (p. 28). The Potency written is never above the stored one, so his lower
// value holds.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"

export const FULL_POTENCY_MULTIPLIERS = [2, 3, 4]
// Written at the making, then the gamemaster's: a player's update that would change them loses those paths
export const GM_ONLY_PREPARATION_PATHS = ["system.createdAt", "system.initialPotency", "system.fullPotencyMultiplier", "system.decayRate"]
export const POTENCY_DECAY_STEPS = {
  hour: 3600,
  day: 86400,
}

// The Potency the book gives at this world time, or null when the preparation keeps no start (made before this rule)
export function potencyAt(system, now){
  const initial = Number(system?.initialPotency) || 0
  const start = system?.createdAt
  if (!(initial > 0) || typeof start !== "number") return null
  const multiplier = FULL_POTENCY_MULTIPLIERS.includes(Number(system.fullPotencyMultiplier)) ? Number(system.fullPotencyMultiplier) : 2
  const step = POTENCY_DECAY_STEPS[system.decayRate] ?? POTENCY_DECAY_STEPS.hour
  const elapsed = now - start
  const full = initial * multiplier * 3600
  if (elapsed < full) return initial
  // « À l'issue de ce temps, le Potentiel est réduit de 1, puis de 1 encore à chaque heure supplémentaire »
  return Math.max(0, initial - 1 - Math.floor((elapsed - full) / step))
}

// The Potency to write, only when it is lower than the stored one
export function decayedPotency(system, now){
  const computed = potencyAt(system, now)
  if (computed === null) return null
  return computed < (Number(system.potency) || 0) ? computed : null
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isWriter(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function allActors(){
  const actors = new Set(game.actors)
  for (const scene of game.scenes){
    for (const token of scene.tokens){
      if (!token.actorLink && token.actor) actors.add(token.actor)
    }
  }
  return [...actors]
}

export async function checkPreparationPotency(){
  if (!isWriter()) return
  const now = game.time.worldTime
  for (const actor of allActors()){
    const updates = [], spent = []
    for (const item of actor.items){
      if (item.type !== "itemPreparation") continue
      const potency = decayedPotency(item.system, now)
      if (potency === null) continue
      updates.push({
        _id: item.id, "system.potency": potency
      })
      if (potency === 0) spent.push(item.name)
    }
    if (!updates.length) continue
    await actor.updateEmbeddedDocuments("Item", updates)
    for (const item of spent) ui.notifications.info(game.i18n.format("SR5.INFO_PreparationSpent", {
      actor: actor.name, item
    }))
  }
}

let checking = null, again = false
function queueCheck(){
  if (checking){
    again = true
    return checking
  }
  checking = (async () => {
    do {
      again = false
      await checkPreparationPotency().catch(e => SR5_SystemHelpers.srLog(1, `Preparation potency not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

export function initPreparationPotency(){
  Hooks.on("updateWorldTime", () => queueCheck())
}
