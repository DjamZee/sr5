import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5 
} from "../../config.js"

export default async function healingInfo(cardData){
  if (cardData.roll.glitchRoll || cardData.roll.criticalGlitchRoll) cardData.test.extended.intervalValue = cardData.test.extended.intervalValue *2
  //SR5 p. 208: a critical glitch adds 1D3 boxes, rolled once per test even if the card is refreshed (Edge)
  if (cardData.roll.criticalGlitchRoll) {
    if (!cardData.roll.criticalGlitchDamage) {
      let failedDamage = new Roll(`1d3`)
      await failedDamage.evaluate()
      cardData.roll.criticalGlitchDamage = {
        value: failedDamage.total, type: cardData.test.typeSub
      }
    }
    cardData.damage.value = cardData.roll.criticalGlitchDamage.value
    cardData.damage.type = cardData.roll.criticalGlitchDamage.type
    cardData.chatCard.buttons.damage = SR5_RollMessage.generateChatButton("nonOpposedTest", "damage", `${game.i18n.format('SR5.HealButtonFailed', {
      hits: cardData.damage.value, damageType: (game.i18n.localize(SR5.damageTypesShort[cardData.test.typeSub]))
    })}`)
  }
  //SR5 p. 51: a critical glitch loses the extended test, nothing is healed
  if (cardData.roll.hits > 0 && !cardData.roll.criticalGlitchRoll) cardData.chatCard.buttons.heal = SR5_RollMessage.generateChatButton("nonOpposedTest", "heal", `${game.i18n.format('SR5.HealButton', {
    hits: cardData.roll.hits, damageType: (game.i18n.localize(SR5.damageTypesShort[cardData.test.typeSub]))
  })}`)
  cardData.roll.netHits = cardData.roll.hits
}