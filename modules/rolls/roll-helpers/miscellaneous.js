import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  ownsTarget, cardTrusted, bounded, matrixDamageAllowed, deactivateAllowed, reduceAllowed, supportEffectAllowed,
  serviceSpentAllowed, maglockAllowed
} from "./socket-guard.js"

export class SR5_MiscellaneousHelpers {
  /** Update an actor with given data
     * @param {string} actorId - Target actor's ID
     * @param {string} path - Path to the key, without 'system'
     * @param {number} value - The new value
     * @param {boolean} boolean - If the value to change is a boolean, default = false
     */
  static async updateActorData(actorId, path, value, boolean = false, card = {
  }){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    if (!actor) return
    //Only the field changed is sent: the whole prepared system used to be written back
    const next = boolean ? !foundry.utils.getProperty(actor.system, path) : value
    const dataToUpdate = foundry.utils.expandObject({
      [path]: next
    })

    //update actor
    if (!game.user?.isGM) {
      await SR5_SocketHandler.emitForGM("updateActorData", {
        actorId: actorId,
        dataToUpdate,
        use: card.use, messageId: card.messageId,
      })
    } else await actor.update({
      "system": dataToUpdate
    })
  }

  /* -------------------------------------------- */
  /*  The generic sockets, on the GM's browser     */
  /* -------------------------------------------- */
  // Security lot (Sixtine, ruled by DjamZ before the djamz.11): a GM or an owner of the target writes
  // as before; anyone else only one of the uses of socket-guard.js, the effect of a card the GM reads
  // again from the chat log, bounded by the sheet. Refused requests are logged, never applied.

  /** The card behind a request, as the chat log keeps it: null unless a GM wrote it or an owner of
   * the actor that rolled it. */
  static cardOf(messageId) {
    const message = messageId ? game.messages?.get(messageId) : null
    const data = message?.flags?.sr5data
    if (!data) return null
    const roller = SR5_EntityHelpers.getRealActorFromID(data.owner?.actorId)
    const author = message.author
    if (!cardTrusted(author, !!roller && !!author && roller.testUserPermission(author, "OWNER"))) return null
    return {
      data, roller
    }
  }

  /** The most hits a card may count, from the roller's sheet: the pool of that test, plus Chance. */
  static poolCap(roller, path) {
    const pool = Number(foundry.utils.getProperty(roller?.system ?? {
    }, path)) || 0
    return pool + (Number(roller?.system?.specialAttributes?.edge?.augmented?.value) || 0)
  }

