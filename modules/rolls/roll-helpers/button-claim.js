import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  isRolledByTarget
} from "./cardRoller.js"

// Two owners of one actor clicking "Encaisser" at the same moment each rolled a resistance, and each card then offered
// to apply the damage (MESURES-F, F6): the button is only removed once a resistance is rolled. The active GM, alone,
// now holds the button for the first owner who asks, reading the card from his own chat log. A hold lapses after
// HOLD_MS, so an owner who closes the dialog without rolling does not lock the others out; the same user may ask again
// while it runs, but asking again never extends it, so no owner can keep the button from the others by asking every
// minute. A GM is never refused, and his click takes the hold. Only the card owner's own button is held: a grenade's
// "Encaisser" is an opposed button that everyone in the blast uses for their own character (Céleste's review).
// Without an active GM, or without his answer, the button works as before rather than block the resistance.
export const HOLD_MS = 60000
const REPLY_MS = 5000

// `${messageId}|${type}` -> {userId, until}, on the active GM's browser
const held = new Map()
// requestId -> resolve, on the asking browser
const waiting = new Map()

/** On the GM's browser: whether `userId` may use the button now, holding it for him if so. Nothing is awaited
 * between the test and the hold, so two requests arriving together cannot both pass. */
export function holdButton(key, userId, now = Date.now(), isGM = false){
  const current = held.get(key)
  if (current && current.until > now){
    if (current.userId === userId) return true
    if (!isGM) return false
  }
  held.set(key, {
    userId, until: now + HOLD_MS
  })
  return true
}

/** On the GM's browser: the card as his chat log keeps it still shows the button, and the user owns the actor
 * that rolls it (the speaker of the card, or its spirit or sprite target, as chatButtonAction picks it). */
export function grantButton(messageId, type, user){
  const data = game.messages?.get(messageId)?.flags?.sr5data
  const button = data?.chatCard?.buttons?.[type]
  if (!button || !user || button.testType !== "nonOpposedTest") return false
  if (!user.isGM){
    const actorId = isRolledByTarget(type, data.test?.typeSub, data.target?.actorId) ? data.target.actorId : data.owner?.speakerId
    const actor = SR5_EntityHelpers.getRealActorFromID(actorId, data.actorUuids)
    if (!actor?.testUserPermission(user, "OWNER")) return false
  }
  return holdButton(`${messageId}|${type}`, user.id, Date.now(), user.isGM)
}

/** On the clicking browser: true when this user may roll the button now. */
export async function claimChatButton(messageId, type){
  if (game.user.isGM) return grantButton(messageId, type, game.user)
  const gm = game.users.activeGM
  if (!gm) return true
  const requestId = foundry.utils.randomID()
  const answer = new Promise(resolve => {
    waiting.set(requestId, resolve)
    setTimeout(() => {
      if (waiting.delete(requestId)) resolve(true)
    }, REPLY_MS)
  })
  // Addressed to the active GM by hand rather than by emitForGM: a lost hold only means the button works as before
  // after REPLY_MS, so it stays out of the relays a GM leaving must report (Élise, relay-watch of Yann's lot)
  await SR5_SocketHandler.emitForPlayer("claimChatButton", {
    messageId, type, requestId
  }, gm.id)
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
