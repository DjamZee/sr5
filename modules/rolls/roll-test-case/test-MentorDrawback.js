import {
  SR5_RollMessage
} from "../roll-message.js"

//Resisting a mentor's disadvantage (SR5 p. 325): the threshold is met or it is not
export function mentorDrawbackResisted(hits, threshold){
  return (Number(hits) || 0) >= (Number(threshold) || 0)
}

export default async function mentorDrawbackInfo(cardData){
  const label = mentorDrawbackResisted(cardData.roll.hits, cardData.threshold.value) ? "SR5.MentorDrawbackResisted" : "SR5.MentorDrawbackFailed"
  cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(label))
}
