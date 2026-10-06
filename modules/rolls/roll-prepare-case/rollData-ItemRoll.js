import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"

export default function itemRoll(rollData, item){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.Use")} ${item.name}`

  //Determine dicepool composition
  //The other modifiers are listed below: in the base too, they would count twice
  rollData.dicePool.composition = SR5_PrepareRollHelper.getDicepoolComposition(item.system.test.modifiers)

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, item.system.test.modifiers)

  //Add others informations
  rollData.test.type = "itemRoll"

  return rollData
}