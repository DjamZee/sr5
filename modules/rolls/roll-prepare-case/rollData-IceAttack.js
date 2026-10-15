import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  iceTestSubType
} from "../../system/ice-design.js"

//rollKey "blueGooExplosion": the attack Blue Goo makes as it explodes (Kill Code p. 74), launched from its resistance card
export default function iceAttack(rollData, actor, rollKey){
  //Determine title
  rollData.test.title = game.i18n.localize("SR5.IceAttack")

  //Determine base dicepool
  rollData.dicePool.base = actor.system.matrix.ice.attackDicepool

  //Determine dicepool composition
  rollData.dicePool.composition = [
    {
      source: game.i18n.localize("SR5.HostRating"), type: "linkedAttribute", value: actor.system.matrix.deviceRating
    },
    {
      source: game.i18n.localize("SR5.HostRating"), type: "linkedAttribute", value: actor.system.matrix.deviceRating
    },
  ]

  //Determine base limit
  rollData.limit.base = actor.system.matrix.attributes.attack.value
  rollData.limit.type = "attack"
    
  //Handle Actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "iceAttack"
  })

  //Add others informations
  rollData.test.type = "iceAttack"
  // A designed IC (system/ice-design.js) is none of the book's IC: its blocks are read on its defense card
  rollData.test.typeSub = iceTestSubType(actor.system.matrix)
  rollData.damage.matrix.value = actor.system.matrix.attributes.attack.value
  rollData.damage.matrix.base = actor.system.matrix.attributes.attack.value
  rollData.various.defenseFirstAttribute = actor.system.matrix.ice.defenseFirstAttribute
  rollData.various.defenseSecondAttribute = actor.system.matrix.ice.defenseSecondAttribute
  if (rollKey === "blueGooExplosion" && rollData.test.typeSub === "iceBlueGoo") {
    rollData.various.blueGooExplosion = true
    rollData.test.title = game.i18n.localize("SR5.IceBlueGooExplosion")
  }
  if (rollData.test.typeSub === "iceCatapult") {
    rollData.damage.value = rollData.damage.matrix.value 
    rollData.damage.type = "stun"
    rollData.damage.resistanceType = "physicalDamage"
    rollData.damage.isAttack = true
  }
  return rollData
}