import {
  SR5_RollMessage 
} from "./roll-message.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  readLedger, spiritSummoner
} from "../system/spirit-ledger.js"

export class SR5_RollTestHelper {

  //Handle when a test is aborted
  static handleCanceledTest(actor, dialogData){
    //If item have placed a canvas template before rolling the test (like grenade), remove it
    if (dialogData.dialogSwitch.templateRemove) SR5_RollMessage.removeTemplate(null, dialogData.itemUuid)
    //Remove last cumulative Defense if roll is cancelled.
    if (actor.flags?.sr5?.cumulativeDefense){
      actor.setFlag("sr5", "cumulativeDefense", (actor.flags.sr5.cumulativeDefense -1))
    }    
  }


  //SR5 p. 306: summoned and bound spirits have no Edge of their own, "l'invocateur peut dépenser sa propre réserve de
  //Chance pour les tests des esprits à son service" (decision H9 of DjamZ, which reverses G7). The magic pact of a free
  //spirit lets it spend its character's Edge too (Street Grimoire p. 133); the character is the summoner it keeps.
  //The summoner is the one the active GM wrote in the spirit ledger when he created the spirit, never the creatorId its
  //owner can rewrite; and only one the user rolling may write to, or the point spent would not be taken (Victoire)
  static edgeCharacter(actor, ledger = readLedger()){
    if (actor?.type !== "actorSpirit") return null
    //A free spirit is at no one's service: its own Edge, and its character's under a magic pact only
    if (actor.system?.isFree && !actor.system.magicPact) return null
    const summonerId = spiritSummoner(ledger, actor.id)
    const summoner = summonerId ? SR5_EntityHelpers.getRealActorFromID(summonerId) : null
    return summoner?.isOwner ? summoner : null
  }

  //True when the actor has a point of Edge left to spend
  static hasEdgeLeft(actor){
    return !!actor?.system?.specialAttributes?.edge && actor.system.conditionMonitors?.edge?.actual?.value < actor.system.specialAttributes.edge.augmented?.value
  }

  //Determine if current actor rolling test can use Edge on it
  static async canUseEdge(actor, dialogData){
    let canUseEdge = this.hasEdgeLeft(actor) || this.hasEdgeLeft(this.edgeCharacter(actor))
    if (dialogData.test.type === "objectResistance")  canUseEdge = false
    if (dialogData.test.type === "preparation")  canUseEdge = false
    return canUseEdge
  }

  //Handle the use of Edge : remove edge point from actor and add info to roll data
  static async handleEdgeUse(edgeActor, dialogData){
    dialogData.dicePool.modifiers.push({
      type: "edge", 
      label: game.i18n.localize("SR5.Edge"),
      value: edgeActor.system.specialAttributes.edge.augmented.value,
    })
    edgeActor.update({
      "system.conditionMonitors.edge.actual.base": edgeActor.system.conditionMonitors.edge.actual.base + 1
    })
    dialogData.edge.canUseEdge = false
    return dialogData
  }

  //Determine from whom actor edge must be reduce: their own first, then the summoner's for a spirit (SR5 p. 306)
  static async determineEdgeActor(actor){
    if (this.hasEdgeLeft(actor)) return actor
    const creator = this.edgeCharacter(actor)
    return this.hasEdgeLeft(creator) ? creator : actor
  }

  //Remove 1 edge from actor
  static async removeEdgeFromActor(messageData, actor) {
    const edgeActor = await this.determineEdgeActor(actor)
    if (edgeActor !== actor) {
      edgeActor.update({
        "system.conditionMonitors.edge.actual.base": edgeActor.system.conditionMonitors.edge.actual.base + 1
      })
    } else {
      //A spirit with no Edge of its own and no summoner to lend his has none to spend
      if (!actor.system.conditionMonitors?.edge) return
      //If actor is grunt, change actor to parent
      if (actor.isToken) actor = game.actors.get(actor.id)
      actor.update({
        "system.conditionMonitors.edge.actual.base": actor.system.conditionMonitors.edge.actual.base + 1 
      })
    }
  }

