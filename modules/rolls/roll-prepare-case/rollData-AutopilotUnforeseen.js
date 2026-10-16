import {
  droneAutopilot
} from "../../entities/actors/rcc.js"
import {
  confusePilotThreshold, netHitsOf
} from "../roll-helpers/electronic-warfare.js"

//An autopilot faced with something new or unexpected rolls its Device Rating × 2, against a threshold the gamemaster
//sets from how confusing the situation is (SR5 p. 271). Failed, it carries on regardless, or stops and asks for orders
//Confused by a hacker (Rigger 5.0 p. 34), the threshold is half his net hits, read on the defense card
export default function autopilotUnforeseen(rollData, actor, chatData){
  const rating = actor.system.attributes.pilot?.augmented?.value ?? droneAutopilot(actor.system)
  rollData.test.title = game.i18n.localize("SR5.AutopilotUnforeseen")

  const label = game.i18n.localize("SR5.VehicleStat_PilotShort")
  rollData.dicePool.composition = [{
    source: label, type: "linkedAttribute", value: rating
  }, {
    source: label, type: "linkedAttribute", value: rating
  }]
  rollData.dicePool.base = rating * 2

  if (chatData?.test?.typeSub === "confusePilot") {
    rollData.threshold.value = confusePilotThreshold(netHitsOf(chatData.previousMessage?.hits, chatData.roll?.hits))
    rollData.test.title = `${game.i18n.localize("SR5.MatrixActionConfusePilot")}${game.i18n.localize("SR5.Colons")} ${rollData.test.title} (${rollData.threshold.value})`
  }

  rollData.test.type = "autopilotUnforeseen"
  return rollData
}
