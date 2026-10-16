import {
  SR5
} from "../../config.js"

//Deus vult ! / Mon pays (Manuel de l'assassin p. 14-15): « un test de Volonté », a single attribute (SR5 p. 154),
//against the boxes taken since the first test, asked by the GM's card at the start of the action phase
export default function woundResolve(rollData, actor, chatData){
  const threshold = parseInt(chatData?.woundResolve?.threshold) || 0
  rollData.test.title = `${game.i18n.localize("SR5.WoundResolveTitle")} (${game.i18n.localize("SR5.Threshold")} ${threshold})`

  const willpower = actor.system.attributes.willpower?.augmented.value ?? 0
  rollData.dicePool.composition = [{
    source: game.i18n.localize(SR5.allAttributes.willpower), type: "linkedAttribute", value: willpower
  }]
  rollData.dicePool.base = willpower

  rollData.threshold.value = threshold
  rollData.dialogSwitch.penalty = true
  rollData.test.type = "woundResolve"
  rollData.various = rollData.various || {
  }
  rollData.various.woundResolve = {
    cardId: chatData?.woundResolve?.cardId
  }

  return rollData
}
