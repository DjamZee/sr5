// The public API of the combat for the modules (API pour Matrice v1, A4): game.sr5.combat. A module counts an action
// of a combatant as the system does (the crown's mode switch, lot 0, calls SR5Combat.changeActionInCombat), without
// reaching for an inner function that may be renamed.

import {
  SR5
} from "../config.js"
import {
  SR5Combat
} from "./srcombat.js"

// The actions a module may count: the interruptions carry their own cost in Initiative, and stay with the system
export const SPENDABLE_ACTION_TYPES = ["free", "simple", "complex"]

/**
 * The action a request counts, or null when it is not one the API takes.
 * @param {String} type                   free, simple or complex
 * @param {Object} [options]
 * @param {Number} [options.value]        how many actions of that type, 1 by default
 * @param {String} [options.source]       a key of SR5.actionSources, named in the notification; matrixAction by default
 * @param {Object} [sources]              SR5.actionSources
 * @return {{type: String, value: Number, source: String}|null}
 */
export function actionRequest(type, {
  value = 1, source = "matrixAction"
} = {
}, sources = SR5.actionSources){
  if (!SPENDABLE_ACTION_TYPES.includes(type)) return null
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1) return null
  return {
    type, value: count, source: sources?.[source] ? source : "matrixAction"
  }
}

/**
 * Count an action of an actor in the combat, as the system counts its own: the block of the world setting "actions
 * missing" (sr5BlockMissingActions) and the phase are checked first, then the counters of the actor and of its
 * combatant go down, and the table is told.
 * @param {Object} actor       the actor who acts (a token's actor for an unlinked token)
 * @param {String} type        free, simple or complex
 * @param {Object} [options]   {value, source}: see actionRequest
 * @return {Promise<Boolean>}  false when the action cannot be counted (unknown type, no actor, or refused by the
 *                             system: no action left); true otherwise, out of combat included, where nothing is counted
 */
export async function spendAction(actor, type, options = {
}){
  const action = actionRequest(type, options)
  if (!actor || !action) return false
  if (!SR5Combat.hasActionsLeft(actor, [action])) return false
  await SR5Combat.changeActionInCombat(actor.isToken ? actor.token.id : actor.id, [action])
  return true
}

export const SR5CombatApi = {
  spendAction,
}