  //Iterate through roll dicepool modifiers and get the final dicePool
  static async handleDicePoolModifiers(dialogData){
    dialogData.dicePool.modifiersTotal = 0
    for (let key in dialogData.dicePool.modifiers){
      dialogData.dicePool.modifiersTotal += dialogData.dicePool.modifiers[key].value
      dialogData.dicePool.hasModifier = true
    }
    dialogData.dicePool.value = dialogData.dicePool.base + dialogData.dicePool.modifiersTotal
    //Debug DicePool can't be negative
    if (dialogData.dicePool.value < 0) dialogData.dicePool.value = 0
    return dialogData
  }

  //Iterate through roll limit modifiers and get the final limit
  static async handleLimitModifiers(dialogData){
    for (let key in dialogData.limit.modifiers){
      dialogData.limit.modifiersTotal += dialogData.limit.modifiers[key].value
      dialogData.limit.hasModifier = true
    }
    dialogData.limit.value = dialogData.limit.base + dialogData.limit.modifiersTotal
    //A Limit replaced by an effect (Eyes of the Pack, Street Grimoire p. 106) takes the place of every other
    if (dialogData.limit.replace !== undefined) dialogData.limit.value = dialogData.limit.replace
    //Debug limit can't be negative
    if (dialogData.limit.value < 0) dialogData.limit.value = 0
    return dialogData
  }

  // Update an item after a roll
  static async updateItemAfterRoll(cardData) {
    let item = await fromUuid(cardData.owner.itemUuid)
    let newItem = foundry.utils.duplicate(item)
    let firedAmmo = cardData.combat.ammo.fired
        
    //Discard for none supported item
    if (newItem.type === "itemKnowledge") return

    //update weapon ammo and fire Mode
    if (!firedAmmo) firedAmmo = 1
    if (newItem.type === "itemWeapon" && newItem.system.category === "rangedWeapon") {
      newItem.system.ammunition.value -= firedAmmo
      if (newItem.system.ammunition.value < 0) newItem.system.ammunition.value = 0
      //The sweep (FN) is never kept: the next attack picks its mode from its own targets
      if (cardData.combat.firingMode.selected !== "FN" && newItem.system.firingMode.current !== cardData.combat.firingMode.selected){
        newItem.system.firingMode.current = cardData.combat.firingMode.selected
      }
      if (newItem.system.choke.current !== cardData.combat.choke.selected){
        newItem.system.choke.current = cardData.combat.choke.selected
      }
    }
    //update force and hits
    if (newItem.type === "itemSpell" || newItem.type === "itemPreparation" || newItem.type === "itemAdeptPower") {
      newItem.system.hits = cardData.roll.hits
      newItem.system.force = cardData.magic.force
    }
    //update level and hits
    if (newItem.type === "itemComplexForm") {
      newItem.system.hits = cardData.roll.hits
      newItem.system.level = cardData.matrix.level
    }
    //Update net hits
    if (newItem.type === "itemRitual") {
      newItem.system.force = cardData.magic.force
      newItem.system.hits = cardData.roll.hits
      newItem.system.netHits = cardData.previousMessage.hits - cardData.roll.hits
      if (newItem.system.netHits < 0) newItem.system.netHits = 0
    }
    //updateCharge
    if (newItem.type === "itemGear"){
      newItem.system.charge -= 1
    }

        
    // Only the system fields the roll changed are written. The updateItem socket writes its info under
    // `system`: sent the whole document, it turned system.type into "itemWeapon" and the grenade launcher
    // lost its scatter (3D6 fell to 1D6, and the next shot offered Defend instead of Scatter).
    const changes = foundry.utils.diffObject(item.toObject().system, newItem.system)
    if (foundry.utils.isEmpty(changes)) return
    //Whoever owns the item writes it herself: compared with her assigned character, an unlinked token (its id is never
    //the character's) or a second actor she owns went to the GM, and without a GM the magazine did not move and the
    //spell kept no hits (S15, measured by Quitterie). Anyone else asks the GM, whose socket checks the sender
    if (game.user?.isGM || item.isOwner) item.update({
      system: changes
    })
    else SR5_SocketHandler.emitForGM("updateItem", {
      item: item.uuid,
      info: changes,
    })
  }
}