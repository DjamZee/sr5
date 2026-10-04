import {
  SR5
} from "../../config.js"
import {
  SR5_CharacterUtility
} from "../../entities/actors/utilityActor.js"

export default function iceDefense(rollData, actor, chatData){
  if (actor.type !== "actorPc" && actor.type !== "actorGrunt" && 
      actor.type !== "actorAgent" && actor.type !== "actorSprite") return void ui.notifications.warn(game.i18n.localize('SR5.WARN_InvalidActorType'))

  //Determine title
  rollData.test.title = game.i18n.localize("SR5.Defense")

  //Determine base dicepool & composition
  let firstAttribute = actor.system.attributes[chatData.various.defenseFirstAttribute].augmented.value || 0
  let firstLabel = SR5.allAttributes[chatData.various.defenseFirstAttribute]
  let secondAttribute = actor.system.matrix.attributes[chatData.various.defenseSecondAttribute].value || 0
  rollData.dicePool.composition = []
  //An AI outside any device defends with its Willpower or Intuition alone, as set for the world,
  //and no matrix attribute (Data Trails p. 157), as against any other matrix action
  let devicelessAI = SR5_CharacterUtility.isDevicelessAI(actor)
  if (devicelessAI && chatData.various.defenseFirstAttribute === "logic") {
    let standIn = SR5_CharacterUtility.devicelessAILogicStandIn(actor.system)
    firstAttribute = standIn.value
    firstLabel = standIn.label
  }
  rollData.dicePool.composition.push({
    source: game.i18n.localize(firstLabel), type: "linkedAttribute", value: firstAttribute
  })
  if (devicelessAI) secondAttribute = 0
  else rollData.dicePool.composition.push({
    source: game.i18n.localize(SR5.matrixAttributes[chatData.various.defenseSecondAttribute]), type: "matrixAttribute", value: secondAttribute
  })
  rollData.dicePool.base = firstAttribute + secondAttribute

  //Determine targeted device: an AI outside any device has none, the IC targets its persona (Data Trails p. 157)
  let deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
  rollData.target.itemUuid = deck?.uuid

  //Add others informations
  rollData.test.type = "iceDefense"
  rollData.test.typeSub = chatData.test.typeSub
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.actorId = chatData.owner.actorId
  rollData.damage.matrix.base = rollData.damage.matrix.value

  return rollData
}