import {
  SR5_SystemHelpers 
} from "../system/utilitySystem.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_RollMessage 
} from "./roll-message.js"
import {
  SR5_RollTestHelper 
} from "./roll-test-helper.js"
import * as SR5_AddRollInfo from "./roll-test-case/index.js"
import {
  SR5Combat 
} from "../system/srcombat.js"
import SR5_RollDialog from "./roll-dialog.js"
import {
  isRecoilCarriedOver, buildsProgressiveRecoil
} from "./roll-helpers/recoil.js"
import {
  SR5_ConverterHelpers 
} from "./roll-helpers/converter.js"
import {
  SR5_CombatHelpers
} from "./roll-helpers/combat.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"

export class SR5_RollTest {
  //Prepare the roll window
  static async generateRollDialog(dialogData, edge = false) {
    let actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId),
      actorData = actor.system,
      template = "systems/sr5/templates/rolls/roll-dialog.hbs"

    //Handle Edge
    dialogData.edge.canUseEdge = await SR5_RollTestHelper.canUseEdge(actor, dialogData)
    let edgeActor = await SR5_RollTestHelper.determineEdgeActor(actor)

    // Capture final DOM values before dialog closes
    const captureResult = (action, dialog) => ({
      action,
      reagentsSpent: parseInt(dialog.element.querySelector('[name="reagentsSpent"]')?.value || 0),
    })

    // Build DialogV2 buttons
    let buttons = [
      {
        action: "roll",
        label: game.i18n.localize("SR5.RollDice"),
        icon: "fas fa-dice-six",
        default: true,
        callback: (event, button, dialog) => captureResult("roll", dialog),
      },
    ]
    if (dialogData.edge.canUseEdge) {
      buttons.push({
        action: "edge",
        label: game.i18n.localize("SR5.PushTheLimit"),
        icon: "fas fa-bomb",
        callback: (event, button, dialog) => captureResult("edge", dialog),
      })
    }

