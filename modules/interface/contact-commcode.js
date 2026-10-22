// The commcode of a contact (API pour CONTACTS): an itemContact carries the commcode the gamemaster answers on when
// the contact has no sheet of its own (system.commcode). A contact made into a grunt (isCreated) answers on the
// devices of that grunt instead. Reading only: the API (commcode-api.js) writes it.

import {
  normalizeCommcode, sameCommcode
} from "../system/commcode-rules.js"

// Before the field, the Landing Page's CONTACTS (lot 1, 1.2.0) kept the commcode in a flag of its own
export const LANDING_MODULE_ID = "landing-metroplexes-sr5"

/**
 * The update that moves the module's flag into system.commcode, empty when there is nothing to move: the contact
 * has a commcode already, or no flag. The flag is left, the module reading it until it moves to the API.
 * @param item   an itemContact, document or data
 */
export function contactCommcodeFromFlag(item){
  if (item?.type !== "itemContact" || normalizeCommcode(item.system?.commcode)) return {
  }
  const flag = String(item.flags?.[LANDING_MODULE_ID]?.commcode ?? "").trim()
  return normalizeCommcode(flag) ? {
    "system.commcode": flag
  } : {
  }
}

/** The contacts of the world's actors, of the unlinked tokens' and of the world's items */
export function worldContacts(){
  const contacts = []
  const read = items => {
    for (const item of items ?? []) if (item.type === "itemContact") contacts.push(item)
  }
  for (const actor of game.actors ?? []) read(actor.items)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink) read(token.actor?.items)
  read(game.items)
  return contacts
}

/** The contacts that carry this commcode */
export function contactsOfCommcode(commcode){
  if (!normalizeCommcode(commcode)) return []
  return worldContacts().filter(item => sameCommcode(item.system?.commcode, commcode))
}

/** The name the gamemaster reads for a contact: its name, and the character whose contact it is */
export function contactLabelOf(item){
  if (!item) return ""
  const owner = item.parent?.name
  return owner ? `${item.name} (${game.i18n.format("SR5.COMMCODE_ContactOf", {
    name: owner
  })})` : item.name
}
