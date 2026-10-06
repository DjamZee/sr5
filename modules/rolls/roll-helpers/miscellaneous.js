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
  updateLedger
} from "../../system/gm-ledger.js"
import {
  ownsTarget, cardTrusted, matrixDamageAllowed, deactivateAllowed, reduceAllowed, supportEffectAllowed,
  serviceSpentAllowed, maglockAllowed, testAllowed, recountHits, consumedKey, REDUCER_POOLS, hitsUnderPush, edgeSpentOn
} from "./socket-guard.js"
import {
  linkedEntryOf, effectHits
} from "./dispel-rules.js"

// The cards already spent on a use and a target (Zélia's review, B3), written by the active GM
export const CONSUMED_CARDS = 'sr5ConsumedCards'

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
  // Security lot (Sixtine, ruled by DjamZ before the djamz.11; second round after Zélia's review): a GM
  // or an owner of the target writes as before; anyone else only one of the uses of socket-guard.js.
  // The use rests on the card the GM reads again from the chat log: the test the rule names, rolled by
  // the actor the rule names, its hits counted again on its dice within the pool the GM works out; a
  // card serves once per use and target; a card a player wrote is confirmed by the GM. Refused requests
  // are logged, never applied.

  static #pending = new Set()
  static #confirmations = new Map()

  /** The registry of spent cards, written by the active GM alone (Zélia's review, B3). */
  static registerSettings() {
    game.settings.register('sr5', CONSUMED_CARDS, {
      scope: 'world',
      config: false,
      type: Object,
      default: {
      },
    })
  }

  static #consumed() {
    try {
      return game.settings.get('sr5', CONSUMED_CARDS) ?? {
      }
    } catch {
      return {
      }
    }
  }

  /** Whether a card was spent on this use and target already, or is being spent. */
  static isConsumed(key) {
    return !!SR5_MiscellaneousHelpers.#consumed()[key] || SR5_MiscellaneousHelpers.#pending.has(key)
  }

  /** Spend a card on a use and a target: false when it was spent already. Nothing is awaited between
   * the test and the mark, so two requests arriving together cannot both pass; the write waits for the
   * others of the registry, so two uses of one card both stay written (gm-ledger.js). */
  static async consume(key) {
    if (SR5_MiscellaneousHelpers.isConsumed(key)) return false
    SR5_MiscellaneousHelpers.#pending.add(key)
    await updateLedger(CONSUMED_CARDS, ledger => ({
      ...ledger, [key]: Date.now()
    }))
    return true
  }

  /** At load, by the active GM: the registry had no ceiling (1.6 MB after 50 sessions of 300 cards, written whole at
   * every card spent). A key leaves only when its card is no longer in the chat log: "messageId|use|target" when no
   * message has that id (cardOf refuses a request without its card), "dice|…" when no card left shows those dice
   * (heal-ledger.js); any other key is kept. In the registry's turn, so a card spent meanwhile stays. */
  static async purgeConsumed() {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return false
    const {
      healCardDiceKey
    } = await import("../../system/heal-ledger.js")
    const liveDice = new Set()
    for (const message of game.messages?.values?.() ?? []) {
      const diceKey = message.flags?.sr5data ? healCardDiceKey(message.flags.sr5data) : null
      if (diceKey) liveDice.add(diceKey)
    }
    const gone = key => {
      if (key.startsWith("dice|")) return !liveDice.has(key.slice(0, key.lastIndexOf("|")))
      const messageId = key.split("|")[0]
      return /^[A-Za-z0-9]{16}$/.test(messageId) && !game.messages?.has?.(messageId)
    }
    return updateLedger(CONSUMED_CARDS, ledger => {
      const kept = Object.fromEntries(Object.entries(ledger).filter(([key]) => !gone(key)))
      return Object.keys(kept).length === Object.keys(ledger).length ? null : kept
    })
  }

  /** The card behind a request, as the chat log keeps it: null unless a GM wrote it or an owner of
   * the actor that rolled it. */
  static cardOf(messageId) {
    const message = messageId ? game.messages?.get(messageId) : null
    const data = message?.flags?.sr5data
    if (!data) return null
    const roller = SR5_EntityHelpers.getRealActorFromID(data.owner?.actorId, data.actorUuids)
    const author = message.author
    if (!cardTrusted(author, !!roller && !!author && roller.testUserPermission(author, "OWNER"))) return null
    return {
      id: message.id, data, roller, author, byGM: !!author?.isGM
    }
  }

  /** The most dice a test may roll, from the roller's sheet: the pool of that test, plus Chance. */
  static poolCap(roller, path) {
    const pool = Number(foundry.utils.getProperty(roller?.system ?? {
    }, path)) || 0
    return pool + (Number(roller?.system?.specialAttributes?.edge?.augmented?.value) || 0)
  }

  /** The hits of a card the GM stands by, the push of the limit counted only when the roller's sheet shows Edge spent
   * (hitsUnderPush, SR5 p. 58): a GM's card as written. null when a player's card shows no dice. */
  static pushAwareHits(card, path, limit = 0) {
    if (card.byGM) return Math.max(0, Number(card.data.roll?.hits) || 0)
    const pool = Number(foundry.utils.getProperty(card.roller?.system ?? {
    }, path)) || 0
    const pushed = !!card.data.edge?.hasUsedPushTheLimit && edgeSpentOn(card.roller)
    const counted = hitsUnderPush({
      rollJSON: card.data.roll?.r, pool, edge: Number(card.roller?.system?.specialAttributes?.edge?.augmented?.value) || 0, limit, pushed,
    })
    return counted === null ? null : Math.min(counted, Math.max(0, Number(card.data.roll?.hits) || 0))
  }

  /** The hits of a card the GM stands by: a GM's card as written, a player's counted again on its dice
   * within the pool at `path` (null when it shows no dice). */
  static hitsOf(card, path) {
    if (card.byGM) return Math.max(0, Number(card.data.roll?.hits) || 0)
    return recountHits(card.data.roll?.r, path === null ? Infinity : SR5_MiscellaneousHelpers.poolCap(card.roller, path))
  }

  static #refuse(kind, senderId, data) {
    SR5_SystemHelpers.srLog(1, `Socket ${kind} refused from ${game.users.get(senderId)?.name ?? senderId}`, data)
    return false
  }

  /**
   * A use the checks let through: the GM confirms a card a player wrote (once per card), then the card
   * is spent on it. Replaced in the tests.
   * @param {object} use {card, key, label, target, value}
   * @param {User} sender who asks
   */
  static async grant(use, sender) {
    if (!use.card.byGM) {
      let asked = SR5_MiscellaneousHelpers.#confirmations.get(use.card.id)
      if (!asked) {
        asked = SR5_MiscellaneousHelpers.confirmUse(use, sender)
        SR5_MiscellaneousHelpers.#confirmations.set(use.card.id, asked)
      }
      if (!(await asked)) return false
    }
    return SR5_MiscellaneousHelpers.consume(use.key)
  }

  /** The GM's say on a card a player wrote. */
  static async confirmUse(use, sender) {
    const esc = foundry.utils.escapeHTML
    return foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize('SR5.SocketUseConfirmTitle')
      },
      content: `<p>${game.i18n.format('SR5.SocketUseConfirm', {
        user: esc(sender?.name ?? '?'), what: esc(game.i18n.format(`SR5.SocketUse_${use.label}`, {
          target: use.target ?? ''
        })), value: use.value ?? '',
      })}</p>`,
      rejectClose: false,
    })
  }

  //Socket for updating an actor
  static async _socketUpdateActorData(message, senderId) {
    const sender = game.users.get(senderId)
    const data = message?.data ?? {
    }
    let actor = SR5_EntityHelpers.getRealActorFromID(data.actorId, data.actorUuids)
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
      //summoner, the actor holding the item this spirit was called from. Read by the spirit's creator:
      //a duplicated character carries the same item ids
      const creatorItemId = actor.system?.creatorItemId
      const creator = creatorItemId ? SR5_EntityHelpers.getRealActorFromID(actor.system?.creatorId) : null
      const summoner = creator?.items?.get(creatorItemId) ? creator : null
      allowed = !!summoner?.testUserPermission(sender, "OWNER") &&
        serviceSpentAllowed(changes, actor._source?.system?.services?.value)
    } else if (data.use === "maglock") {
      const use = SR5_MiscellaneousHelpers.maglockUse(data, actor, changes)
      allowed = !!use && await SR5_MiscellaneousHelpers.grant(use, sender)
    }
    if (!allowed) return SR5_MiscellaneousHelpers.#refuse("updateActorData", senderId, data)
    await actor.update({
      'system': changes
    })
    return true
  }

  /** A maglock opened by a Locksmith test (SR5 p. 365) of the card's picker, aimed at this lock. */
  static maglockUse(data, actor, changes) {
    const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
    if (!card || !testAllowed("maglock", card.data.test)) return null
    if (SR5_EntityHelpers.getRealActorFromID(card.data.target?.actorId, card.data.actorUuids) !== actor) return null
    const hits = SR5_MiscellaneousHelpers.hitsOf(card, "skills.locksmith.test.dicePool")
    if (hits === null || hits < Math.max(1, Number(card.data.threshold?.value) || 1)) return null
    if (!maglockAllowed(changes, actor._source?.system?.maglock)) return null
    return {
      card, key: consumedKey(card.id, "maglock", `${actor.uuid}.${Object.keys(changes.maglock).sort().join(",")}`),
      label: "maglock", target: actor.name, value: hits,
    }
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
    if (!ownsTarget(sender, target)) {
      const use = await SR5_MiscellaneousHelpers.itemUse(data, target, changes)
      if (!use || !(await SR5_MiscellaneousHelpers.grant(use, sender))) {
        return SR5_MiscellaneousHelpers.#refuse("updateItem", senderId, data)
      }
    }
    await target.update({
      'system': changes
    })
    //The button the player's browser left for the GM is spent once the damage is written (Hyacinthe's review, D5)
    if (data.use === "matrixDamage" && data.button) {
      const {
        spendRelayedButton
      } = await import("./matrix-card.js")
      await spendRelayedButton(data.messageId, data.button)
    }
    return true
  }

  /** A use of updateItem on an item the sender does not own, checked against its card: null if refused. */
  static async itemUse(data, item, changes) {
    const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
    if (!card || !testAllowed(data.use, card.data.test)) return null
    const stored = item._source?.system ?? {
    }
    if (data.use === "matrixDamage") {
      const damage = SR5_MiscellaneousHelpers.matrixDamageOf(card, item)
      if (!(damage > 0)) return null
      const size = Number(item.system?.conditionMonitors?.matrix?.value) || 0
      // One more for a virtual machine on the device (SR5 p. 247)
      if (!matrixDamageAllowed(changes, stored, size, damage + 1)) return null
      return {
        card, key: consumedKey(card.id, "matrixDamage"), label: "matrixDamage", target: item.name, value: damage,
      }
    }
    if (data.use === "deactivateFocus") {
      if (card.data.target?.itemUuid !== item.uuid || !deactivateAllowed(changes)) return null
      const net = SR5_MiscellaneousHelpers.reducerNetHits(card)
      if (!(net > 0)) return null
      return {
        card, key: consumedKey(card.id, "deactivateFocus", item.uuid), label: "deactivateFocus", target: item.name, value: net,
      }
    }
    if (data.use === "reduceEffect") {
      const reduced = await SR5_MiscellaneousHelpers.#reducedBy(card)
      if (!reduced) return null
      let allowed = false
      if (reduced.item === item) allowed = reduceAllowed(changes, stored, reduced.netHits, false, reduced.key)
      //An effect the reduced item holds up: its value goes no further than its source entry and the net hits the GM
      //worked out give (dispelledValue), never by what the player's browser computed
      else if (reduced.held.includes(item.uuid)) {
        const entry = linkedEntryOf(reduced.item._source?.system ?? reduced.item.system, stored, item.flags?.sr5?.sourceEntry,
          k => SR5_EntityHelpers.getLabelByKey(k))
        //The hits it stands on, from the flags written when it was applied (the GM, the target not being the sender's)
        //and the spell's stored hits: never above the true ones, even if the spell was lowered first
        const hits = effectHits(item.flags?.sr5, (reduced.item._source?.system ?? reduced.item.system)?.hits)
        allowed = reduceAllowed(changes, stored, reduced.netHits, true, "hits", entry, hits)
      }
      if (!allowed) return null
      return {
        card, key: consumedKey(card.id, "reduceEffect", item.uuid), label: "reduceEffect", target: reduced.item.name, value: reduced.netHits,
      }
    }
    return null
  }

  /**
   * The boxes a matrix card may fill on this device, or 0. A defender who wins (matrixDefense) hurts
   * the ATTACKER of the card it answers (Zélia's review, B1): his net hits, counted again on his dice
   * within his defense pool, over the attacker's hits. A resistance (or a defense against ICE or a
   * complex form) hurts the actor who rolled it, on the device the card names.
   */
  static matrixDamageOf(card, item) {
    const holder = item.parent
    const claimed = Math.max(0, Number(card.data.damage?.matrix?.value) || 0)
    if (card.data.test?.type === "matrixDefense") {
      const attacker = SR5_EntityHelpers.getRealActorFromID(card.data.previousMessage?.actorId, card.data.actorUuids)
      if (!holder || holder !== attacker) return 0
      if (card.byGM) return claimed
      const attack = SR5_MiscellaneousHelpers.cardOf(card.data.previousMessage?.messageId)
      if (!attack || attack.roller !== attacker) return 0
      //The attack this defense answers, same action (Hyacinthe's review, D3); the Rule of Six only for a push the sheet
      //shows Edge spent for, within the test's limit otherwise (D1, SR5 p. 58). The GM confirms the boxes after this
      const typeSub = attack.data.test?.typeSub
      if (attack.data.test?.type !== "matrixAction" || !typeSub || card.data.test?.typeSub !== typeSub) return 0
      const attackHits = SR5_MiscellaneousHelpers.pushAwareHits(attack, `matrix.actions.${typeSub}.test.dicePool`,
        Number(attack.roller?.system?.matrix?.actions?.[typeSub]?.limit?.value) || 0)
      const defenseHits = SR5_MiscellaneousHelpers.pushAwareHits(card, `matrix.actions.${typeSub}.defense.dicePool`, 0)
      if (attackHits === null || defenseHits === null) return 0
      return Math.min(claimed, Math.max(0, defenseHits - attackHits))
    }
    if (!holder || holder !== card.roller) return 0
    if (card.data.target?.itemUuid && card.data.target.itemUuid !== item.uuid) return 0
    return claimed
  }

  /**
   * The net hits of a reducing card (the resistance of a spell, focus, preparation or complex form): the
   * hits of the test it answers, by the same actor and on the same item, counted again within his pool,
   * over the hits of the resistance. null when the cards do not hold together.
   */
  static reducerNetHits(card) {
    const reducer = SR5_MiscellaneousHelpers.cardOf(card.data.previousMessage?.messageId)
    if (!reducer || reducer.roller !== card.roller) return null
    if (reducer.data.target?.itemUuid !== card.data.target?.itemUuid) return null
    const path = REDUCER_POOLS[reducer.data.test?.typeSub]
    if (!path) return null
    const reducerHits = SR5_MiscellaneousHelpers.hitsOf(reducer, path)
    const resisted = SR5_MiscellaneousHelpers.hitsOf(card, null)
    if (reducerHits === null || resisted === null) return null
    return Math.max(0, reducerHits - resisted)
  }

  /** The item a reducing card aims at, what it holds up, and the net hits the card may take away. */
  static async #reducedBy(card) {
    if (!card.data.target?.itemUuid) return null
    const netHits = SR5_MiscellaneousHelpers.reducerNetHits(card)
    if (!(netHits > 0)) return null
    let item = null
    try {
      item = await fromUuid(card.data.target.itemUuid)
    } catch {
      item = null
    }
    if (!item) return null
    return {
      item, netHits,
      key: item.type === "itemPreparation" ? "potency" : "hits",
      held: Array.isArray(item._source?.system?.targetOfEffect) ? item._source.system.targetOfEffect : [],
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
      const use = SR5_MiscellaneousHelpers.supportUse(data, actor, replace)
      if (!use || !(await SR5_MiscellaneousHelpers.grant(use, sender))) {
        return SR5_MiscellaneousHelpers.#refuse("createItemEffect", senderId, data)
      }
    }
    if (replace.length) await actor.deleteEmbeddedDocuments("Item", replace)
    await actor.createEmbeddedDocuments("Item", [data.effect])
    return true
  }

  /** A Kill Code support effect (I Am the Firewall, Intervene) of the hacker who rolled the card. */
  static supportUse(data, actor, replace) {
    const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
    if (!card || !testAllowed("support", card.data.test)) return null
    const type = foundry.utils.getProperty(foundry.utils.expandObject(data.effect ?? {
    }), "system.type")
    if (card.data.test.typeSub !== type) return null
    const hits = SR5_MiscellaneousHelpers.hitsOf(card, `matrix.actions.${type}.test.dicePool`)
    if (hits === null || !supportEffectAllowed(data.effect, card.roller?.id, hits, replace.map(id => actor.items.get(id)))) return null
    return {
      card, key: consumedKey(card.id, "support", actor.uuid), label: "support", target: actor.name, value: hits,
    }
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
      const reduced = card && testAllowed("dispelledEffect", card.data.test) ? await SR5_MiscellaneousHelpers.#reducedBy(card) : null
      const left = (Number(reduced?.item?._source?.system?.[reduced?.key]) || 0) - (reduced?.netHits ?? 0)
      const allowed = !!reduced && item.type === "itemEffect" && reduced.held.includes(item.uuid) && left <= 0 &&
        await SR5_MiscellaneousHelpers.grant({
          card, key: consumedKey(card.id, "dispelledEffect", item.uuid), label: "dispelledEffect", target: item.name, value: reduced.netHits,
        }, sender)
      if (!allowed) return SR5_MiscellaneousHelpers.#refuse("deleteItem", senderId, data)
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
      current: available?.[type]?.current ?? 0, value: available?.[type]?.value
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
      //The counters before this action: what is left of the extra actions is read on them, not on the pass
      const simpleBefore = Number(simple?.current) || 0, complexBefore = Number(complex?.current) || 0
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
      //Extra actions granted by an effect, beyond the two simple ≡ one complex of the pass: spent first, and
      //never lost with the linked action (ruling of DjamZ, 2026-10-06, G12). What is left of them is read on the
      //counters before this action (simple actions the complex ones left cannot pair with), capped by what the
      //effect grants: an extra action already spent is not given again (Rosine's review)
      //Granted: beyond the two simple or one complex of an ordinary phase (SR5 p. 164)
      const grantedSimple = Math.max(0, (Number(simple.value) || 0) - 2)
      const grantedComplex = Math.max(0, (Number(complex.value) || 0) - 1)
      const extraSimple = Math.min(grantedSimple, Math.max(0, simpleBefore - 2 * complexBefore))
      const extraComplex = Math.min(grantedComplex, Math.max(0, complexBefore - Math.floor(simpleBefore / 2)))
      //An extra action pays for itself: the linked counter is left alone
      if (a.type === "simple" && extraSimple > 0) continue
      if (a.type === "complex" && extraComplex > 0) continue
      if (a.type === "simple") complex.current = Math.min(complex.current, Math.max(0, Math.floor(simple.current / 2)) + extraComplex)
      if (a.type === "complex") simple.current = Math.min(simple.current, Math.max(0, 2 * complex.current) + extraSimple)
    }
    return available
  }

  //A change of setting made in the roll dialog (firing mode, choke): one simple action, free with a wireless smartgun
  //(SR5 p. 166, 182, 427, 435). It joins the actions of the roll, spent when the roll is made, and leaves the list
  //when the setting goes back to the saved one: closing the dialog without rolling spends nothing
  static setChangeAction(actions, source, changed, free){
    actions = SR5_MiscellaneousHelpers.removeActions(actions ?? [], source)
    if (!changed) return actions
    return SR5_MiscellaneousHelpers.addActions(actions, {
      type: free ? "free" : "simple", value: 1, source
    })
  }

  //A change of setting spent as a simple action is a simple action that does not fire: it ends the progressive
  //recoil before the shot of the same roll (SR5 p. 178). Free with a smartgun, it does not
  static changeEndsRecoil(actions){
    return !!actions?.some(a => (a.source === "changeFiringMode" || a.source === "changeChokeSettings") && a.type !== "free")
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