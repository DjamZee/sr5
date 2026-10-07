import {
  droneAutopilot
} from "../../entities/actors/rcc.js"

//An autopilot faced with something new or unexpected rolls its Device Rating × 2, against a threshold the gamemaster
//sets from how confusing the situation is (SR5 p. 271). Failed, it carries on regardless, or stops and asks for orders
export default function autopilotUnforeseen(rollData, actor){
  const rating = actor.system.attributes.pilot?.augmented?.value ?? droneAutopilot(actor.system)
  rollData.test.title = game.i18n.localize("SR5.AutopilotUnforeseen")

  const label = game.i18n.localize("SR5.VehicleStat_PilotShort")
  rollData.dicePool.composition = [{
    source: label, type: "linkedAttribute", value: rating
  }, {
    source: label, type: "linkedAttribute", value: rating
  }]
  rollData.dicePool.base = rating * 2

  rollData.test.type = "autopilotUnforeseen"
  return rollData
}
