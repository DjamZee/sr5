import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  hotDropGear, hotDropSpend
} from "../../system/hot-drop.js"

export default async function liftInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  let derivedBaseValue = actor.system.movements[cardData.test.typeSub].movement.value
  let derivedExtraValue= actor.system.movements[cardData.test.typeSub].extraMovement.value
  cardData.various.unit = game.i18n.localize("SR5.MeterUnit")
    
  switch (cardData.test.typeSub){
    case "treadWater":
      cardData.various.unit = game.i18n.localize("SR5.MinuteUnit")
      break
    case "holdBreath":
      cardData.various.unit = game.i18n.localize("SR5.SecondUnit")
      break
    case "hotDrop":
      cardData.various.unit = ""
      cardData.various.movementTotal = game.i18n.localize("SR5.MovementHotDropDistances")
      await spendHotDrop(actor)
      return
    default:
  }

  cardData.various.movementTotal = derivedBaseValue + (cardData.roll.hits * derivedExtraValue)
}

//Hot-Drop (Street Lethal p. 59): « Le réservoir du dispositif permet 20 utilisations. » The jump spends one, the empty
//tank only warns (the gamemaster says whether it happens)
async function spendHotDrop(actor){
  const gear = hotDropGear(actor?.items)
  if (!gear) return
  const {
    charge, empty
  } = hotDropSpend(gear.system.charge)
  if (empty) return ui.notifications.warn(game.i18n.format("SR5.HotDropEmpty", {
    name: gear.name
  }))
  await gear.update({
    "system.charge": charge
  })
  ui.notifications.info(game.i18n.format("SR5.HotDropUsesLeft", {
    name: gear.name, count: charge
  }))
}
//