    // Render template and show dialog
    const dlg = await foundry.applications.handlebars.renderTemplate(template, dialogData)
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: dialogData.test.title 
      },
      id: "jet",
      position: {
        width: 450 
      },
      content: dlg,
      buttons,
      rejectClose: false,
      render: (event, dialog) => {
        const element = dialog.element
        const rollDialog = new SR5_RollDialog(dialog, element, dialogData)
        rollDialog.activateListeners(element)
        //An action the character no longer has keeps the dialog open, when the world setting asks for it
        element.querySelectorAll('button[data-action="roll"], button[data-action="edge"]').forEach(b => b.addEventListener("click", ev => {
          if (SR5Combat.hasActionsLeft(actor, dialogData.combat.actions)) return
          ev.preventDefault()
          ev.stopImmediatePropagation()
        }))
      },
    })

    //If roll is cancelled (dialog dismissed without clicking a button)
    if (!result) return SR5_RollTestHelper.handleCanceledTest(actor, dialogData)

    //If roll "push the limits"
    if (result.action === "edge") {
      edge = true
      if (edgeActor) dialogData = await SR5_RollTestHelper.handleEdgeUse(edgeActor, dialogData)
    }

    //Verify if reagents are used, if so, remove from actor
    if (dialogData.magic.hasUsedReagents) {
      dialogData.magic.reagentsSpent = result.reagentsSpent
      actor.update({
        "system.magic.reagents": actorData.magic.reagents - dialogData.magic.reagentsSpent
      })
    }

    //Rename chatCard title for extended test
    if (dialogData.test.isExtended) dialogData.test.title = dialogData.test.title.replace("Test", game.i18n.localize("SR5.ExtendedTest"))

    //Ensure force and level are determined
    if ((dialogData.test.type === "spell" || dialogData.test.typeSub === "summoning" || dialogData.test.type === "preparationFormula") && isNaN(dialogData.magic.force)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_NoForce"))
      dialogData.magic.force = actorData.specialAttributes.magic.augmented.value
    }
    if ((dialogData.test.type === "complexForm" || dialogData.test.typeSub === "compileSprite") && isNaN(dialogData.matrix.level)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_NoLevel"))
      dialogData.matrix.level = actorData.specialAttributes.resonance.augmented.value
    }

    //Add limit for force, reagents and level
    if ((dialogData.magic.force || dialogData.magic.hasUsedReagents) && dialogData.test.type !== "spellResistance"){
      if (dialogData.magic.force > 0) {
        dialogData.limit.base = dialogData.magic.force
        dialogData.limit.type = "force"
      }
      if (dialogData.magic.hasUsedReagents && dialogData.test.type !== "ritual") {
        dialogData.limit.base = dialogData.magic.reagentsSpent
        dialogData.limit.type = "reagents"
      }
    }
    if (dialogData.matrix.level) {
      dialogData.limit.base = dialogData.matrix.level
      dialogData.limit.type = "level"
    }

    //Add limit modifiers
    dialogData = await SR5_RollTestHelper.handleLimitModifiers(dialogData)

    //Add dice pool modifiers
    dialogData = await SR5_RollTestHelper.handleDicePoolModifiers(dialogData)

    // SR5 p. 178: recoil builds up shot after shot until the character spends a simple or complex action on something other than firing
    // SR5 p. 180: single-shot (SS) and suppressive fire (SF) weapons neither build nor suffer progressive recoil,
    // nor do weapons with no firing mode (bows, thrown weapons)
    // Outside combat there are no action phases to carry recoil over: each shot stands alone
    if (dialogData.combat.ammo.fired > 0){
      if (buildsProgressiveRecoil(dialogData.combat.firingMode.selected) && isRecoilCarriedOver(actor)){
        let actualRecoil = actor.getFlag("sr5", "cumulativeRecoil") || 0
        actualRecoil += dialogData.combat.ammo.fired
        await actor.setFlag("sr5", "cumulativeRecoil", actualRecoil)
      }
    } else if (dialogData.combat.actions.some(a => a.type === "simple" || a.type === "complex")) await actor.resetRecoil()

    // Roll dices
    if (edge) {
      // push the limits
      dialogData.roll = await SR5_RollTest.rollDice({
        dicePool: dialogData.dicePool.value,
        explose: edge,
      })
      dialogData.edge.hasUsedPushTheLimit = true
    } else {
      dialogData.roll = await SR5_RollTest.rollDice({
        dicePool: dialogData.dicePool.value,
        limit: dialogData.limit.value,
      })
    }

    //Add info to chatCard
    await SR5_RollTest.addInfoToCard(dialogData, dialogData.owner.actorId)

    // Return roll result and card info to chat message.
    await SR5_RollTest.renderRollCard(dialogData)

    //Update items according to roll
    if (dialogData.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(dialogData)

    //Update spirit if spirit aid is used
    await SR5_RollTest.spendSpiritAidService(dialogData)

    //Update combatant if Active defense or full defense is used.
    SR5_RollTest.applyDefenseStance(dialogData, actor)

    //Change actions in combat tracker
    if (game.combat && dialogData.combat.actions.length){
      await SR5Combat.changeActionInCombat(dialogData.owner.actorId, dialogData.combat.actions)
    }
  }

  //SR5 p. 305-306: aiding a test is a service of a bound spirit. The dice pool modifiers are a list, and an
  //update keyed 'data' (Foundry V9) is ignored: the service is written by its path
  static async spendSpiritAidService(dialogData) {
    if (!(dialogData.dicePool.modifiers.find(m => m.type === "spiritAid")?.value > 0)) return
    let spiritItem = await fromUuid(dialogData.magic.spiritAid.id)
    await spiritItem.update({
      "system.services.value": spiritItem.system.services.value - 1
    })
    ui.notifications.info(`${spiritItem.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format('SR5.INFO_ServicesReduced', {
      service: 1
    })}`)
    let spiritActor = game.actors.find(a => a.system.creatorItemId === spiritItem.id)
    if (spiritActor){
      let services = spiritActor.system.services.value - 1
      //A summoned spirit is often the GM's: a player who does not own it hands the update to the GM
      if (spiritActor.isOwner) await spiritActor.update({
        "system.services.value": services
      })
      else await SR5_SocketHandler.emitForGM("updateActorData", {
        actorId: spiritActor.id,
        dataToUpdate: {
          services: {
            value: services
          }
        },
      })
    }
  }

  // Full defense (SR5 p. 170 and 189) costs 10 initiative and stays for the turn;
  // dicePool.modifiers is an array, the checkbox adds a "fullDefense" entry
  static applyDefenseStance(dialogData, actor){
    let fullDefense = dialogData.dicePool.modifiers.some(m => m.type === "fullDefense")
    if (!fullDefense && dialogData.combat.activeDefenseSelected === "none") return
    let initModifier = 0
    if (fullDefense && !actor.effects.find(e => e.origin === "fullDefense")){
      initModifier += -10
      SR5_CombatHelpers.applyFullDefenseEffect(actor)
    }
    if (dialogData.combat.activeDefenseSelected !== "") initModifier += SR5_ConverterHelpers.activeDefenseToInitMod(dialogData.combat.activeDefenseSelected)
    if (initModifier < 0) SR5Combat.changeInitInCombatHelper(actor.id, initModifier)
  }

  /** Roll a shadowrun 5 test
	 * @param {Number} dicePool - Number of dice to roll
	 * @param {Number} limit - Limit maximum success
	 * @param {Boolean} explose - Handle explosing 6 result
	 */
  static async rollDice({
    dicePool, limit, explose, edgeRoll 
  }) {
    let formula = `${dicePool}d6`
    if (explose) formula += "x6"
    if (limit) formula += `kh${limit}`
    formula += "cs>=5"

    let roll = new Roll(formula)
    let rollMode = game.settings.get("core", "rollMode")
    let rollRoll = await roll.evaluate()
    let rollJSON = await roll.toJSON(rollRoll)
    //Glitch
    //Rule of Six (SR5 p. 58): Die#explode adds the rerolled dice after the pool. Their 1s do not count
    //for the glitch, only the first roll does (DjamZ's ruling B30)
    let realHits = 0
    for (let [i, d] of rollJSON.terms[0].results.entries()) {
      if (explose && i >= dicePool) d.ruleOfSix = true
      if (d.result === 1 && !d.ruleOfSix) d.glitch = true
      if (edgeRoll) d.edge = true
      if (d.result >= 5) realHits ++
    }

    let rollResult = {
      dicePool: dicePool,
      hits: rollRoll.total,
      realHits: realHits,
      ...SR5_RollTest.glitchStatus(rollJSON.terms[0].results, dicePool),
      dices: rollJSON.terms[0].results,
      limit: limit,
      rollMode: rollMode,
      r: rollJSON,
      originalRoll: roll
    }

    return rollResult
  }

  /** SR5 p. 47: more than half the dice show 1 is a glitch; a glitch with no hit is a critical glitch.
   * Hits are counted on the dice rolled (a serialized Die term has no total, and a limit never brings them to 0).
   * The 1s of dice rerolled by the Rule of Six are left out, as they are out of the pool (SR5 p. 58).
   * @param {Array} dices - Results of every die rolled for the test
   * @param {Number} dicePool - Number of dice in the pool
   */
  static glitchStatus(dices, dicePool) {
    let ones = dices.filter(d => d.result === 1 && !d.ruleOfSix).length,
      hits = dices.filter(d => d.result >= 5).length,
      glitch = ones > dicePool/2
    return {
      glitchRoll: glitch && hits > 0,
      criticalGlitchRoll: glitch && hits === 0,
    }
  }

  //Handle extended roll
  static async extendedRoll(message, actor){
    let messageData = message.flags.sr5data
    //SR5 p. 207: the next roll of a natural Physical recovery waits for the Stun damage to be healed, as the first one
    if (SR5_ActorHelper.stunBlocksNaturalHealing(actor?.system, messageData.test.type, messageData.test.typeSub)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_StunHealsFirst"))
      return false
    }

    //Prepare new chat card: the base pool and its modifiers, minus one die per earlier roll (SR5 p. 50).
    //GM ruling (05/10): Push the limit joins the starting pool of an extended test, every roll keeps its Edge dice
    //(exploding, no limit) and the point is spent once. Edge is only offered on the first roll
    //SR5 p. 58 says nothing of Edge during an extended test: DjamZ filled the gap. A ruling, not a house rule, so no setting
    let newMessage = foundry.utils.duplicate(messageData)
    newMessage.test.extended.roll += 1
    SR5_EntityHelpers.removeElementFromArray(newMessage.dicePool.modifiers, 'type', "extendedTest")
    delete newMessage.originalModifiers
    let pushedTheLimit = !!messageData.edge.hasUsedPushTheLimit
    newMessage.edge.canUseEdge = false
    newMessage.dicePool.modifiers.push({
      type: "extendedTest",
      label: game.i18n.localize("SR5.ExtendedTest"),
      value: -(newMessage.test.extended.roll - 1),
    })
    newMessage = await SR5_RollTestHelper.handleDicePoolModifiers(newMessage)

    //roll new test
    let newRoll = await SR5_RollTest.rollDice({
      dicePool: newMessage.dicePool.value,
      limit: pushedTheLimit ? undefined : messageData.limit.value,
      explose: pushedTheLimit,
    })

    //Keep only original hits and concatenat with new hits
    let dicesKeeped = messageData.roll.dices.filter(function (d) {
      return d.result > 4
    })
    let dicesTotal = newRoll.dices.concat(dicesKeeped)

    newMessage.roll.hits = messageData.roll.hits + newRoll.hits
    newMessage.roll.dices = dicesTotal
    //Edge spent after this roll works on this roll alone (SR5 p. 58): keep its own dice and hits apart from the kept ones
    newMessage.roll.rollDices = newRoll.dices
    newMessage.roll.rollHits = newRoll.hits
    newMessage.roll.realHits = messageData.roll.hits + newRoll.realHits
    //Earlier glitches stay counted for the whole test (SR5 p. 208: each glitched healing roll counts double)
    if (messageData.roll.glitchRoll || messageData.roll.criticalGlitchRoll) newMessage.test.extended.glitchedRolls = (messageData.test.extended.glitchedRolls || 0) + 1
    //Each roll of an extended test can glitch on its own (SR5 p. 47, 51)
    newMessage.roll.glitchRoll = newRoll.glitchRoll
    newMessage.roll.criticalGlitchRoll = newRoll.criticalGlitchRoll
    delete newMessage.roll.criticalGlitchDamage
    delete newMessage.roll.overwatchRaised
    await SR5_RollTest.addInfoToCard(newMessage, actor.id)

    if (newMessage.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

    //Handle Dice so Nice
    await SR5_RollTest.showDiceSoNice(newRoll.originalRoll, newRoll.rollMode)

    SR5_RollMessage.updateRollCardHelper(message.id, newMessage)
  }

  /** An extended test, even once its pool fell to one die (the card then stops offering a new roll) */
  static isExtendedTest(data) {
    return !!(data.test?.isExtended || data.test?.extended?.roll > 1)
  }

  //Handle second chance : reroll failed dice and update message with new message
  static async secondeChance(message, actor) {
    let messageData = message.flags.sr5data
    //GM ruling (05/10): during an extended test, Push the limit is the only use of Edge
    if (SR5_RollTest.isExtendedTest(messageData)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_EdgeExtendedTestPushOnly"))
      return false
    }

    //Re roll failed dices
    let rollDices = messageData.roll.rollDices
    let rollHits = messageData.roll.rollHits ?? messageData.roll.hits
    let dicePool = rollDices ? rollDices.filter(d => d.result < 5).length : messageData.dicePool.value - messageData.roll.hits
    if (dicePool < 0) dicePool = 0
    let limit = messageData.limit.value - rollHits
    if (limit < 0) limit = 0
    let chance = await SR5_RollTest.rollDice({
      dicePool: dicePool, limit: limit, edgeRoll: true
    })
    //SR5 p. 58: Second Chance has no effect on limits. A test whose hits already reached its limit gains nothing,
    //only a test without limit (value 0) keeps every new hit
    let chanceHit = chance.hits
    if (messageData.limit.value > 0) chanceHit = Math.min(chance.hits, limit)
    let dicesKeeped = messageData.roll.dices.filter(function (d) {
      return d.result > 4
    })

    //Met à jour les infos sur le nouveau message avec le résultat du nouveau jet.
    let newMessage = foundry.utils.duplicate(messageData)
    newMessage.roll.hits = messageData.roll.hits + chanceHit
    newMessage.roll.dices = dicesKeeped.concat(chance.dices)
    if (rollDices) newMessage.roll.rollDices = rollDices.filter(d => d.result > 4).concat(chance.dices)
    newMessage.edge.hasUsedSecondChance = true
    newMessage.edge.canUseEdge = false
    await SR5_RollTest.addInfoToCard(newMessage, actor.id)
    if (newMessage.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

    //Remove 1 to actor's Edge
    await SR5_RollTestHelper.removeEdgeFromActor(messageData, actor)

    //Handle Dice so Nice
    await SR5_RollTest.showDiceSoNice(chance.originalRoll, chance.rollMode)

    //update message with new infos
    SR5_RollMessage.updateRollCardHelper(message.id, newMessage)
  }

  //Handle Push the Limit test
  static async pushTheLimit(message, actor, fromCard = false) {
    let messageData = message.flags.sr5data
    let dicePool, creator
    //GM ruling (05/10): Edge joins the starting pool of an extended test, once: not on a later roll
    if (SR5_RollTest.isExtendedTest(messageData) && (messageData.test.extended?.roll > 1 || messageData.edge.hasUsedPushTheLimit)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_EdgeExtendedTestStartOnly"))
      return false
    }

    //If roller is a bounder spirit, use actor Edge instead
    if (actor.type === "actorSpirit"){
      creator = SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId)
      dicePool = creator.system.specialAttributes.edge.augmented.value
    } else dicePool = actor.system.specialAttributes.edge.augmented.value

    let newRoll = await SR5_RollTest.rollDice({
      dicePool: dicePool,
      explose: true,
      edgeRoll: true,
    })

    // SR5 p. 58: pushing the limit ignores the test limit, so start from the unlimited hits of the original roll
    let originalHits = messageData.roll.realHits ?? messageData.roll.hits
    let newMessage = foundry.utils.duplicate(messageData)
    newMessage.roll.hits = originalHits + newRoll.hits
    newMessage.roll.realHits = originalHits + newRoll.realHits
    newMessage.roll.dices = messageData.roll.dices.concat(newRoll.dices)
    //The Edge dice join the pool: glitch is read again on every die rolled for this roll (SR5 p. 47, 58),
    //without the hits kept from earlier rolls of an extended test
    let rollDices = (messageData.roll.rollDices ?? messageData.roll.dices).concat(newRoll.dices)
    if (messageData.roll.rollDices) newMessage.roll.rollDices = rollDices
    Object.assign(newMessage.roll, SR5_RollTest.glitchStatus(rollDices, messageData.dicePool.value + dicePool))
    newMessage.edge.hasUsedPushTheLimit = true
    newMessage.edge.canUseEdge = false
    newMessage.dicePool.modifiers.push({
      type: "pushTheLimit",
      label: game.i18n.localize("SR5.PushTheLimit"),
      value: dicePool,
    })
    newMessage = await SR5_RollTestHelper.handleDicePoolModifiers(newMessage)
    await SR5_RollTest.addInfoToCard(newMessage, actor.id)
    if (newMessage.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

    //Handle Dice so Nice
    if (fromCard) await SR5_RollTest.showDiceSoNice(newRoll.originalRoll, newRoll.rollMode)

    //Remove 1 to actor's Edge
    await SR5_RollTestHelper.removeEdgeFromActor(messageData, actor)

    //Rafraichi le message avec les nouvelles infos.
    SR5_RollMessage.updateRollCardHelper(message.id, newMessage)
  }

  //Render the chat message
  static async renderRollCard(cardData) {
    //Add button to edit result for GM
    //if (game.user.isGM) cardData.chatCard.canEditResult = true;

    const templateData = cardData
    const template = `systems/sr5/templates/rolls/roll-card.hbs`
    let html = await foundry.applications.handlebars.renderTemplate(template, templateData)

    //Add chat buttons to chat card
    const temp = document.createElement("div")
    temp.innerHTML = html
    let divButtons = temp.querySelector('[id="srButtonTest"]')
    for (let button in cardData.chatCard.buttons){
      divButtons.insertAdjacentHTML("beforeend", `<button class="messageAction ${cardData.chatCard.buttons[button].testType} ${cardData.chatCard.buttons[button].gmAction}" data-action="${cardData.chatCard.buttons[button].testType}" data-type="${cardData.chatCard.buttons[button].actionType}">${cardData.chatCard.buttons[button].label}</button>`)
    }
    html = temp.innerHTML

    let chatData = {
      roll: cardData.roll.r,
      rollMode: cardData.roll.rollMode,
      user: game.user.id,
      content: html,
      speaker: {
        actor: cardData.owner.speakerId,
        token: cardData.owner.speakerId,
        alias: cardData.owner.speakerActor,
      },
    }

    if (["gmroll", "blindroll"].includes(cardData.roll.rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
    if (cardData.roll.rollMode === "blindroll") chatData["blind"] = true
    else if (cardData.roll.rollMode === "selfroll") chatData["whisper"] = [game.user]

    let userActive = game.users.get(chatData.user)
    cardData.owner.userId = game.user.id

    // v13: store all custom data under sr5data to avoid non-namespaced flag issues
    // Convert user.color to string (v13 Color object)
    cardData.owner.borderColor = typeof userActive.color === "string" ? userActive.color : String(userActive.color ?? "")
    cardData.sr5template = template
    chatData.flags = {
      sr5data: cardData
    }

    //Handle Dice so Nice
    if (cardData.roll.originalRoll) await SR5_RollTest.showDiceSoNice(cardData.roll.originalRoll, cardData.roll.rollMode)

    //Create chat message
    ChatMessage.create(chatData)
  }

  //Add support for the Dice So Nice module
  static async showDiceSoNice(roll, rollMode) {
    console.log(roll)
    if (game.modules.get("dice-so-nice") && game.modules.get("dice-so-nice").active) {
      let whisper = null
      let blind = false
      switch (rollMode) {
        case "blindroll": //GM only
          blind = true
          // falls through
        case "gmroll": { //GM + rolling player
          let gmList = game.users.filter(user => user.isGM)
          let gmIDList = []
          gmList.forEach(gm => gmIDList.push(gm.id))
          whisper = gmIDList
          break
        }
        case "roll": { //everybody
          let userList = game.users.filter(user => user.active)
          let userIDList = []
          userList.forEach(user => userIDList.push(user.id))
          whisper = userIDList
          break
        }
      }
      await game.dice3d.showForRoll(roll, game.user, true, whisper, blind)
    }
  }

  //Iterate througt test type to handle results
  static async addInfoToCard(cardData, actorId) {
    //Reset button
    cardData.chatCard.buttons = {
    }

    //Handle Extended Test
    if (cardData.test.isExtended){
      if (!cardData.test.extended.roll) cardData.test.extended.roll = 1
      cardData.test.extended.intervalValue = cardData.test.extended.multiplier * cardData.test.extended.roll
      if (cardData.dicePool.value <= 1) cardData.test.isExtended = false
      //SR5 p. 51: a critical glitch fails the extended test, no more rolls. The card hides "New roll" instead of
      //ending the test here, so Edge spent after the roll (SR5 p. 58) can reopen it by erasing the critical glitch
    }

    switch (cardData.test.type) {
      case "attack":
        await SR5_AddRollInfo.attackInfo(cardData)
        break
      case "defense":
      case "rammingDefense":
        await SR5_AddRollInfo.defenseInfo(cardData, actorId)
        break
      case "resistanceCard":
      case "splitted":
        await SR5_AddRollInfo.resistanceInfo(cardData, actorId)
        break
      case "spell":
      case "preparation":
      case "adeptPower":
        await SR5_AddRollInfo.spellInfo(cardData)
        break
      case "sensorTarget":
      case "preparationFormula":
      case "iceAttack":
      case "spritePower":
      case "martialArt":
      case "ritual":
      case "passThroughBarrier":
      case "escapeEngulf":
      case "ramming":
        await SR5_AddRollInfo.actionHitInfo(cardData, cardData.test.type)
        break
      case "power":
        if (cardData.magic.spell.category === "regeneration") return SR5_AddRollInfo.regenerationInfo(cardData, cardData.test.type)
        if (cardData.test.typeSub !== "powerWithDefense") {
          if (!cardData.effects.canApplyEffect) return
          else await SR5_AddRollInfo.spellInfo(cardData)
        } else await SR5_AddRollInfo.actionHitInfo(cardData, cardData.test.type)
        break
      case "drain":
        await SR5_AddRollInfo.drainInfo(cardData, actorId)
        break
      case "complexForm":
        await SR5_AddRollInfo.complexFormInfo(cardData)
        break
      case "complexFormDefense":
        await SR5_AddRollInfo.complexFormDefenseInfo(cardData)
        break
      case "fading":
        await SR5_AddRollInfo.fadingInfo(cardData, actorId)
        break
      case "matrixAction":
        await SR5_AddRollInfo.matrixActionInfo(cardData, actorId)
        break
      case "matrixDefense":
        await SR5_AddRollInfo.matrixDefenseInfo(cardData, actorId)
        break
      case "matrixResistance":
        await SR5_AddRollInfo.matrixResistanceInfo(cardData, actorId)
        break
      case "iceDefense":
        await SR5_AddRollInfo.iceDefenseInfo(cardData, actorId)
        break
      case "grappleEscape":
        await SR5_AddRollInfo.grappleEscapeInfo(cardData, actorId)
        break
      case "lift":
        await SR5_AddRollInfo.liftInfo(cardData, actorId)
        break
      case "movement":
        await SR5_AddRollInfo.movementInfo(cardData, actorId)
        break
      case "skill":
      case "skillDicePool":
        await SR5_AddRollInfo.skillInfo(cardData)
        break
      case "resonanceAction":
        await SR5_AddRollInfo.resonanceActionInfo(cardData)
        break
      case "resistFire":
        await SR5_AddRollInfo.fireResistanceInfo(cardData)
        break
      case "preparationResistance":
      case "ritualResistance":
      case "summoningResistance":
      case "compilingResistance":
      case "sensorDefense":
      case "jackOutDefense":
      case "eraseMark":
      case "passThroughDefense":
      case "engulfResistance":
      case "intimidationResistance":
      case "ricochetResistance":
      case "warningResistance":
      case "stunnedResistance":
      case "buckledResistance":
      case "nauseousResistance":
      case "knockdownResistance":
        await SR5_AddRollInfo.defenseResultInfo(cardData, cardData.test.type)
        break
      case "overwatchResistance":
        await SR5_AddRollInfo.overwatchResistanceInfo(cardData)
        break
      case "registeringResistance":
      case "decompilingResistance":
      case "bindingResistance":
      case "banishingResistance":
        await SR5_AddRollInfo.sidekickResistanceInfo(cardData, cardData.test.type)
        break
      case "dispellResistance":
      case "spellResistance":
      case "complexFormResistance":
      case "enchantmentResistance":
      case "disjointingResistance":
      case "powerDefense":
      case "martialArtDefense":
      case "etiquetteResistance":
      case "weaponResistance":
        await SR5_AddRollInfo.resistanceResultInfo(cardData, cardData.test.type)
        break
      case "objectResistance":
        await SR5_AddRollInfo.objectResistanceResultInfo(cardData)
        break
      case "regeneration":
        await SR5_AddRollInfo.regenerationResultInfo(cardData, actorId)
        break
      case "healing":
        await SR5_AddRollInfo.healingInfo(cardData)
        break
      case "vehicleTest":
        await SR5_AddRollInfo.vehicleTestInfo(cardData, actorId)
        break
      case "attributeOnly":
      case "languageSkill":
      case "knowledgeSkill":
      case "defenseSimple":
      case "resistanceSimple":
      case "matrixDefenseSimple":
      case "astralTracking":
      case "derivedAttribute":
      case "itemRoll":
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${cardData.test.type}' type in addInfoToCard`)
    }
  }
}
