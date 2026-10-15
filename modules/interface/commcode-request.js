// Relecture djamz.13 (DjamZ, through Élise): a player who targets the token of a gamemaster's character with
// « Jeton ciblé » asks the gamemaster for its commcode. A card for the gamemasters alone, with Accept and Refuse: the
// active gamemaster adds the contact to the directory of the asking character, and a private message tells the player.
// As the requests already relayed to the gamemaster (deactivation.js): the card names what is asked, never the
// commcode itself (its author reads her own whisper); the gamemaster reads it from the sheet when he accepts.
import {
  directoryFlagOf, setDirectory
} from "./commcode-traffic.js"
import {
  directoryOf, withContact
} from "../system/commcode-rules.js"

export const COMMCODE_REQUEST_FLAG = "commcodeRequest"

const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)
const escape = text => foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")

/** The answer a request carries: "accepted", "refused", or "" while it waits */
export function requestAnswerOf(message){
  const answer = message?.flags?.sr5?.[COMMCODE_REQUEST_FLAG]?.answer
  return answer === "accepted" || answer === "refused" ? answer : ""
}

/**
 * The player asks: one card per token asked
 * @param {Actor} holder         the character whose directory gets the contact
 * @param {Token} token          the token of the gamemaster's character
 */
export async function requestNpcCommcode(holder, token){
  if (!holder || !token?.document) return
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: holder
    }),
    content: `<div class="sr5-commcode-request"><p>${game.i18n.format("SR5.COMMCODE_Request", {
      name: escape(holder.name), target: escape(token.name)
    })}</p><div class="sr5-commcode-request-buttons">
      <button type="button" data-sr5-commcode-request="accept"><i class="fas fa-check"></i> ${game.i18n.localize("SR5.COMMCODE_RequestAccept")}</button>
      <button type="button" data-sr5-commcode-request="refuse"><i class="fas fa-times"></i> ${game.i18n.localize("SR5.COMMCODE_RequestRefuse")}</button>
    </div></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        [COMMCODE_REQUEST_FLAG]: {
          holderUuid: holder.uuid, tokenUuid: token.document.uuid, userId: game.user.id, answer: ""
        }
      }
    },
  })
  ui.notifications?.info(game.i18n.format("SR5.COMMCODE_RequestSent", {
    name: token.name
  }))
}

async function answer(message, accepted){
  const request = message.flags?.sr5?.[COMMCODE_REQUEST_FLAG]
  if (!request || requestAnswerOf(message)) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_RequestDone"))
  const holder = await fromUuid(request.holderUuid)
  const tokenDoc = await fromUuid(request.tokenUuid)
  const name = tokenDoc?.name ?? ""
  if (accepted) {
    const {
      commcodeOfActor
    } = await import("./commcode-window.js")
    const commcode = commcodeOfActor(tokenDoc?.actor)
    if (!holder || !commcode) return ui.notifications?.warn(game.i18n.format("SR5.COMMCODE_TargetNone", {
      name
    }))
    await setDirectory(holder, withContact(directoryOf(directoryFlagOf(holder)), {
      name, commcode
    }, () => foundry.utils.randomID()))
  }
  await message.update({
    [`flags.sr5.${COMMCODE_REQUEST_FLAG}.answer`]: accepted ? "accepted" : "refused"
  })
  // The private message to the player who asked (the gamemasters read it as its author)
  if (request.userId) await ChatMessage.create({
    content: `<div class="sr5-commcode-request"><p>${game.i18n.format(accepted ? "SR5.COMMCODE_RequestAccepted" : "SR5.COMMCODE_RequestRefused", {
      name: escape(holder?.name), target: escape(name)
    })}</p></div>`,
    whisper: [request.userId],
    flags: {
      sr5: {
        commcodeRequestAnswer: true
      }
    },
  })
}

/** The buttons of a request: the gamemaster's alone, the active one answers; gone once answered */
export function activateCommcodeRequestListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-commcode-request]")
  const done = requestAnswerOf(message)
  if (!game.user.isGM || done) {
    buttons.forEach(b => b.remove())
    if (done) html.querySelector(".sr5-commcode-request-buttons")?.insertAdjacentHTML("beforeend",
      `<em>${game.i18n.localize(done === "accepted" ? "SR5.COMMCODE_RequestStateAccepted" : "SR5.COMMCODE_RequestStateRefused")}</em>`)
    return
  }
  buttons.forEach(button => button.addEventListener("click", async event => {
    const btn = event.currentTarget
    if (!isActiveGM()) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_RequestActiveGM"))
    buttons.forEach(b => b.disabled = true)
    await answer(message, btn.dataset.sr5CommcodeRequest === "accept").catch(e => console.error("SR5 | commcode request", e))
    buttons.forEach(b => b.disabled = false)
  }))
}
