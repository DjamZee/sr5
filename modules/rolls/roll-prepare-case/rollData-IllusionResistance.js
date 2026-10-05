import {
  SR5
} from "../../config.js"
import {
  illusionResistanceAttributes
} from "../roll-helpers/illusion.js"

//Resisting an Invisibility or a Mask to see through it (SR5 p. 292, 294). The threshold, the caster's hits, is not
//in the roll: the active GM compares it in his ledger (system/illusion.js) and says only whether it was seen through
export default async function illusionResistance(rollData, actor, chatData){
  let spellItem = await fromUuid(chatData.owner.itemUuid)
  if (!spellItem) return
  rollData.test.title = `${game.i18n.localize("SR5.IllusionResist")}${game.i18n.localize("SR5.Colons")} ${spellItem.name}`

  //A drone or a device resists a physical illusion as a highly processed object (SR5 p. 295), as for spellResistance
  if (actor.type === "actorDrone" || actor.type === "actorDevice"){
    rollData.dicePool.base = 15
    rollData.dicePool.composition = [{
      source: game.i18n.localize("SR5.ObjectHighlyProcessed"), type: "linkedAttribute", value: 15
    }]
  } else {
    rollData.dicePool.composition = illusionResistanceAttributes(spellItem.system.type).map(key => ({
      source: game.i18n.localize(SR5.allAttributes[key]), type: "linkedAttribute", value: actor.system.attributes[key]?.augmented.value ?? 0
    }))
    rollData.dicePool.base = rollData.dicePool.composition.reduce((sum, c) => sum + c.value, 0)
  }

  rollData.test.type = "illusionResistance"
  rollData.previousMessage.itemUuid = chatData.owner.itemUuid
  rollData.previousMessage.messageId = chatData.owner.messageId
  return rollData
}
