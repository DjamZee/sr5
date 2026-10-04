import {
  SR5 
} from "../config.js"
import {
  SR5_SystemHelpers 
} from "../system/utilitySystem.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_RollTest 
} from "./roll-test.js"
import {
  SR5_SocketHandler 
} from "../socket.js"
import {
  SR5Combat 
} from "../system/srcombat.js"
import {
  SR5_RollTestHelper 
} from "./roll-test-helper.js"
import {
  SR5_MarkHelpers 
} from "./roll-helpers/mark.js"
import {
  SR5_CalledShotHelpers 
} from "./roll-helpers/calledShot.js"
import {
  SR5_MatrixHelpers 
} from "./roll-helpers/matrix.js"
import {
  isRolledByTarget, firstAidPatient, patientMonitors, hasSingleMonitor, opposedTestActorId, firstAidBoxesOnClick, ownsCardSpeaker
} from "./roll-helpers/cardRoller.js"
import {
  SR5_CombatHelpers 
} from "./roll-helpers/combat.js"
import {
  SR5_MiscellaneousHelpers 
} from "./roll-helpers/miscellaneous.js"
import {
  SR5_ThirdPartyHelpers 
} from "./roll-helpers/thirdparty.js"
import {
  SR5_ActorHelper 
} from "../entities/actors/entityActor-helpers.js"
import {
  ritualDrainActorId
} from "./roll-helpers/ritualTeam.js"
import {
  SR5_GrappleHelpers
} from "./roll-helpers/grapple.js"

// True when a GM is connected to relay what a player cannot do
export function hasActiveGM() {
  return !!game.users?.find(user => user.isGM && user.active)
}

// Without a GM to relay it, the author of a card updates it: otherwise a used button stays and can be clicked again
export function updatesCardLocally(message) {
  return !!message?.isOwner && !hasActiveGM()
}

