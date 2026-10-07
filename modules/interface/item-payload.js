// How a number of one item is handed to an actor — bought in the shop
// (shop.js) or drawn from a table (table-payout.js). Each caller prepares the
// copy its own way; how a count becomes documents is shared.

/** Item types that carry their own quantity: they are handed over as one stack. */
export const STACKABLE_TYPES = ["itemAmmunition", "itemDrug", "itemGear", "itemWeapon"]

/**
 * The documents to create so that an actor ends up holding `quantity` of an item.
 *
 * Ten rounds of ammunition are one line holding ten; two swords are two
 * swords, because a sword carries its own condition and its own modifications.
 *
 * @param {object} itemData   the item's data, without its _id
 * @param {number} quantity
 * @param {number} [perEntry] how many one counts for on a stack (a compendium's box of 10 rounds, in the shop)
 * @returns {object[]}
 */
export function sr5StackPayload(itemData, quantity, perEntry = 1) {
  if (STACKABLE_TYPES.includes(itemData.type) && itemData.system?.quantity !== undefined) {
    itemData.system.quantity = quantity * perEntry
    return [itemData]
  }
  const payload = []
  for (let i = 0; i < quantity; i++) payload.push(foundry.utils.deepClone(itemData))
  return payload
}

/**
 * `Nom (x3)` when there is more than one.
 * @param {string} name
 * @param {number} quantity
 * @returns {string}
 */
export function sr5LineLabel(name, quantity) {
  return quantity > 1 ? `${name} (x${quantity})` : name
}
