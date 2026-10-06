import {
  isLocked, lockedRightsChange, closingRights, dialogRights,
} from "./storage-lock.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"

/**
 * The GM's update of a storage's rights, rewritten before it leaves while the
 * storage is shut. Called from the actor's own _preUpdate: Foundry's
 * ownership window updates with noHook (document-ownership.mjs, 13.351), so a
 * preUpdateActor hook never saw it and the right took effect until the sync
 * came back (Holly, Olive).
 */
export class SR5StorageLockRights {
  /** Users holding the key: the owners of the character who put it down. */
  static keyHolders(storage) {
    const creator = SR5_EntityHelpers.getRealActorFromID(storage?.system?.creatorId)
    if (!creator) return []
    return game.users.filter(u => !u.isGM && creator.testUserPermission(u, "OWNER")).map(u => u.id)
  }

  /**
   * @param {Actor} actor the storage as it is before the update
   * @param {object} changes the update, rewritten in place
   * @param {object} options the update's options
   */
  static hold(actor, changes, options) {
    if (actor?.type !== "actorStorage" || !game.user.isGM || options?.sr5LockSync) return
    const lockedNext = foundry.utils.getProperty(changes, "system.lock.locked")
    if (lockedNext === false) return
    const gms = game.users.filter(u => u.isGM).map(u => u.id)
    const keep = [...SR5StorageLockRights.keyHolders(actor), ...gms]
    const saved = actor.getFlag("sr5", "lockOwnership")
    // The ownership window replaces the whole ownership ("==ownership")
    const replaced = changes["==ownership"]
    // Shut by the GM: the others go down to Limited in the same update, the rights it changes too
    const type = foundry.utils.getProperty(changes, "system.lock.type") ?? actor.system.lock?.type
    if (lockedNext === true && !isLocked(actor) && type) {
      if (replaced) {
        const shut = dialogRights(replaced, keep)
        changes["==ownership"] = shut.ownership
        foundry.utils.setProperty(changes, "flags.sr5.==lockOwnership", shut.saved)
        return
      }
      const shut = closingRights(actor.ownership, changes.ownership, saved, keep)
      // A key sent back to the default stays sent back: the update merges, it never drops a key
      for (const key of Object.keys(changes.ownership ?? {
      })) if (key.startsWith("-=")) shut.ownership[key] = null
      changes.ownership = shut.ownership
      foundry.utils.setProperty(changes, "flags.sr5.lockOwnership", shut.saved)
      return
    }
    if (!isLocked(actor)) return
    if (replaced) {
      // The window shows the GM's wish (see showWish): what it sends back is his whole wish
      const result = dialogRights(replaced, keep)
      changes["==ownership"] = result.ownership
      foundry.utils.setProperty(changes, "flags.sr5.==lockOwnership", result.saved)
      return
    }
    if (!changes.ownership) return
    const result = lockedRightsChange(changes.ownership, saved, keep)
    changes.ownership = result.ownership
    foundry.utils.setProperty(changes, "flags.sr5.lockOwnership", result.saved)
  }

  /**
   * The ownership window of a shut storage shows what the GM meant for each
   * user, not the Limited the lock holds them at: a Limited he sets there is
   * then his, told apart from the lock's own (Holly).
   * @param {Application} app the DocumentOwnershipConfig
   * @param {HTMLElement} element its element
   */
  static showWish(app, element) {
    const actor = app?.document
    if (actor?.documentName !== "Actor" || actor.type !== "actorStorage" || !isLocked(actor) || !game.user.isGM) return
    const wish = actor.getFlag("sr5", "lockOwnership") ?? {
    }
    for (const [userId, level] of Object.entries(wish)) {
      const select = element.querySelector(`select[name="${userId}"]`)
      if (select && select.querySelector(`option[value="${Number(level)}"]`)) select.value = String(level)
    }
    if (element.querySelector(".sr5-lock-wish-hint")) return
    const hint = document.createElement("p")
    hint.className = "hint sr5-lock-wish-hint"
    hint.textContent = game.i18n.localize("SR5.StorageLockOwnershipHint")
    element.querySelector(".instructions")?.after(hint)
  }
}
