// Ossature renforcée and densité osseuse (SR5 p. 458, 462; decision H5 of DjamZ): a player's sheet refuses to switch one
// on beside another, but a client can be made to skip its own checks (an item update typed in the console added both
// bonuses, unseen: Bérénice's review). So the active GM, who sees every write through the hooks, checks again: an
// augmentation a player switched on, or created switched on, beside an incompatible one switched on is put back off,
// and he is told. A gamemaster's own write goes through: he may keep both (H5).
import {
  activeBoneClash
} from "./implant-essence.js"

const isActiveGM = () => !!game.users?.activeGM?.isSelf

/**
 * The incompatible augmentation switched on beside `item`, when a player has just switched `item` on; else null.
 * @param {Item} item           the item written
 * @param {object|null} changes the update's changes (null for a creation)
 * @param {string} userId       who wrote it
 */
export function boneClashByPlayer(item, changes, userId) {
  if (game.users?.get(userId)?.isGM) return null
  if (item?.type !== "itemAugmentation" || item.system?.isActive !== true || !item.parent) return null
  if (changes && changes.system?.isActive !== true) return null
  return activeBoneClash(item.parent, item)
}

async function check(item, changes, userId) {
  if (!isActiveGM()) return
  const other = boneClashByPlayer(item, changes, userId)
  if (!other) return
  await item.update({
    "system.isActive": false
  })
  ui.notifications.warn(game.i18n.format("SR5.WARN_BoneClashSwitchedOff", {
    user: game.users.get(userId)?.name ?? game.i18n.localize("SR5.SomePlayer"), name: item.name,
    actor: item.parent.name, lacing: other.name
  }), {
    permanent: true
  })
}

export function registerBoneAugmentationGuard() {
  const guard = fn => (...args) => Promise.resolve(fn(...args)).catch(e => console.error("SR5 | bone augmentation guard", e))
  Hooks.on("createItem", guard((item, _options, userId) => check(item, null, userId)))
  Hooks.on("updateItem", guard((item, changes, _options, userId) => check(item, changes, userId)))
}
