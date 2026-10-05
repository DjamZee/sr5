import {
  drainShown
} from "../roll-helpers/mentorMaskDrain.js"
import {
  SR5 
} from "../../config.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5_RollTestHelper 
} from "../roll-test-helper.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  ritualDrainRecipients, ritualDrainKey
} from "../roll-helpers/ritualTeam.js"
import {
  manaShiftKind
} from "../../system/background-count.js"

export default async function defenseResultInfo(cardData, type){
  let key, label, labelEnd, successTestType = "nonOpposedTest", failedTestType = "SR-CardButtonHit endTest", failedKey = ""
  let originalMessage, prevData
  if (cardData.previousMessage.messageId){
    originalMessage = game.messages.get(cardData.previousMessage.messageId)
    prevData = originalMessage.flags?.sr5data
  }

  switch (type){
    case "jackOutDefense":
      label = game.i18n.localize("SR5.MatrixActionJackOutSuccess")
      labelEnd = game.i18n.localize("SR5.MatrixActionJackOutFailed")
      key = "jackOutSuccess"
      break
    case "sensorDefense":
      label = game.i18n.localize("SR5.SensorLockedTarget")
      labelEnd = game.i18n.localize("SR5.SuccessfulDefense")
      key = "targetLocked"
      break
    case "preparationResistance":
      label = game.i18n.localize("SR5.PreparationCreate")
      labelEnd = game.i18n.localize("SR5.PreparationCreateFailed")
      key = "createPreparation"
      break
    case "compilingResistance":
      label = game.i18n.localize("SR5.CompileSprite")
      labelEnd = game.i18n.localize("SR5.FailedCompiling")
      key = "compileSprite"
      cardData.matrix.fading.value = cardData.roll.hits * 2
      if (cardData.matrix.fading.value < 2) cardData.matrix.fading.value = 2
      cardData.chatCard.buttons.fadingResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "fading", `${game.i18n.localize("SR5.ResistFading")} (${cardData.matrix.fading.value})`)
      break
    case "summoningResistance":
      label = game.i18n.localize("SR5.SummonSpirit")
      labelEnd = game.i18n.localize("SR5.FailedSummon")
      key = "summonSpirit"
      cardData.magic.drain.value = cardData.roll.hits * 2
      if (cardData.magic.drain.value < 2) cardData.magic.drain.value = 2
      cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${drainShown(cardData, cardData.owner.actorId)})`)
      break
    case "ritualResistance": {
      label = game.i18n.localize("SR5.RitualSuccess")
      labelEnd = game.i18n.localize("SR5.RitualFailed")
      cardData.magic.drain.value = cardData.roll.hits * 2
      if (prevData.test.realHits > prevData.actorMagic) cardData.magic.drain.type = "physical"
      else cardData.magic.drain.type = "stun"
      if (cardData.magic.reagentsSpent > cardData.magic.force) {
        cardData.magic.drain.modifiers.hits = {
          value: cardData.roll.hits * 2,
          label: game.i18n.localize(SR5.drainModTypes["hits"]),
        }
        let reagentsMod = Math.floor(cardData.magic.reagentsSpent / cardData.magic.force) - 1
        if (reagentsMod > 0) {
          cardData.magic.drain.value -= reagentsMod
          cardData.magic.drain.modifiers.reagents = {
            value: -reagentsMod,
            label: game.i18n.localize(SR5.drainModTypes["reagents"]),
          }
        }
      }
      key = "ritualSealed"
      if (cardData.magic.drain.value < 2) cardData.magic.drain.value = 2
      //SR5 p. 299: with participants, each of them takes the Drain, one button per name
      if (cardData.magic.ritualParticipants?.length) {
        let leader = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId)
        for (let recipient of ritualDrainRecipients({
          actorId: cardData.owner.actorId, name: leader?.name
        }, cardData.magic.ritualParticipants)) {
          cardData.chatCard.buttons[ritualDrainKey(recipient.actorId)] = SR5_RollMessage.generateChatButton("opposedTest ritualDrain", ritualDrainKey(recipient.actorId), `${game.i18n.localize("SR5.ResistDrain")} ${recipient.name} (${drainShown(cardData, recipient.actorId)})`)
        }
      } else cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("opposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${drainShown(cardData, cardData.owner.actorId)})`)

      let item = await fromUuid(cardData.owner.itemUuid)
      if (item.system.durationMultiplier === "netHits"){
        let realActor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId)
        SR5_RollTestHelper.updateItemAfterRoll(cardData, realActor)
      }
      break
    }
    case "eraseMark":
      label = game.i18n.localize("SR5.MatrixActionEraseMark")
      labelEnd = game.i18n.localize("SR5.MatrixActionEraseMarkFailed")
      key = "eraseMarkSuccess"
      if (prevData.chatCard.buttons?.eraseMark) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "eraseMark")
      break
    case "passThroughDefense":
      label = game.i18n.localize("SR5.PassThroughBarrierSuccess")
      labelEnd = game.i18n.localize("SR5.PassThroughBarrierFailed")
      successTestType = "SR-CardButtonHit endTest"
      if (prevData.chatCard.buttons?.passThroughDefense) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "passThroughDefense")
      break
    case "intimidationResistance":
      label = `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.CS_AS_ExtremeIntimidation")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      key = "applyFearEffect"
      if (prevData.chatCard.buttons?.fear) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "fear")
      break
    case "ricochetResistance":
      label = `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.STATUSES_Shaked")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      key = "calledShotEffect"
      if (prevData.chatCard.buttons?.fear) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "fear")
      break
    case "warningResistance":
      label = `${game.i18n.localize("SR5.ShiftAttitude")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      successTestType = "SR-CardButtonHit endTest"
      key = "warningShotEnd"
      if (prevData.chatCard.buttons?.fear) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "fear")
      break
    case "stunnedResistance":
      label = `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.STATUSES_Stunned")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      key = "applyStunnedEffect"
      if (prevData.chatCard.buttons?.stunned) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "stunned")
      break
    case "buckledResistance":
      label = `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.STATUSES_Buckled")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      key = "calledShotEffect"
      if (prevData.chatCard.buttons?.buckled) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "buckled")
      break
    case "nauseousResistance":
      label = `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.STATUSES_Nauseous")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      key = "calledShotEffect"
      if (prevData.chatCard.buttons?.nauseous) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "nauseous")
      break
    case "knockdownResistance":
      label = `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.STATUSES_Knockdown")}`
      labelEnd = game.i18n.localize("SR5.Resisted")
      key = "calledShotEffect"
      if (prevData.chatCard.buttons?.knockdown) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "knockdown")
      break
    case "engulfResistance":
      label = game.i18n.localize("SR5.EscapeEngulfSuccess")
      labelEnd = game.i18n.localize("SR5.EscapeEngulfFailed")
      successTestType = "SR-CardButtonHit endTest"
      if (cardData.roll.hits < cardData.previousMessage.hits) {
        let parentMessage = game.messages.find(m => m.flags.sr5data.chatCard.buttons.escapeEngulf && m.flags.sr5data.owner.actorId === cardData.owner.actorId)
        if (parentMessage) prevData = parentMessage.flags?.sr5data
        if (prevData.chatCard.buttons?.escapeEngulf) {
          SR5_RollMessage.updateChatButtonHelper(parentMessage.id, "escapeEngulf")
          SR5_RollMessage.updateChatButtonHelper(parentMessage.id, "resistanceCard")
        }
      }
      break
  }

  if (cardData.roll.hits < cardData.previousMessage.hits) cardData.chatCard.buttons[key] = SR5_RollMessage.generateChatButton(successTestType, key, label)
  else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton(failedTestType, failedKey, labelEnd)

  //Shadow Spells p. 25: a sealed Mana Flux / Mana Ebb shifts the scene's background count, applied by the GM
  if (type === "ritualResistance" && cardData.roll.hits < cardData.previousMessage.hits){
    const ritual = await fromUuid(cardData.owner.itemUuid)
    const kind = manaShiftKind(ritual?.name)
    if (kind){
      cardData.magic.manaShift = {
        kind, force: cardData.magic.force, name: ritual.name
      }
      cardData.chatCard.buttons.manaShift = SR5_RollMessage.generateChatButton("nonOpposedTest", "manaShift", game.i18n.format(`SR5.ManaShiftApply_${kind}`, {
        hours: cardData.magic.force
      }), true)
    }
  }
}