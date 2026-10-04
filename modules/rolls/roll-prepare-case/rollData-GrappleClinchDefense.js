import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"

//Run & Gun p. 133 (Saisie): the clinched character defends with Reaction + Intuition
export default function grappleClinchDefense(rollData, actor, chatData){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.Defense")} ${game.i18n.localize("SR5.Against")} ${game.i18n.localize("SR5.GrappleClinch")} (${chatData.roll.hits})`

  //Determine dicepool composition
  rollData.dicePool.composition = ([
    {
      source: game.i18n.localize("SR5.Reaction"), type: "linkedAttribute", value: actor.system.attributes.reaction.augmented.value
    },
    {
      source: game.i18n.localize("SR5.Intuition"), type: "linkedAttribute", value: actor.system.attributes.intuition.augmented.value
    },
  ])

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Add others informations
  rollData.test.type = "grappleClinchDefense"
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.actorId = chatData.owner.actorId
  rollData.previousMessage.messageId = chatData.owner.messageId

  return rollData
}
