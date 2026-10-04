import {
  isLocked, pickStages, pickPool, pickLimit, lockTools, extendedTest,
  isPickRequestAllowed, lockedOwnership, unlockedOwnership,
} from "./storage-lock.js"
import {
  isStoredAway
} from "./storage-rules.js"
import {
  SR5ShopAvailability
} from "./shop-availability.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"

// How close the picker must stand, in squares, centre to centre: beside it
const PICK_REACH = 2

/**
 * Locks on storages put down on the map, in a running game.
 *
 * Opening one without the key goes through the GM: the player asks, the GM's
 * browser checks who asks (the server gives the sender, a client cannot forge
 * it), rolls the test and only then opens. A locked storage leaves the other
 * players at Limited, so the server itself refuses them its contents.
 */
export class SR5StorageLock {
  /** The world actor of a storage on the map: its lock and its rights live
   * there, the token only holding what is inside. */
  static base(actor) {
    return actor?.isToken ? (actor.token?.baseActor ?? actor) : actor
  }

  /** Squares between two tokens of the same scene, centre to centre;
   * Infinity when they are not on the same one. */
  static squaresBetween(a, b) {
    if (!a || !b || a.parent !== b.parent) return Infinity
    const grid = a.parent.grid
    const centre = t => t.object?.center ?? {
      x: t.x + (t.width * grid.size) / 2, y: t.y + (t.height * grid.size) / 2
    }
    return grid.measurePath([centre(a), centre(b)]).distance / (grid.distance || 1)
  }

  /** Users holding the key: the owners of the character who put it down. */
  static keyHolders(storage) {
    const creator = SR5_EntityHelpers.getRealActorFromID(storage?.system?.creatorId)
    if (!creator) return []
    return game.users.filter(u => !u.isGM && creator.testUserPermission(u, "OWNER")).map(u => u.id)
  }

  static hasKey(storage, user = game.user) {
    return user.isGM || SR5StorageLock.keyHolders(storage).includes(user.id)
  }

  /* -------------------------------------------- */
  /*  Rights follow the lock (active GM only)     */
  /* -------------------------------------------- */

  static registerHooks() {
    const sync = (actor, changes) => {
      if (actor.type !== "actorStorage" || !game.users.activeGM?.isSelf) return
      if (changes && !foundry.utils.hasProperty(changes, "system.lock")) return
      SR5StorageLock.syncOwnership(actor)
    }
    Hooks.on("createActor", actor => sync(actor))
    Hooks.on("updateActor", (actor, changes) => sync(actor, changes))
  }

  /** Bring the other players down to Limited while it is shut, and give them
   * back what they had once it is open. */
  static async syncOwnership(actor) {
    const saved = actor.getFlag("sr5", "lockOwnership")
    if (isLocked(actor)) {
      const gms = game.users.filter(u => u.isGM).map(u => u.id)
      const result = lockedOwnership(actor.ownership, [...SR5StorageLock.keyHolders(actor), ...gms])
      if (!Object.keys(result.saved).length) return
      await actor.update({
        ownership: result.ownership,
        "flags.sr5.lockOwnership": {
          ...(saved ?? {
          }), ...result.saved
        },
      })
    }
    else if (saved) {
      await actor.update({
        ownership: unlockedOwnership(actor.ownership, saved),
        "flags.sr5.-=lockOwnership": null,
      })
    }
  }

  /* -------------------------------------------- */
  /*  Player side                                 */
  /* -------------------------------------------- */

  /** The key holder opens or shuts it, without a test. */
  static async toggle(actor) {
    const storage = SR5StorageLock.base(actor)
    if (!storage?.system?.lock?.type || !SR5StorageLock.hasKey(storage)) return
    await storage.update({
      "system.lock.locked": !storage.system.lock.locked
    })
  }

  /**
   * Pick it open, or shut again what was picked open (the same test).
   * @param {Actor} actor the storage on the map, as its sheet holds it
   * @param {Actor} picker the character at work
   */
  static async requestPick(actor, picker, relock = false) {
    const storageToken = actor.token ?? actor.getActiveTokens(false, true)[0]
    const pickerToken = picker?.token ?? picker?.getActiveTokens(false, true)
      .find(t => t.parent?.id === storageToken?.parent?.id)
    // Said here, since the GM refuses it without a word
    if (!(SR5StorageLock.squaresBetween(storageToken, pickerToken) <= PICK_REACH)) {
      return ui.notifications.warn(game.i18n.localize("SR5.WARN_StorageLockTooFar"))
    }
    const data = {
      storageTokenUuid: storageToken.uuid, pickerTokenUuid: pickerToken.uuid, relock
    }
    if (game.user.isGM) return SR5StorageLock.pick(data, game.user.id)
    await SR5_SocketHandler.emitForGM("storageLockPick", data)
  }

