import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler 
} from "../../socket.js"

export class SR5_MiscellaneousHelpers {
  /** Update an actor with given data
     * @param {string} actorId - Target actor's ID
     * @param {string} path - Path to the key, without 'system'
     * @param {number} value - The new value
     * @param {boolean} boolean - If the value to change is a boolean, default = false
     */
  static async updateActorData(actorId, path, value, boolean = false){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    if (!actor) return
    let actorData = foundry.utils.duplicate(actor.system)

    //change value
    if (boolean) {
      let oldvalue = path.split('.').reduce((previous, current) => previous[current], actorData)
      foundry.utils.mergeObject(actorData, {
        [path]: !oldvalue
      })
    } else foundry.utils.mergeObject(actorData, {
      [path]: value
    })

    //update actor
    if (!game.user?.isGM) {
      await SR5_SocketHandler.emitForGM("updateActorData", {
        actorId: actorId,
        dataToUpdate: actorData,
      })
    } else await actor.update({
      "system": actorData
    })
  }

  //Socket for updating an actor
  static async _socketUpdateActorData(message) {
    let actor = SR5_EntityHelpers.getRealActorFromID(message.data.actorId)
    await actor.update({
      'system': message.data.dataToUpdate
    })
  }

  //Socket for updating an item
  static async _socketUpdateItem(message) {
    let target = await fromUuid(message.data.item)
    if (!target) return
    // info is a system object: only the fields that differ from the stored ones are written, so a
    // caller sending its whole (prepared) system cannot overwrite what it did not change
    const changes = foundry.utils.diffObject(target.toObject().system, message.data.info ?? {
    })
    if (foundry.utils.isEmpty(changes)) return
    await target.update({
      'system': changes
    })
  }

  //Socket for creating an effect on an actor the player does not own (matrix support actions)
  static async _socketCreateItemEffect(message){
    let actor = await fromUuid(message.data.actorId)
    if (!actor) return
    if (message.data.replace?.length) await actor.deleteEmbeddedDocuments("Item", message.data.replace)
    await actor.createEmbeddedDocuments("Item", [message.data.effect])
  }

  //Socket for deleting an item
  static async _socketDeleteItem(message){
    let item = await fromUuid(message.data.item)
    await item.delete()
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