export class SR5_RollMessage {
  //Handle reaction to roll ChatMessage
  static async chatListeners(html, message) {
    html.querySelectorAll(".messageAction").forEach(el => {
      el.addEventListener("click", (ev) => SR5_RollMessage.chatButtonAction(ev))
    })
    //Toggle Dice details
    html.querySelectorAll(".SR-CardHeader").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault()
        const content = ev.currentTarget.parentElement?.querySelector(".SR-CardContent")
        if (content) content.style.display = content.style.display === "none" ? "" : "none"
      })
    })

    if (!game.user.isGM) {
      // Hide GM stuff
      html.querySelectorAll(".chat-button-gm").forEach(el => el.remove())

      // SR5 p. 299: each ritual participant only sees the button of their own Drain
      html.querySelectorAll(".ritualDrain").forEach(el => {
        if (!SR5_EntityHelpers.getRealActorFromID(ritualDrainActorId(el.dataset.type))?.isOwner) el.remove()
      })

      // v13: use message document directly instead of data.message
      // Hide if player is not owner of the message
      if (!ownsCardSpeaker(message.speaker, id => SR5_EntityHelpers.getRealActorFromID(id))) {
        html.querySelectorAll(".nonOpposedTest").forEach(el => el.remove())
        html.querySelectorAll(".owner").forEach(el => el.remove())
      }

      // Hide if player is not owner of the message for attackerTest
      if (message.flags?.sr5data?.previousMessage?.userId !== game.user.id) {
        html.querySelectorAll(".attackerTest").forEach(el => el.remove())
      }

      // Do not display "Blind" chat cards to non-gm
      if (html.classList.contains("blind")) {
        const header = html.querySelector("header") || html.querySelector(".message-header")
        if (header) header.remove() // Remove header so Foundry does not attempt to update its timestamp
        html.innerHTML = ""
        html.style.display = "none"
      }
    }

    // Edit manually the result of a chatmessage roll
    html.querySelectorAll(".edit-toggle").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault()
        const chatCard = ev.currentTarget.closest(".chat-card")
        let elementsToToggle = chatCard ? chatCard.querySelectorAll(".display-toggle") : []
        if (!elementsToToggle.length) elementsToToggle = ev.currentTarget.querySelectorAll(".display-toggle")
        for (let elem of elementsToToggle) {
          if (elem.style.display == "none") elem.style.display = ""
          else elem.style.display = "none"
        }
      })
    })

    //Hide core content of message
    html.querySelectorAll(".SR-CardContent").forEach(el => el.style.display = "none")

    // Respond to editing chat cards
    html.querySelectorAll(".card-edit").forEach(el => {
      el.addEventListener("change", async (ev) => {
        const target = ev.currentTarget
        const messageEl = target.closest(".chat-message") || target.closest(".message")
        const messageId = messageEl?.dataset.messageId
        const message = game.messages.get(messageId)
        const actor = SR5_EntityHelpers.getRealActorFromID(message.flags.sr5data.owner.speakerId)
        let newMessage = foundry.utils.duplicate(message.flags.sr5data)

        newMessage.roll[target.dataset.editType] = parseInt(ev.target.value)

        await SR5_RollTest.addInfoToCard(newMessage, actor.id)
        if (newMessage.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

        //Update message with new data
        await message.update({
          [`flags.sr5data.chatCard.-=buttons`]: null
        })
        await SR5_RollMessage.updateRollCardHelper(messageId, newMessage)
      })
    })

    //Toggle hidden div
    html.querySelectorAll(".SR-MessageToggle").forEach(el => {
      el.addEventListener("click", ev => SR5_RollMessage.toggleDiv(ev, html))
    })
  }

  //Show or Hide section of the message
  static toggleDiv(ev, html){
    let target = ev.currentTarget.dataset.target,
      action = ev.currentTarget.dataset.action
    const targetEl = html.querySelector(`#${target}`)
    if (action === "show"){
      if (targetEl) targetEl.style.display = ""
      html.querySelectorAll(`[data-target="${target}"][data-action="show"]`).forEach(el => el.style.display = "none")
      html.querySelectorAll(`[data-target="${target}"][data-action="hide"]`).forEach(el => el.style.display = "")
    } else {
      if (targetEl) targetEl.style.display = "none"
      html.querySelectorAll(`[data-target="${target}"][data-action="hide"]`).forEach(el => el.style.display = "none")
      html.querySelectorAll(`[data-target="${target}"][data-action="show"]`).forEach(el => el.style.display = "")
    }
  }

  //Handle action related to chat buttons
  static async chatButtonAction(ev){
    ev.preventDefault()
        
    const buttonEl = ev.currentTarget,
      messageEl = buttonEl.closest(".chat-message") || buttonEl.closest(".message"),
      messageId = messageEl?.dataset.messageId,
      message = game.messages.get(messageId),
      action = buttonEl.dataset.action,
      type = buttonEl.dataset.type
                
    let speaker = ChatMessage.getSpeaker(),
      actor,
      messageData = message.flags.sr5data

    messageData.owner.messageId = messageId

    //SR5 p. 299: a ritual participant resists their own Drain, named on the button
    const ritualDrainId = ritualDrainActorId(type)
    if (ritualDrainId) {
      const participant = SR5_EntityHelpers.getRealActorFromID(ritualDrainId)
      if (!participant?.isOwner) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoActor")}`)
      return participant.rollTest("drain", null, messageData)
    }

    //Define actor for Opposed test or Non opposed tests
    if (action === "opposedTest") {
      actor = SR5_EntityHelpers.getRealActorFromID(opposedTestActorId(speaker))
      // Matrix support actions (Kill Code p. 43-44) go to the targeted tokens: no selected token needed
      let supportAction = (type === "iAmTheFirewall" || type === "intervene")
      if (actor == null && !supportAction) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoActor")}`)
    } else if (action === "nonOpposedTest" && messageData) {
      // The spirit or sprite handles its own buttons, but the drain and the fading are resisted by the card owner
      if (isRolledByTarget(type, messageData.test.typeSub, messageData.target.actorId)) actor = SR5_EntityHelpers.getRealActorFromID(messageData.target.actorId)
      else actor = SR5_EntityHelpers.getRealActorFromID(messageData.owner.speakerId)
    }

    // If there is a matrix action Author, get the Actor to do stuff with him later
    let originalActionActor, targetActor
    if (messageData.previousMessage.actorId) originalActionActor = SR5_EntityHelpers.getRealActorFromID(messageData.previousMessage.actorId)
    if (messageData.target.hasTarget) targetActor = SR5_EntityHelpers.getRealActorFromID(messageData.target.actorId)

    switch(type) {
      case "defenseMeleeWeapon":
      case "defenseRangedWeapon":
      case "defenseAstralCombat":
        actor.rollTest("defense", null, messageData)
        break
      case "defenseThroughAndInto":
        actor.rollTest("defense", null, messageData.originalAttackMessage)
        break
      case "matrixDefense":
        if ((messageData.test.typeSub === "dataSpike" || 
                    messageData.test.typeSub === "controlDevice" ||
                    messageData.test.typeSub === "formatDevice" ||
                    messageData.test.typeSub === "hackOnTheFly" ||
                    messageData.test.typeSub === "spoofCommand" ||
                    messageData.test.typeSub === "bruteForce" ||
                    messageData.test.typeSub === "rebootDevice" ||
                    messageData.test.typeSub === "denialOfService") &&
                    (actor.type !== "actorDevice" && actor.type !== "actorSprite" && actor.type !== "actorDrone" && actor.type !== "actorAgent")){
          SR5_MatrixHelpers.chooseMatrixDefender(messageData, actor)
        } else actor.rollTest(type, messageData.test.typeSub, messageData)
        break
      case "powerDefense":
      case "resistanceCard":
      case "resistanceCardAura":
      case "complexFormDefense":
      case "iceAttack":
      case "sensorDefense":
      case "decompilingResistance":
      case "registeringResistance":
      case "banishingResistance":
      case "iceDefense":
      case "spellResistance":                                        
      case "rammingDefense":
      case "martialArtDefense":
      case "grappleClinchDefense":
      case "drain":
      case "fading":
      case "objectResistance":
      case "passThroughDefense":
      case "fatiguedCard":
      case "calledShotFear":
      case "calledShotStunned":   
      case "calledShotBuckled":   
      case "calledShotNauseous":
      case "calledShotKnockdown":
      case "matrixResistance":
      case "vehicleTest":
      case "resistanceToxin":
        actor.rollTest(type, null, messageData)
        break
      case "resistanceCardContinuousDamage":
        messageData.test.typeSub = "continuousDamage"
        actor.rollTest("resistanceCard", null, messageData)
        break
      case "bindingResistance":
        if (actor.system.isBounded) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_SpiritAlreadyBounded")}`)
        actor.rollTest(type, null, messageData)
        break
      case "applyEffect":
      case "applyEffectAuto":
        actor.applyExternalEffect(messageData, "customEffects")
        if (messageData.magic.spell.area < 1) SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "applyEffectOnItem":
        actor.applyExternalEffect(messageData, "itemEffects")
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "firstAid": {
        //SR5 p. 207: the patient is healed, never the card owner
        let patient = firstAidPatient(messageData.target.hasTarget, targetActor, actor)
        if (!patient) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoActor")}`)
        //SR5 p. 207: without a target, the full armor of the patient selected on click halves the effects here
        let healed = firstAidBoxesOnClick(messageData, patient)
        let healData = {
          test: {
          },
          roll:{
            netHits: healed.boxes
          },
        }
        //The monitor to heal follows what the patient has: asked between Physical and Stun, or its single condition monitor
        let monitors = patientMonitors(patient)
        //SR5 p. 207: first aid heals Physical or Stun damage; a device has neither
        if (!monitors.length) return ui.notifications.warn(game.i18n.format("SR5.WARN_PatientWithoutMonitor", {
          name: patient.name
        }))
        //A patient the player does not own is healed by the GM: without one connected, nothing would happen
        let healLocally = game.user.isGM || patient.testUserPermission(game.user, 3)
        if (!healLocally && !hasActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActiveGM"))
        if (monitors.length > 1) healData.test.typeSub = await SR5_CombatHelpers.chooseDamageType()
        else healData.test.typeSub = monitors[0]
        if (!healData.test.typeSub) return
        if (healed.halvedOnClick) ui.notifications.info(game.i18n.format("SR5.INFO_FirstAidFullArmor", {
          name: patient.name, hits: healed.boxes
        }))
        let healedID = (patient.isToken ? patient.token.id : patient.id)
        if (healLocally) await SR5_ActorHelper.heal(healedID, healData)
        else await SR5_SocketHandler.emitForGM("heal", {
          targetActor: healedID,
          healData: healData,
        })
        SR5_RollMessage.updateChatButtonHelper(messageId, type, healData.test.typeSub)
        break
      }
      case "damage":
        if (messageData.test.typeSub === "firstAid") {
          //The 1D3 goes to the patient, the selected token when the test had no target
          let patient = firstAidPatient(messageData.target.hasTarget, targetActor, actor)
          if (!patient) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoActor")}`)
          //SR5 p. 207: the 1D3 "increases the damage" being treated; a device or drone has none to worsen
          if (!patientMonitors(patient).length) return ui.notifications.warn(game.i18n.format("SR5.WARN_PatientWithoutMonitor", {
            name: patient.name
          }))
          //SR5 p. 207: the 1D3 of a critical glitch needs a damage type, asked again if the first dialog was cancelled,
          //unless the patient only has a single condition monitor
          if (!messageData.damage.type) {
            let damageType = hasSingleMonitor(patient) ? "condition" : await SR5_CombatHelpers.chooseDamageType()
            if (!damageType) return
            messageData.damage.type = damageType
          }
          await patient.takeDamage(messageData)
          SR5_RollMessage.updateChatButtonHelper(messageId, type, messageData.damage.type)
          break
        }
        if (messageData.combat.calledShot?.name === "splittingDamage") actor.takeSplitDamage(messageData)
        else actor.takeDamage(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "intimidation":
      case "performance":
      case "negotiation":
      case "con":
      case "leadership":
        actor.rollTest("skillDicePool", type, messageData)
        break
      case "impersonation":
      case "etiquette":
        actor.rollTest("skillDicePool", "perception", messageData)
        break
      case "calledShotEffect":
        //SR5 p. 195: the subdued defender and its attacker enter the hold, with the net hits of the attack
        if (messageData.combat.calledShot.name === "subdue") {
          const hold = Object.values(messageData.combat.calledShot.effects).find(e => e.name === "subdue")?.value ?? 0
          await SR5_GrappleHelpers.startHold(messageData.previousMessage.actorId, SR5_GrappleHelpers.actorIdOf(actor), hold)
        }
        //SR5 p. 196: the strengthened (or weakened) hold, written on both fighters
        else if (messageData.combat.calledShot.name === "strengthenHold") {
          const hold = Object.values(messageData.combat.calledShot.effects).find(e => e.name === "strengthenHold")?.value ?? 0
          await SR5_GrappleHelpers.setHold(SR5_GrappleHelpers.actorIdOf(actor), hold)
        }
        //Run & Gun p. 126: the attacker who reversed the situation becomes the one who holds
        else if (messageData.combat.calledShot.name === "reversal" && Object.values(messageData.combat.calledShot.effects).some(e => e.name === "reversal")) {
          const hold = Object.values(messageData.combat.calledShot.effects).find(e => e.name === "reversal").value
          await SR5_GrappleHelpers.reverseHold(messageData.previousMessage.actorId, hold)
        }
        else if (messageData.combat.calledShot.name === "trickShot") await originalActionActor.applyCalledShotsEffect(messageData)
        else await actor.applyCalledShotsEffect(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      //Run & Gun p. 133: the clinched defender and the attacker enter the clinch, with the net hits of the test
      case "grappleClinchApply":
        await SR5_GrappleHelpers.startHold(messageData.previousMessage.actorId, SR5_GrappleHelpers.actorIdOf(actor), messageData.roll.netHits, "clinch")
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "applyFearEffect":
      case "applyStunnedEffect":
        SR5Combat.changeInitInCombatHelper(actor.id, -messageData.combat.calledShot.initiative)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "templatePlace": {
        let item = await fromUuid(messageData.owner.itemUuid)
        await item.placeGabarit(messageId)
        break
      }
      case "templateRemove":
        SR5_RollMessage.removeTemplate(messageId, messageData.owner.itemUuid, messageData.combat?.grenade?.templateId)
        break
      case "summonSpirit":
      case "compileSprite":
      case "createPreparation":
        await SR5_ThirdPartyHelpers.buildItem(messageData, type, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "secondeChance":
        SR5_RollTest.secondeChance(message, actor)
        break
      case "pushLimit":
        SR5_RollTest.pushTheLimit(message, actor, true)
        break
      case "extended":
        SR5_RollTest.extendedRoll(message, actor)
        break
      case "attackerPlaceMark": {
        // Kill Code p. 45: a mark placed by Watchdog is remembered as such, it opens the interruption actions
        let isWatchdog = messageData.test.typeSub === "watchdog"
        await SR5_MarkHelpers.markItem(actor.id, messageData.previousMessage.actorId, messageData.matrix.mark, messageData.target.itemUuid, isWatchdog)
        // if defender is a drone and is slaved, add mark to master
        if (actor.type === "actorDrone" && actor.system.slaved){
          if (!game.user?.isGM) {
            SR5_SocketHandler.emitForGM("markItem", {
              targetActor: actor.system.vehicleOwner.id,
              attackerID: originalActionActor.id,
              mark: messageData.matrix.mark,
              isWatchdog: isWatchdog,
            })
          } else {
            await SR5_MarkHelpers.markItem(actor.system.vehicleOwner.id, messageData.previousMessage.actorId, messageData.matrix.mark, undefined, isWatchdog)
          }
        }
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      }
      case "defenderPlaceMark": {
        let attackerID
        if (actor.isToken) attackerID = actor.token.id
        else attackerID = actor.id
        if (!game.user?.isGM) {
          SR5_SocketHandler.emitForGM("markItem", {
            targetActor: originalActionActor.id,
            attackerID: attackerID,
            mark: 1,
          })
        } else await SR5_MarkHelpers.markItem(originalActionActor.id, attackerID, 1)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      }
      case "overwatch": {
        //An unlinked token has its own actor: its token id reaches it, the actor id would reach the base actor
        let overwatchActorId = originalActionActor.isToken ? originalActionActor.token.id : originalActionActor.id
        if (!game.user?.isGM) {
          SR5_SocketHandler.emitForGM("overwatchIncrease", {
            defenseHits: messageData.roll.hits,
            actorId: overwatchActorId,
          })
        } else await SR5_ActorHelper.overwatchIncrease(messageData.roll.hits, overwatchActorId)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      }
      case "defenderDoMatrixDamage":
        if (originalActionActor.type === "actorPc" || originalActionActor.type === "actorGrunt"){
          if (originalActionActor.items.find((item) => item.type === "itemDevice" && item.system.isActive && (item.system.type === "livingPersona" || item.system.type === "headcase"))){
            originalActionActor.takeDamage(messageData)
          } else await SR5_MatrixHelpers.applyDamageToDecK(originalActionActor, messageData, actor, true)
        } else originalActionActor.takeDamage(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "takeMatrixDamage":
        if (actor.type === "actorPc" || actor.type === "actorGrunt") await SR5_MatrixHelpers.applyDamageToDecK(actor, messageData)
        else actor.takeDamage(messageData)
        //Special case for Derezz Complex Form.
        if (messageData.test.typeSub === "derezz") SR5_MatrixHelpers.applyDerezzEffect(messageData, originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "blueGooExplosion":                
        actor.rollTest("iceAttack", null, messageData)
        break
      case "defenderDoBiofeedbackDamage":
        originalActionActor.rollTest("resistanceCard", null, messageData)
        break
      case "attackerDoBiofeedbackDamage":
        if (actor.type === "actorDrone") actor = SR5_EntityHelpers.getRealActorFromID(actor.system.vehicleOwner.id)
        if (actor) actor.rollTest("resistanceCard", null, messageData)
        break
      case "scatter":
        // Only a scatter that happened spends the button: a refused one leaves it for the attacker or the GM
        // and leaves the distance on the card in its place
        {
          const distance = await SR5_CombatHelpers.rollScatter(messageData)
          if (distance !== false) SR5_RollMessage.updateChatButtonHelper(messageId, type, distance)
        }
        break
      case "iceEffect":
        SR5_MatrixHelpers.applyIceEffect(messageData, originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "linkLock":
        SR5_MatrixHelpers.applylinkLockEffect(originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "catchFire":
        SR5_ActorHelper.fireDamageEffect(actor.id)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "targetLocked":
        SR5_CombatHelpers.lockTarget(messageData, originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "jackOut":
        SR5_MatrixHelpers.rollJackOut(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "jackOutSuccess":
        SR5_MatrixHelpers.jackOut(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "eraseMark":
        SR5_MarkHelpers.eraseMarkChoice(messageData)
        break
      case "eraseMarkSuccess":
        if (!game.user?.isGM) {
          SR5_SocketHandler.emitForGM("eraseMark", {
            cardData: messageData
          })
        } else SR5_MarkHelpers.eraseMark(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "checkOverwatchScore":
        SR5_MatrixHelpers.rollOverwatchDefense(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "matrixJamSignals":
        SR5_MatrixHelpers.jamSignals(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "denialOfService":
        SR5_MatrixHelpers.applyDenialOfServiceEffect(messageData, originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "haywire":
        SR5_MatrixHelpers.applyHaywireEffect(messageData, originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "iAmTheFirewall":
        SR5_MatrixHelpers.applyIAmTheFirewallEffect(messageData, speaker, SR5_EntityHelpers.getRealActorFromID(messageData.owner.actorId))
        break
      case "intervene":
        if (await SR5_MatrixHelpers.applyInterveneEffect(messageData, speaker, SR5_EntityHelpers.getRealActorFromID(messageData.owner.actorId))) SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "popup":
        SR5_MatrixHelpers.applyPopupEffect(messageData, originalActionActor, actor)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "reduceService":
      case "reduceTask":
        SR5_ThirdPartyHelpers.reduceSideckickService(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "registerSprite":
      case "bindSpirit":
        SR5_ThirdPartyHelpers.enslavedSidekick(messageData, type)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "ritualSealed":
        SR5_ThirdPartyHelpers.sealRitual(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "killComplexFormResistance":
      case "dispellResistance":
      case "disjointingResistance":
      case "enchantmentResistance":
      case "summoningResistance":
      case "compileSpriteResist":
      case "preparationResist":
      case "ritualResistance":
      case "escapeEngulfDefense":
      case "weaponResistance":
        SR5_ThirdPartyHelpers.createItemResistance(messageData, messageId)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "desactivateFocus":
        SR5_ThirdPartyHelpers.desactivateFocus(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "reduceSpell":
      case "reduceComplexForm":
      case "reducePreparationPotency":
        await SR5_ThirdPartyHelpers.reduceTransferedEffect(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "toxinEffect":
        actor.applyToxinEffect(messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "escapeEngulf":
        actor.rollTest(type, null, messageData)
        break
      case "regeneration":
        SR5_ActorHelper.regenerate(messageData.owner.speakerId, messageData)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "heal":
        if (await SR5_ActorHelper.heal(messageData.owner.actorId, messageData) === false) return
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "decreaseReach":
      case "decreaseAccuracy":
        await SR5_ThirdPartyHelpers.applyEffectToItem(messageData, type)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "removeCase":
        await SR5_MiscellaneousHelpers.updateActorData(messageData.target.actorId, "maglock.caseRemoved", 0, true)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      case "removeAntiTamper":
        await SR5_MiscellaneousHelpers.updateActorData(messageData.target.actorId, "maglock.hasAntiTamper", 0, true)
        SR5_RollMessage.updateChatButtonHelper(messageId, type)
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${type}' type in chatButtonAction`)
    }               

    //Attacker test : previous Actor or token is automatically selected
    if (action === "attackerTest" && messageData) {
      if (!game.user.isGM && game.user.id !== messageData.previousMessage.userId) return ui.notifications.warn(game.i18n.localize("SR5.WARN_DontHavePerm"))
      switch (type) {
        case "spendNetHits": {
          let targetActor = SR5_EntityHelpers.getRealActorFromID(messageData.owner.actorId)
          SR5_CalledShotHelpers.chooseSpendNetHits(message, targetActor)
          break
        }
        case "trickShot":
          actor = SR5_EntityHelpers.getRealActorFromID(messageData.previousMessage.actorId)
          await actor.applyCalledShotsEffect(messageData)
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown '${type}' type in chatButtonAction (attacker Test)`)
      }
    }
  }

  //Remove or change buttons after action is done
  static async updateChatButton(message, buttonToUpdate, firstOption){
    if (buttonToUpdate === undefined) return

    //Delete useless buttons
    message = await game.messages.get(message)
    if (!message) return
    let messageData = foundry.utils.duplicate(message.flags?.sr5data)
    for (let key in messageData.chatCard.buttons){
      if (key === buttonToUpdate) await message.update({
        [`flags.sr5data.chatCard.buttons.-=${key}`]: null
      }, {
        render: false
      })
    }
    messageData = foundry.utils.duplicate(message.flags.sr5data)

    //Get actor if any
    let actor
    if (messageData.owner.actorId) actor = SR5_EntityHelpers.getRealActorFromID(messageData.owner.actorId)

    //Special cases : add buttons or end action description
    let endLabel, hits

    switch (buttonToUpdate) {
      case "damage":
        if (messageData.combat.calledShot.name === "splittingDamage") {
          if (messageData.damage.splittedTwo){
            messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.damage.splittedOne}${game.i18n.localize('SR5.DamageTypeStunShort')} & ${messageData.damage.splittedTwo}${game.i18n.localize('SR5.DamageTypePhysicalShort')} ${game.i18n.localize("SR5.AppliedDamage")}`)
          } else messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.damage.splittedOne}${game.i18n.localize('SR5.DamageTypeStunShort')} ${game.i18n.localize("SR5.AppliedDamage")}`)
        } else messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.damage.value}${game.i18n.localize(SR5.damageTypesShort[firstOption ?? messageData.damage.type])} ${game.i18n.localize("SR5.AppliedDamage")}`)
        break
      case "takeMatrixDamage":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.damage.matrix.value} ${game.i18n.localize("SR5.AppliedDamage")}`)
        break
      case "eraseMarkSuccess":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.MatrixActionEraseMarkSuccess"))
        break
      case "reduceTask":
        if ((actor.system.tasks.value - messageData.roll.netHits) <= 0 ) endLabel = game.i18n.localize("SR5.DecompiledSprite")
        else endLabel = `${game.i18n.format('SR5.INFO_TasksReduced', {
          task: messageData.roll.netHits
        })}`
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", endLabel)
        break
      case "reduceService":
        if ((actor.system.services.value - messageData.roll.netHits) <= 0 ) endLabel = game.i18n.localize("SR5.BanishedSpirit")
        else endLabel = `${game.i18n.format('SR5.INFO_ServicesReduced', {
          service: messageData.roll.netHits
        })}`
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", endLabel)
        break
      case "reduceComplexForm": {
        let targetedComplexForm = await fromUuid(messageData.target.itemUuid)
        if (targetedComplexForm.system.hits <= 0) endLabel = `${game.i18n.format('SR5.INFO_ComplexFormKilled', {
          name: targetedComplexForm.name
        })}`
        else endLabel = `${game.i18n.format('SR5.INFO_ComplexFormReduced', {
          name: targetedComplexForm.name, hits: messageData.roll.netHits
        })}`
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", endLabel)
        break
      }
      case "applyEffect":
      case "applyEffectAuto":
      case "calledShotEffect":
      case "applyStunnedEffect":
      case "applyFearEffect":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.EffectApplied"))
        break
      case "decreaseReach":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.WeaponReachDecreased"))
        if (messageData.chatCard.buttons.decreaseAccuracy) delete messageData.chatCard.buttons.decreaseAccuracy
        break
      case "scatter":
        // The scatter rolled by the button stays on the card: distance in meters, or no scatter (SR5 p. 183, 285)
        if (Number.isFinite(firstOption)) messageData.chatCard.buttons.scatterDone = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", firstOption > 0 ? game.i18n.format("SR5.INFO_ScatterDistance", {
          distance: firstOption
        }) : game.i18n.localize("SR5.INFO_NoScattering"))
        break
      case "decreaseAccuracy":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.AccuracyDecreased"))
        if (messageData.chatCard.buttons.decreaseReach) delete messageData.chatCard.buttons.decreaseReach
        break
      case "iceEffect":
        hits = messageData.previousMessage.hits - messageData.roll.hits
        switch (messageData.test.typeSub){
          case "iceBlaster":
            messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.EffectLinkLockedConnection"))
            break
          case "iceAcid":
          case "iceCatapult":
            messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", `${game.i18n.format('SR5.EffectReduceFirewallDone', {
              hits: hits
            })}`)
            break
          case "iceJammer":
            messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", `${game.i18n.format('SR5.EffectReduceAttackDone', {
              hits: hits
            })}`)
            break
          case "iceBinder":
            messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", `${game.i18n.format('SR5.EffectReduceDataProcessingDone', {
              hits: hits
            })}`)
            break
          case "iceMarker":
            messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", `${game.i18n.format('SR5.EffectReduceSleazeDone', {
              hits: hits
            })}`)
            break
                    
        }
        break
      case "toxinEffect":
        if (messageData.damage.toxin.type === "airEngulf"){
          //Generate Resistance chat button
          let label = `${game.i18n.localize("SR5.TakeOnDamageShort")} ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${messageData.damage.base}${game.i18n.localize(SR5.damageTypesShort[messageData.damage.type])}`
          if (messageData.combat.armorPenetration) label += ` / ${game.i18n.localize("SR5.ArmorPenetrationShort")}${game.i18n.localize("SR5.Colons")} ${messageData.combat.armorPenetration}`
          messageData.chatCard.buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest","resistanceCard",label)
          messageData.damage.resistanceType = "physicalDamage"
          let oldMessage = game.messages.get(messageData.previousMessage.messageId)
          // With no GM the player updates the card themselves (updatesCardLocally), and the previous card may not be
          // theirs: Foundry refused the delete and the escape button was never added. That card then stays.
          if (oldMessage?.canUserModify(game.user, "delete")) await oldMessage.delete()
          //Escape engulf
          messageData.chatCard.buttons.escapeEngulf = SR5_RollMessage.generateChatButton("nonOpposedTest","escapeEngulf", game.i18n.localize("SR5.EscapeEngulfAttempt"))
          messageData.previousMessage.messageId = message.id
        }
        break
      case "regeneration":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.roll.netHits} ${game.i18n.localize("SR5.HealedBox")}`)
        break
      case "heal":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.roll.netHits}${game.i18n.localize(SR5.damageTypesShort[messageData.test.typeSub])} ${game.i18n.localize("SR5.Healed")}`)
        messageData.extendedTest = false
        break
      case "firstAid":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${messageData.roll.netHits}${game.i18n.localize(SR5.damageTypesShort[firstOption])} ${game.i18n.localize("SR5.Healed")}`)
        break
      case "removeCase":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.MaglockCaseRemoved"))
        break
      case "removeAntiTamper":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.MaglockAntiTamperRemoved"))
        break
      case "bindSpirit":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.BoundSpirit"))
        break
      case "reduceSpell":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", `${game.i18n.localize("SR5.DispellingSuccessful")} (${messageData.roll.netHits} ${game.i18n.localize("SR5.DiceHits")})`)
        break
        //case "reduceComplexForm":
      case "reducePreparationPotency":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", `${game.i18n.localize("SR5.DisjointingSuccessful")} (${messageData.roll.netHits} ${game.i18n.localize("SR5.DiceHits")})`)
        break
      case "createPreparation":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.PreparationCreateSuccessful"))
        break
      case "jackOutSuccess":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.MatrixActionJackOutSuccessFul"))
        break
      case "compileSprite":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", `${game.i18n.localize("SR5.CompiledSprite")} [${game.i18n.localize(SR5.spriteTypes[messageData.matrix.spriteType])} (${messageData.matrix.level})]`)
        break
      case "ritualSealed":
        messageData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", game.i18n.localize("SR5.RitualSealed"))
        break
      default:
    }

    if (buttonToUpdate === "templateRemove") messageData.chatCard.templateRemove = false
    if (buttonToUpdate === "templatePlace") {
      messageData.chatCard.templateRemove = true
      messageData.chatCard.templatePlace = false
    }

    //Remove Edge action & Edit succes so it can't be used after action end
    if (buttonToUpdate !== "templateRemove" && buttonToUpdate !== "templatePlace"){
      messageData.edge.canUseEdge = false
      //messageData.chatCard.canEditResult = false;
    }

    await SR5_RollMessage.updateRollCardHelper(message.id, messageData)
  }

  //Update the stat of a chatMessage button
  static async updateChatButtonHelper(message, button, firstOption){
    if (!game.user?.isGM && !updatesCardLocally(game.messages.get(message))) {
      await SR5_SocketHandler.emitForGM("updateChatButton", {
        message: message,
        buttonToUpdate: button,
        firstOption: firstOption,
      })
    } else await SR5_RollMessage.updateChatButton(message, button, firstOption)
  }

  static async _socketUpdateChatButton(message){
    await SR5_RollMessage.updateChatButton(message.data.message, message.data.buttonToUpdate, message.data.firstOption)
  }

  //Return data for a chat button
  static generateChatButton(testType, actionType, label, gmAction){
    if (gmAction) gmAction = "chat-button-gm"
    else gmAction = ""

    let button = {
      testType: testType,
      actionType: actionType,
      label: label,
      gmAction: gmAction,
    }
    return button
  }

  //Update data on roll chatMessage
  static async updateRollCard(message, newMessage){
    let messageToUpdate = await game.messages.get(message)
    let template = messageToUpdate.flags.sr5data?.sr5template || messageToUpdate.flags.sr5template
    return foundry.applications.handlebars.renderTemplate(template, newMessage).then((html) => {
      const temp = document.createElement("div")
      temp.innerHTML = html
      const divButtons = temp.querySelector('[id="srButtonTest"]')
      for (let button in newMessage.chatCard.buttons){
        divButtons.insertAdjacentHTML("beforeend", `<button class="messageAction ${newMessage.chatCard.buttons[button].testType}" data-action="${newMessage.chatCard.buttons[button].testType}" data-type="${newMessage.chatCard.buttons[button].actionType}">${newMessage.chatCard.buttons[button].label}</button>`)
      }
      html = temp.innerHTML
      messageToUpdate.update({
        "flags.sr5data": newMessage,
        content: html,
      })
    })
  }

  static async _socketUpdateRollCard(message){
    await SR5_RollMessage.updateRollCard(message.data.message, message.data.newMessage)
  }

  static async updateRollCardHelper(message, newMessage){
    if (!game.user?.isGM && !updatesCardLocally(game.messages.get(message))) {
      await SR5_SocketHandler.emitForGM("updateRollCard", {
        message: message,
        newMessage: newMessage,
      })
    } else await SR5_RollMessage.updateRollCard(message, newMessage)
  }

  //Remove a template from scene on click: the card's own template when it recorded one, not the item's first
  static async removeTemplate(message, itemUuid, templateId){
    if (!canvas.scene){
      SR5_RollMessage.updateChatButtonHelper(message, "templateRemove")
      ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoActiveScene")}`)
      return
    }
    let template = SR5_SystemHelpers.findItemTemplate(itemUuid, templateId, "itemUuid")
    // A template belongs to whoever placed it (and the GM): anyone else is refused by Foundry, so say it plainly
    // and leave the button as it is for the one who can use it
    if (template && !template.canUserModify(game.user, "delete")) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_TemplateNotYours")}`)
    if (template){
      canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [template.id])
      if (message) SR5_RollMessage.updateChatButtonHelper(message, "templateRemove")
    } else {
      ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoTemplateInScene")}`)
      if (message) SR5_RollMessage.updateChatButtonHelper(message, "templateRemove")
    }
  }

    
}