  /** Hacking is the Matrix's business: say what it takes and warn the GM,
   * who opens the lock once the action succeeds (SR5 p. 239-240). */
  static async requestHack(actor, picker) {
    const storage = SR5StorageLock.base(actor)
    const content = game.i18n.format("SR5.StorageLockHackCard", {
      actor: picker?.name ?? game.user.name, storage: storage.name, rating: storage.system.lock.rating,
    })
    await ChatMessage.create({
      content, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id).concat(game.user.id),
    })
  }

  /* -------------------------------------------- */
  /*  GM side                                     */
  /* -------------------------------------------- */

  static async _socketPick(message, senderId) {
    if (!game.users.activeGM?.isSelf) return
    await SR5StorageLock.pick(message.data, senderId)
  }

  /** Check the request, roll the tests and open (or shut) the lock. */
  static async pick(data, senderId) {
    const storageToken = await fromUuid(data?.storageTokenUuid ?? "")
    const pickerToken = await fromUuid(data?.pickerTokenUuid ?? "")
    const storage = SR5StorageLock.base(storageToken?.actor)
    const picker = pickerToken?.actor
    const sender = game.users.get(senderId)
    const allowed = isPickRequestAllowed({
      storage, picker, relock: !!data.relock, reach: PICK_REACH,
      distance: SR5StorageLock.squaresBetween(storageToken, pickerToken),
      senderOwns: actor => !!sender && actor.testUserPermission(sender, "OWNER"),
    })
    if (!allowed) return SR5_SystemHelpers.srLog(1, `Lock pick refused for user '${senderId}'`, data)

    const tools = lockTools(picker.items, item => isStoredAway(item, picker))
    if (!tools.kit && game.settings.get("sr5", "sr5LockpickRequiresKit")) {
      return SR5StorageLock.#card(picker, storage, {
        noKit: true
      })
    }

    const lock = storage.system.lock
    const skill = picker.system.skills?.locksmith
    const pool = pickPool(skill, picker.system.attributes?.agility?.augmented?.value)
    const limit = pickLimit(skill?.limit?.value || picker.system.limits?.physicalLimit?.value, tools.autopicker)
    // No die, no test: Locksmith cannot be defaulted
    if (!pool) return SR5StorageLock.#card(picker, storage, {
      noPool: true
    })
    const rollDice = dice => SR5ShopAvailability.rollDice(dice)

    const stages = []
    let reached = true
    for (const stage of pickStages(lock)) {
      const result = await extendedTest(pool, stage.threshold, limit, rollDice)
      stages.push({
        ...stage, ...result, label: game.i18n.localize(`SR5.StorageLockStage_${stage.key}`)
      })
      if (!result.reached) {
        reached = false; break
      }
    }

    // The anti-tamper system: one more test, the alarm on a failure (SR5 p. 365)
    let alarm = false
    if (reached && !data.relock && lock.antiTamper > 0) {
      const roll = await rollDice(Math.min(pool, limit || pool))
      alarm = Math.min(roll.hits, limit || roll.hits) < lock.antiTamper || roll.criticalGlitch
    }

    if (reached) await storage.update({
      "system.lock.locked": !!data.relock
    })
    await SR5StorageLock.#card(picker, storage, {
      stages, reached, alarm, relock: !!data.relock, pool, limit, autopicker: tools.autopicker,
      turns: stages.reduce((n, s) => n + s.rolls, 0),
    })
  }

  /** The chat card of the attempt. The alarm only reaches the GM. */
  static async #card(picker, storage, result) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/sr5/templates/interface/storage-lock-card.hbs", {
        ...result, pickerName: picker.name, storageName: storage.name, lock: storage.system.lock,
      })
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({
        actor: picker
      }), content,
    })
    if (result.alarm) {
      await ChatMessage.create({
        content: game.i18n.format("SR5.StorageLockAlarm", {
          actor: picker.name, storage: storage.name
        }),
        whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      })
    }
  }
}
