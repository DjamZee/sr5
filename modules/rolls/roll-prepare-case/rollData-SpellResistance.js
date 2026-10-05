import {
  SR5 
} from "../../config.js"
import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  addGreyManaResistance
} from "../../system/grey-mana.js"

//The attributes a spell is resisted with: one or two, a blank one is skipped
export function spellResistanceAttributes(spellData) {
  return [spellData.defenseFirstAttribute, spellData.defenseSecondAttribute].filter(Boolean)
}

export default async function spellResistance(rollData, actor, chatData){
  if (actor.type === "actorAgent" || actor.type === "actorSprite" || actor.type === "actorDevice") return
  let spellItem = await fromUuid(chatData.owner.itemUuid)
  let spellData = spellItem.system

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.ResistSpell")}${game.i18n.localize("SR5.Colons")} ${spellItem.name}`

  //Determine base dicepool & composition
  if (actor.type === "actorDrone" || actor.type === "actorDevice"){
    rollData.dicePool.base = 15
    rollData.dicePool.composition = ([{
      source: game.i18n.localize("SR5.ObjectHighlyProcessed"), type: "linkedAttribute", value: 15
    }])
  } else {
    //A spell resisted by a single attribute leaves the second one blank (Decrease Reflexes: Reaction, GRI p. 109)
    rollData.dicePool.composition = spellResistanceAttributes(spellData).map(key => ({
      source: game.i18n.localize(SR5.allAttributes[key]), type: "linkedAttribute", value: actor.system.attributes[key]?.augmented.value ?? 0
    }))
    rollData.dicePool.base = rollData.dicePool.composition.reduce((sum, c) => sum + c.value, 0)
  }

  //Add others informations
  rollData.test.type = "spellResistance"
  rollData.magic.force = chatData.magic.force
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.itemUuid = chatData.owner.itemUuid
  rollData.previousMessage.messageId = chatData.owner.messageId

  //Better Than Bad p. 140-141: grey mana adds its rating against any targeted magic
  rollData = addGreyManaResistance(rollData, actor, game.i18n.localize("SR5.GreyMana"))

  //Add transferable effects
  rollData = SR5_PrepareRollHelper.addTransferableEffect(rollData, spellItem)

  return rollData

}