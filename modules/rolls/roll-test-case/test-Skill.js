import {
  drainShown
} from "../roll-helpers/mentorMaskDrain.js"
import {
  SR5
} from "../../config.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5_CombatHelpers
} from "../roll-helpers/combat.js"
import {
  hasSingleMonitor, patientMonitors, wearsFullArmor, firstAidHealedBoxes
} from "../roll-helpers/cardRoller.js"
import {
  underFireRules, bbPatientEntry, bbThreshold
} from "../../system/bb-healing.js"
import {
  diagnosisBonus, stabilizedTreatmentBoxes, believedHits, believedStabilizationReduction
} from "../../system/bb-healing-rules.js"

// Bullets & Bandages p. 14-15, world setting: the stabilization (extended) and the diagnosis of the targeted patient.
// The GM applies the result (chat-button-gm): the ledger is his. Returns true when the card is one of those
function bbCard(cardData, patient){
  if (!underFireRules()) return false
  const mode = cardData.test.bbMode
  if (mode !== "stabilization" && mode !== "diagnosis") return false
  const end = (key, data) => cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format(key, data ?? {
  }))
  if (!patient) {
    end("SR5.BB_NeedTarget")
    return true
  }
  //The threshold is the GM's (BB p. 15): he sets it when he applies the result, the card only shows the hits
  if (mode === "diagnosis"){
    if (diagnosisBonus(cardData.roll, 1)) cardData.chatCard.buttons.bbDiagnose = SR5_RollMessage.generateChatButton("nonOpposedTest", "bbDiagnose", game.i18n.format("SR5.BB_DiagnoseButton", {
      hits: cardData.roll.hits
    }), {
      gmAction: true
    })
    else end("SR5.BB_DiagnoseFailed")
    return true
  }
  //A new roll of the extended test rewrites the card: the button of the previous roll goes. Taken out of the
  //card's data here, and out of the message's flags by the "-=" keys of updateRollCard (roll-message.js)
  delete cardData.chatCard.buttons.actionEnd
  delete cardData.chatCard.buttons.bbStabilize
  //SR5 p. 51: a critical glitch ends an extended test
  if (cardData.roll.criticalGlitchRoll) {
    end("SR5.BB_StabilizeFailed")
    return true
  }
  const threshold = bbThreshold(patient)
  const hits = believedHits(cardData.roll.hits, cardData.dicePool?.value, cardData.test?.extended?.roll)
  if (hits >= threshold){
    //The count the GM makes again when he applies it (bb-healing.js, stabilizationCardReduction)
    const reduction = believedStabilizationReduction(cardData.roll, cardData.dicePool?.value, cardData.test?.extended?.roll, threshold)
    cardData.chatCard.buttons.bbStabilize = SR5_RollMessage.generateChatButton("nonOpposedTest", "bbStabilize", game.i18n.format("SR5.BB_StabilizeButton", {
      reduction
    }), {
      gmAction: true
    })
  } else end("SR5.BB_StabilizeProgress", {
    hits, threshold
  })
  return true
}

