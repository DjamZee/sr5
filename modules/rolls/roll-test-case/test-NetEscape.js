import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  netEffectOf, netEscaped
} from "../roll-helpers/net-rules.js"
import {
  removeNet
} from "../roll-helpers/net.js"

//Run & Gun p. 25: as many hits as the attacker's net hits frees the character from the net; the threshold is read on the
//net itself, not on the dialog
export default async function netEscapeInfo(cardData, actorId){
  const actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  const net = netEffectOf(actor)
  const free = !net || netEscaped(cardData.roll.hits, net.system.value)
  if (free && net) await removeNet(actor)
  cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(free ? "SR5.NetEscapeSuccess" : "SR5.NetEscapeFailed"))
}
