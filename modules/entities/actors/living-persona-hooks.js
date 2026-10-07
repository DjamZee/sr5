// The living persona kept by the system, in Foundry (rules in living-persona.js): the active gamemaster alone creates
// or marks it, so that two clients never create two personas; a managed persona is neither deleted, nor turned into
// another device, nor copied onto a second actor.

import {
  canDeletePersona, changesPersonaType, isLivingPersona, isTechnomancer, personaOf, personaRepairPlan
} from "./living-persona.js"

const pending = new Set()

function isActiveGM(){
  return !!game.users?.activeGM?.isSelf
}

/**
 * Give a technomancer her persona, or mark the one she has as managed. The active gamemaster alone writes it; an
 * unlinked token takes the persona of its world actor.
 */
export async function ensureLivingPersona(actor){
  if (!isActiveGM() || !actor || actor.isToken || pending.has(actor.id)) return
  const plan = personaRepairPlan(actor, game.i18n.localize("SR5.DeckTypeLivingPersona"))
  if (!plan.create && !plan.update) return
  pending.add(actor.id)
  try {
    if (plan.create) await actor.createEmbeddedDocuments("Item", [plan.create])
    if (plan.update) await actor.updateEmbeddedDocuments("Item", [plan.update])
  } finally {
    pending.delete(actor.id)
  }
}

// A managed persona dropped on another sheet (a storage, another character): one persona per technomancer, and
// none for anybody else. The persona the system creates passes, the actor having none yet.
function refusesNewPersona(item){
  if (!isLivingPersona(item) || !item.system?.managed || !item.parent) return false
  if (!isTechnomancer(item.parent)) return true
  return !!personaOf(item.parent)
}

export function initLivingPersona(){
  Hooks.on("createActor", actor => ensureLivingPersona(actor))
  Hooks.on("updateActor", (actor, data) => {
    if (foundry.utils.hasProperty(data, "system.activeSpecialAttribute")) ensureLivingPersona(actor)
  })
  Hooks.on("preCreateItem", (item) => {
    if (!refusesNewPersona(item)) return
    ui.notifications.warn(game.i18n.localize("SR5.WARN_LivingPersonaNotMovable"))
    return false
  })
  Hooks.on("preDeleteItem", (item) => {
    if (canDeletePersona(item)) return
    ui.notifications.warn(game.i18n.localize("SR5.WARN_LivingPersonaNotDeletable"))
    return false
  })
  Hooks.on("preUpdateItem", (item, data) => {
    if (!changesPersonaType(item, data)) return
    ui.notifications.warn(game.i18n.localize("SR5.WARN_LivingPersonaNotDeletable"))
    return false
  })
  for (const actor of game.actors ?? []) ensureLivingPersona(actor)
}