export default async function skillInfo(cardData){
  let itemTarget
  let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
  let actorData = actor.system

  let testType = cardData.target.hasTarget ? "nonOpposedTest" : "opposedTest"

  if (cardData.target.itemUuid) itemTarget = await fromUuid(cardData.target.itemUuid)

  switch (cardData.test.typeSub){
    case "astralCombat":
      if (cardData.roll.hits > 0) cardData.chatCard.buttons.defenseAstralCombat = SR5_RollMessage.generateChatButton("opposedTest","defenseAstralCombat",game.i18n.localize("SR5.Defend"))
      break
    case "banishing":
      cardData.chatCard.buttons.banishingResistance = SR5_RollMessage.generateChatButton(testType, "banishingResistance", game.i18n.localize("SR5.SpiritResistance"), {
        gmAction: true
      })
      break
    case "binding":
      cardData.chatCard.buttons.bindingResistance = SR5_RollMessage.generateChatButton(testType, "bindingResistance", game.i18n.localize("SR5.SpiritResistance"), {
        gmAction: true
      })
      break
    case "counterspelling":
      if (itemTarget){
        //Get Drain value
        cardData.magic.drain.value = itemTarget.system.drainValue.value
        if (itemTarget.system.force > actorData.specialAttributes.magic.augmented.value) cardData.magic.drain.type = "physical"
        else cardData.magic.drain.type = "stun"
        //Add buttons to chat
        cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${drainShown(cardData, cardData.owner.actorId)})`)
        if (cardData.roll.hits > 0) cardData.chatCard.buttons.dispellResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "dispellResistance", game.i18n.localize("SR5.SpellResistance"), {
          gmAction: true
        })
      }
      break
    case "disenchanting":
      if (itemTarget){
        if (itemTarget.type === "itemPreparation"){
          cardData.magic.drain.value = itemTarget.system.drainValue.value
          if (cardData.roll.hits > actorData.specialAttributes.magic.augmented.value) cardData.magic.drain.type = "physical"
          else cardData.magic.drain.type = "stun"
          cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${drainShown(cardData, cardData.owner.actorId)})`)
        }
        if (cardData.roll.hits > 0) {
          if (itemTarget.type === "itemFocus") cardData.chatCard.buttons.enchantmentResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "enchantmentResistance", game.i18n.localize("SR5.EnchantmentResistance"), {
            gmAction: true
          })
          if (itemTarget.type === "itemPreparation") cardData.chatCard.buttons.disjointingResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "disjointingResistance", game.i18n.localize("SR5.DisjointingResistance"), {
            gmAction: true
          })
        }
      }
      break
    case "escapeArtist":
      if (cardData.roll.hits >= cardData.threshold.value){
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.EscapeArtistSuccess"))
      } else {
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.EscapeArtistFailed"))
      }
      break
    case "firstAid": {
      //SR5 p. 150: a targeted device or drone is no patient: no 1D3 to ask a type for, no box to heal
      let targetActor = cardData.target.hasTarget ? SR5_EntityHelpers.getRealActorFromID(cardData.target.actorId, cardData.actorUuids) : null
      if (targetActor && !patientMonitors(targetActor).length) {
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.HealingFailed"))
        break
      }
      if (bbCard(cardData, targetActor)) break
      //SR5 p. 207: a critical glitch adds 1D3 boxes, rolled once per test even if the card is refreshed (Edge)
      if (cardData.roll.criticalGlitchRoll) {
        if (!cardData.roll.criticalGlitchDamage) {
          let failedDamage = new Roll(`1d3`)
          await failedDamage.evaluate()
          //A targeted patient with a single condition monitor has no damage type to choose
          let patient = cardData.target.hasTarget ? SR5_EntityHelpers.getRealActorFromID(cardData.target.actorId, cardData.actorUuids) : null
          cardData.roll.criticalGlitchDamage = {
            value: failedDamage.total, type: hasSingleMonitor(patient) ? "condition" : await SR5_CombatHelpers.chooseDamageType()
          }
        }
        cardData.damage.value = cardData.roll.criticalGlitchDamage.value
        cardData.damage.type = cardData.roll.criticalGlitchDamage.type
        //The type dialog may have been cancelled: the button then asks for it when clicked
        let damageType = cardData.damage.type ? game.i18n.localize(SR5.damageTypesShort[cardData.damage.type]) : ""
        if (cardData.target.hasTarget) cardData.chatCard.buttons.damage = SR5_RollMessage.generateChatButton("nonOpposedTest", "damage", `${game.i18n.format('SR5.HealButtonFailed', {
          hits: cardData.damage.value, damageType: damageType
        })}`)
        else cardData.chatCard.buttons.damage = SR5_RollMessage.generateChatButton("opposedTest", "damage", `${game.i18n.format('SR5.HealButtonFailed', {
          hits: cardData.damage.value, damageType: damageType
        })}`)
      } else if (cardData.roll.hits > 2) {
        //SR5 p. 207: a targeted patient in full armor halves the effects, before the skill rating cap
        //Without a target the patient is only known on click: the cap is kept for the halving done there (roll-message.js)
        let fullArmor = wearsFullArmor(targetActor)
        cardData.roll.firstAidCap = actorData.skills.firstAid.rating.value
        cardData.roll.netHits = firstAidHealedBoxes(cardData.roll.hits, 2, actorData.skills.firstAid.rating.value, fullArmor)
        //Bullets & Bandages p. 16: a stabilized patient heals 2 boxes per net hit; a bleeding one out of the overflow
        //is stabilized too, which the GM applies
        const bbEntry = underFireRules() ? bbPatientEntry(targetActor) : {
        }
        if (bbEntry.stabilized) cardData.roll.netHits = stabilizedTreatmentBoxes(cardData.roll.hits, 2, actorData.skills.firstAid.rating.value, cardData.test.bbMedkitRating, fullArmor)
        if (bbEntry.bleeding && !(targetActor.system.conditionMonitors.overflow?.actual?.value > 0)) {
          cardData.chatCard.buttons.bbStabilize = SR5_RollMessage.generateChatButton("nonOpposedTest", "bbStabilize", game.i18n.format("SR5.BB_StabilizeButton", {
            reduction: 0
          }), {
            gmAction: true
          })
        }
        if (cardData.target.hasTarget) cardData.chatCard.buttons.firstAid = SR5_RollMessage.generateChatButton("nonOpposedTest", "firstAid", `${game.i18n.format(fullArmor ? 'SR5.FirstAidButtonFullArmor' : 'SR5.FirstAidButton', {
          hits: cardData.roll.netHits
        })}`)
        else cardData.chatCard.buttons.firstAid = SR5_RollMessage.generateChatButton("opposedTest", "firstAid", `${game.i18n.format('SR5.FirstAidButton', {
          hits: cardData.roll.netHits
        })}`)
      } else {
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.HealingFailed"))
      }
      break
    }
    //Bullets & Bandages p. 15: Medicine diagnoses too
    case "medecine":
      bbCard(cardData, cardData.target.hasTarget ? SR5_EntityHelpers.getRealActorFromID(cardData.target.actorId, cardData.actorUuids) : null)
      break
    case "locksmith": {
      let targetActor = SR5_EntityHelpers.getRealActorFromID(cardData.target.actorId, cardData.actorUuids)
      if (cardData.threshold.value > 0){
        if (targetActor.system.maglock.type.cardReader || targetActor.system.maglock.type.keyPads){
          if (targetActor.system.maglock.hasAntiTamper && targetActor.system.maglock.caseRemoved){
            if (cardData.roll.hits >= cardData.threshold.value) cardData.chatCard.buttons.removeAntiTamper = SR5_RollMessage.generateChatButton("nonOpposedTest","removeAntiTamper", game.i18n.localize("SR5.MaglockRemoveAntiTamper"))
            else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.AlarmTriggered"))
          } else if (cardData.roll.hits >= cardData.threshold.value) {
            if (!targetActor.system.maglock.caseRemoved) cardData.chatCard.buttons.removeCase = SR5_RollMessage.generateChatButton("nonOpposedTest","removeCase", game.i18n.localize("SR5.MaglockRemoveCase"))
            else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.MaglockIsOpen"))
            cardData.test.isExtended = false
          }
        }
      }
      break
    }
    case "perception":
      if (cardData.test.isOpposed){
        if (cardData.roll.hits >= cardData.threshold.value) cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.SuccessfulDefense"))
        else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.FailedDefense"))
      } else {
        if (cardData.threshold.value > 0){
          if (cardData.roll.hits >= cardData.threshold.value) cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.PerceptionSuccess"))
          else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.PerceptionFailed"))
        }
      }
      break
    case "summoning":
      cardData.chatCard.buttons.summoningResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "summoningResistance", game.i18n.localize("SR5.SpiritResistance"), {
        gmAction: true
      })
      break
    case "con":
    case "impersonation":
    case "etiquette":
    case "negotiation":
    case "intimidation":
    case "performance":
    case "leadership":
      // The target's roll ends the opposed test; the actor's roll offers "Resist"
      if (cardData.test.isOpposedResistance){
        if (cardData.roll.hits >= cardData.threshold.value) cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.SuccessfulDefense"))
        else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.FailedDefense"))
      } else {
        if (cardData.roll.hits > 0) cardData.chatCard.buttons.con = SR5_RollMessage.generateChatButton("opposedTest", cardData.test.typeSub, game.i18n.localize("SR5.Resist"))
        cardData.test.isOpposed = true
      }
      break
    default:
      //Manage extended tests with threshold
      if (cardData.threshold.value > 0){
        if (cardData.roll.hits >= cardData.threshold.value) {
          cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.SuccessfulTest"))
          cardData.test.isExtended = false
        }
      }
  }
}