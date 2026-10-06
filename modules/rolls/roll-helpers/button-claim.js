import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"

// Two owners of one actor clicking "Encaisser" at the same moment each rolled a resistance, and each card then offered
// to apply the damage (MESURES-F, F6): the button is only removed once a resistance is rolled. The active GM, alone,
// now holds the button for the first owner who asks, reading the card from his own chat log. A hold lapses after
// HOLD_MS, so an owner who closes the dialog without rolling does not lock the others out; the same user may always
// ask again. Without an active GM, or without his answer, the button works as before rather than block the resistance.
export const HOLD_MS = 60000
const REPLY_MS = 5000

// `${messageId}|${type}` -> {userId, until}, on the active GM's browser
const held = new Map()
// requestId -> resolve, on the asking browser
const waiting = new Map()

/** On the GM's browser: whether `userId` may use the button now, holding it for him if so. Nothing is awaited
 * between the test and the hold, so two requests arriving together cannot both pass. */
export function holdButton(key, userId, now = Date.now()){
  const current = held.get(key)
  if (current && current.userId !== userId && current.until > now) return false
  held.set(key, {
    userId, until: now + HOLD_MS
  })
  return true
}

/** On the GM's browser: the card as his chat log keeps it still shows the button, and the user owns the actor
 * that rolls it (the speaker of the card, as chatButtonAction picks it). */
export function grantButton(messageId, type, user){
  const data = game.messages?.get(messageId)?.flags?.sr5data
  if (!data?.chatCard?.buttons?.[type] || !user) return false
  if (!user.isGM){
    const actor = SR5_EntityHelpers.getRealActorFromID(data.owner?.speakerId, data.actorUuids)
    if (!actor?.testUserPermission(user, "OWNER")) return false
  }
  return holdButton(`${messageId}|${type}`, user.id)
}

/** On the clicking browser: true when this user may roll the button now. */
export async function claimChatButton(messageId, type){
  if (game.user.isGM) return grantButton(messageId, type, game.user)
  if (!game.users.activeGM) return true
  const requestId = foundry.utils.randomID()
  const answer = new Promise(resolve => {
    waiting.set(requestId, resolve)
    setTimeout(() => {
      if (waiting.delete(requestId)) resolve(true)
    }, REPLY_MS)
  })
  await SR5_SocketHandler.emitForGM("claimChatButton", {
    messageId, type, requestId
  })
  return answer
}

/** The active GM answers the one who asked, and only him. */
export async function socketClaimChatButton(message, senderId){
  if (message.userId !== game.user.id || game.users.activeGM?.id !== game.user.id) return
  const {
    messageId, type, requestId
  } = message.data ?? {
  }
  const granted = grantButton(messageId, type, game.users.get(senderId))
  if (!granted) SR5_SystemHelpers.srLog(2, `Button ${type} of ${messageId} held for someone else, or gone`)
  await SR5_SocketHandler.emitForPlayer("claimChatButtonReply", {
    requestId, granted
  }, senderId)
}

/** The answer counts only when it comes from a GM. */
export function socketClaimChatButtonReply(message, senderId){
  if (!game.users.get(senderId)?.isGM) return
  const resolve = waiting.get(message.data?.requestId)
  if (!resolve) return
  waiting.delete(message.data.requestId)
  resolve(message.data.granted === true)
}