  static #refuse(kind, senderId, data) {
    SR5_SystemHelpers.srLog(1, `Socket ${kind} refused from ${game.users.get(senderId)?.name ?? senderId}`, data)
    return false
  }

  //Socket for updating an actor
  static async _socketUpdateActorData(message, senderId) {
    const sender = game.users.get(senderId)
    const data = message?.data ?? {
    }
    let actor = SR5_EntityHelpers.getRealActorFromID(data.actorId)
    if (!actor || !sender) return false
    if (ownsTarget(sender, actor)) {
      await actor.update({
        'system': data.dataToUpdate
      })
      return true
    }
    const changes = foundry.utils.diffObject(actor.toObject().system, data.dataToUpdate ?? {
    })
    if (foundry.utils.isEmpty(changes)) return false
    let allowed = false
    if (data.use === "spiritService") {
      //No card: the service is spent as the summoner's test is rolled. The sender must own the
      //summoner, the actor holding the item this spirit was called from
      const creatorId = actor.system?.creatorItemId
      const summoner = creatorId ? game.actors.find(a => a.items.get(creatorId)) : null
      allowed = !!summoner?.testUserPermission(sender, "OWNER") &&
        serviceSpentAllowed(changes, actor._source?.system?.services?.value)
    } else if (data.use === "maglock") {
      const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
      allowed = !!card && SR5_EntityHelpers.getRealActorFromID(card.data.target?.actorId) === actor &&
        maglockAllowed(changes, actor._source?.system?.maglock)
    }
    if (!allowed) return SR5_MiscellaneousHelpers.#refuse("updateActorData", senderId, data)
    await actor.update({
      'system': changes
    })
    return true
  }

  //Socket for updating an item
  static async _socketUpdateItem(message, senderId) {
    const sender = game.users.get(senderId)
    const data = message?.data ?? {
    }
    let target = await fromUuid(data.item ?? "")
    if (!target || !sender) return false
    // info is a system object: only the fields that differ from the stored ones are written, so a
    // caller sending its whole (prepared) system cannot overwrite what it did not change
    const changes = foundry.utils.diffObject(target.toObject().system, data.info ?? {
    })
    if (foundry.utils.isEmpty(changes)) return false
    if (!ownsTarget(sender, target) && !(await SR5_MiscellaneousHelpers.itemUseAllowed(data, target, changes))) {
      return SR5_MiscellaneousHelpers.#refuse("updateItem", senderId, data)
    }
    await target.update({
      'system': changes
    })
    return true
  }

  /** A use of updateItem on an item the sender does not own, checked against its card. */
  static async itemUseAllowed(data, item, changes) {
    const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
    if (!card) return false
    const stored = item._source?.system ?? {
    }
    const cardData = card.data
    if (data.use === "matrixDamage") {
      //The device belongs to an actor of the card: who rolled it, whom it answers, or whom it aims at
      const holder = item.parent
      const actors = [cardData.owner?.actorId, cardData.previousMessage?.actorId, cardData.target?.actorId]
        .map(id => id ? SR5_EntityHelpers.getRealActorFromID(id) : null)
      if (!holder || !actors.includes(holder)) return false
      if (cardData.target?.itemUuid && cardData.target.itemUuid !== item.uuid) return false
      const damage = Math.max(0, Number(cardData.damage?.matrix?.value) || 0) + 1
      return matrixDamageAllowed(changes, stored, Number(item.system?.conditionMonitors?.matrix?.value) || 0, damage)
    }
    if (data.use === "deactivateFocus") {
      return cardData.test?.type === "enchantmentResistance" && cardData.target?.itemUuid === item.uuid && deactivateAllowed(changes)
    }
    if (data.use === "reduceEffect") {
      const reduced = await SR5_MiscellaneousHelpers.#reducedBy(cardData, card.roller)
      if (!reduced) return false
      if (reduced.item === item) return reduceAllowed(changes, stored, reduced.netHits, false, reduced.key)
      //An effect the reduced item holds up
      const held = Array.isArray(reduced.item._source?.system?.targetOfEffect) ? reduced.item._source.system.targetOfEffect : []
      return held.includes(item.uuid) && reduceAllowed(changes, stored, reduced.netHits, true)
    }
    return false
  }

  /** The item a reducing card aims at, and the net hits it may take away, bounded by the roller's pool. */
  static async #reducedBy(cardData, roller) {
    const pools = {
      dispellResistance: "skills.counterspelling.test.dicePool",
      enchantmentResistance: "skills.disenchanting.test.dicePool",
      disjointingResistance: "skills.disenchanting.test.dicePool",
      complexFormResistance: "matrix.resonanceActions.killComplexForm.test.dicePool",
    }
    const path = pools[cardData.test?.type]
    if (!path || !cardData.target?.itemUuid) return null
    let item = null
    try {
      item = await fromUuid(cardData.target.itemUuid)
    } catch {
      item = null
    }
    if (!item) return null
    return {
      item,
      key: item.type === "itemPreparation" ? "potency" : "hits",
      netHits: bounded(cardData.roll?.netHits, SR5_MiscellaneousHelpers.poolCap(roller, path)),
    }
  }

  //Socket for creating an effect on an actor the player does not own (matrix support actions)
  static async _socketCreateItemEffect(message, senderId){
    const sender = game.users.get(senderId)
    const data = message?.data ?? {
    }
    let actor = await fromUuid(data.actorId ?? "")
    if (!actor || !sender) return false
    const replace = Array.isArray(data.replace) ? data.replace : []
    if (!ownsTarget(sender, actor)) {
      const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
      const type = foundry.utils.getProperty(foundry.utils.expandObject(data.effect ?? {
      }), "system.type")
      const hits = card ? bounded(card.data.roll?.hits,
        SR5_MiscellaneousHelpers.poolCap(card.roller, `matrix.actions.${type}.test.dicePool`)) : 0
      const hackerId = card?.roller?.id
      if (!card || card.data.test?.typeSub !== type ||
        !supportEffectAllowed(data.effect, hackerId, hits, replace.map(id => actor.items.get(id)))) {
        return SR5_MiscellaneousHelpers.#refuse("createItemEffect", senderId, data)
      }
    }
    if (replace.length) await actor.deleteEmbeddedDocuments("Item", replace)
    await actor.createEmbeddedDocuments("Item", [data.effect])
    return true
  }

  //Socket for deleting an item
  static async _socketDeleteItem(message, senderId){
    const sender = game.users.get(senderId)
    const data = message?.data ?? {
    }
    let item = await fromUuid(data.item ?? "")
    if (!item || !sender) return false
    if (!ownsTarget(sender, item)) {
      //An effect held up by a spell the card brings to nothing (SR5 p. 299)
      const card = data.use === "dispelledEffect" ? SR5_MiscellaneousHelpers.cardOf(data.messageId) : null
      const reduced = card ? await SR5_MiscellaneousHelpers.#reducedBy(card.data, card.roller) : null
      const held = reduced?.item?._source?.system?.targetOfEffect ?? []
      const left = (Number(reduced?.item?._source?.system?.[reduced?.key]) || 0) - (reduced?.netHits ?? 0)
      if (!reduced || item.type !== "itemEffect" || !held.includes(item.uuid) || left > 0) {
        return SR5_MiscellaneousHelpers.#refuse("deleteItem", senderId, data)
      }
    }
    await item.delete()
    return true
  }

  static findMedkitRating(actor){
    let medkit = {
    }
    let item = actor.items.find(i => i.system.isMedkit)
    if (item && item.system.charge > 0){
      medkit.rating = item.system.itemRating
      medkit.uuid = item.uuid
      return medkit
    }
  }

  //Add an action to actions array, removing foundry.utils.duplicated source
  static addActions(actions, actionToAdd){
    //An unknown firing mode converts to no action: never let it into the array, readers expect action.type
    if (!actionToAdd) return actions
    if (!actions.length) actions.push(actionToAdd)
    else {
      if (actions.find(a => a.source === actionToAdd.source)) {
        actions = actions.filter(a => a.source !== actionToAdd.source)
        actions.push(actionToAdd)
      } else {
        actions.push(actionToAdd)
      }
    }
    return actions
  }

  //SR5 p. 164-165: per initiative pass, one free action, and two simple or one complex. Returns the first
  //kind of action the list asks for beyond what is left ({type, value, current}), or null. Manual adjustments,
  //interruptions (paid in initiative) and special actions are not counted
  static missingAction(actions, available){
    let left = {
    }
    for (let type of ["free", "simple", "complex"]) left[type] = {
      current: available?.[type]?.current ?? 0
    }
    let needed = {
    }
    for (let a of actions ?? []){
      if (!a || a.source === "manual" || !["free", "simple", "complex"].includes(a.type) || !(a.value > 0)) continue
      needed[a.type] = (needed[a.type] ?? 0) + a.value
      if (a.value > left[a.type].current) return {
        type: a.type, value: needed[a.type], current: available?.[a.type]?.current ?? 0
      }
      SR5_MiscellaneousHelpers.spendActions(left, [a])
    }
    return null
  }

  //SR5 p. 162 and 164: a simple or complex action belongs to the character's own action phase, and a score of 0
  //or less leaves only a free action. Returns "noInitiative", "outOfPhase" or null. Free actions, interruptions
  //(p. 170, checked against their cost elsewhere) and manual adjustments are not concerned
  static actionPhaseProblem(actions, {
    initiative, isCurrent
  }){
    let phaseAction = (actions ?? []).some(a => a && a.source !== "manual" && ["simple", "complex"].includes(a.type) && a.value > 0)
    if (!phaseAction) return null
    if (typeof initiative === "number" && initiative <= 0) return "noInitiative"
    if (!isCurrent) return "outOfPhase"
    return null
  }

  //True when a combat is running and the character's action phase is not the current one. A skill test asked
  //then can only be a reaction called by the gamemaster (SR5 p. 164: one acts in one's own phase): no action
  static isOutOfPhase(actor){
    let combat = globalThis.game?.combat
    if (!actor || !combat?.started) return false
    let combatant = actor.isToken ? combat.combatants.find(c => c.tokenId === actor.token?.id) : combat.combatants.find(c => c.actorId === actor.id)
    if (!combatant || combatant.initiative === null || combatant.initiative === undefined) return false
    return combat.combatant?.id !== combatant.id
  }

  //SR5 p. 170: each interruption action lowers the Initiative score by its own cost, 5 unless stated otherwise
  //(10 for a Watchdog Haywire or Popup, Kill Code p. 45). Several interruptions in one list add up
  static interruptionInitiativeCost(actions){
    let cost = 0
    for (let a of actions ?? []) if (a?.type === "interruption") cost += (a.initiativeCost || 5)
    return cost
  }

  //SR5 p. 164: two simple actions OR one complex action per action phase. Takes the actions off the counters
  //(mutated in place) and keeps the two linked: a simple action spent leaves no complex one, a complex action
  //leaves no simple one. Manual adjustments touch only their own counter; the other types are taken off as is
  static spendActions(available, actions){
    for (let a of actions ?? []){
      if (!a || !available?.[a.type] || typeof a.value !== "number") continue
      let simple = available.simple, complex = available.complex
      available[a.type].current -= a.value
      //A refund never gives more than the pass grants (p. 164): the setting may have been changed in an
      //earlier pass, with the dialog left open, so the action refunded was never spent in this one
      const cap = (counter) => {
        if (counter && typeof counter.value === "number") counter.current = Math.min(counter.current, counter.value)
      }
      if (a.value < 0 && a.source !== "manual") cap(available[a.type])
      if (a.source === "manual" || !a.value || !simple || !complex) continue
      //A refunded action (negative value, e.g. a choke setting put back) gives the linked one back too
      if (a.value < 0){
        if (a.type === "simple") complex.current = Math.max(complex.current, Math.floor(simple.current / 2))
        if (a.type === "complex") simple.current = Math.max(simple.current, 2 * complex.current)
        cap(simple)
        cap(complex)
        continue
      }
      if (a.type === "simple") complex.current = Math.min(complex.current, Math.max(0, Math.floor(simple.current / 2)))
      if (a.type === "complex") simple.current = Math.min(simple.current, Math.max(0, 2 * complex.current))
    }
    return available
  }

  //Remove an action from array
  static removeActions(actions, actionToRemove){
    if (!actions.length) return actions
    if (actions.find(a => a.source === actionToRemove)) return actions = actions.filter(a => a.source !== actionToRemove)
    else return actions
  }

  /**
     *Remove one element of an Array based on key / value
    @param {arr} array the source array
    @param {key} string the key to check
    @param {value} string the targeted value
    */
  static removeElementFromArray(arr, key, value) {
    const index = arr.findIndex((element) => element[key] === value)
    if (index !== -1) {
      arr.splice(index, 1)
    }
  }

  /**
     *Which distance modifier a prone defender gets: "close" (5 m or less), "far" (20 m or more), or null.
     *Only a measured distance counts. A shot with no target, or from an actor with no token, has no distance:
     *it is NaN on the attack and turns into null once the chat card stores it as JSON, and null <= 5 is true,
     *so without this check a prone defender took the close-range penalty against a shot that was never measured.
    @param {rangeInMeters} number the attacker's distance, as carried by the chat card
    */
  static proneDefenseRange(rangeInMeters) {
    if (!Number.isFinite(rangeInMeters)) return null
    if (rangeInMeters <= 5) return "close"
    if (rangeInMeters >= 20) return "far"
    return null
  }
}