// Small helpers the world-clock rules (diseases, radiation, hunger, deadlines, drugs, effects...) each kept a
// copy of, word for word: who writes, who is whispered, how a date and a name are shown, which actors there are.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"

/** Text put in a card's HTML, escaped */
export function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

/** The one client that writes: the active gamemaster's */
export function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

/** The gamemasters a card is whispered to */
export const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)

/** A world time as the calendar writes it */
export const fmt = (t) => game.time.calendar.format(t)

/** The players and player-owners of `actor` */
export function playerOwners(actor){
  return game.users.filter(u => !u.isGM && actor?.testUserPermission(u, "OWNER")).map(u => u.id)
}

/** Every actor of the world, and the unlinked token actors of every scene */
export function allActors(){
  const actors = new Set(game.actors)
  for (const scene of game.scenes){
    for (const token of scene.tokens){
      if (!token.actorLink && token.actor) actors.add(token.actor)
    }
  }
  return [...actors]
}

/**
 * A check of the world clock that never runs twice at once: called while it runs, it runs once more after.
 * @param {Function} check  the check, async
 * @param {string} failure  what the log says when it throws
 * @returns {Function} the queued check, which returns the run in progress
 */
export function queuedCheck(check, failure){
  let checking = null
  let again = false
  return function queueCheck(){
    if (checking){
      again = true
      return checking
    }
    checking = (async () => {
      do {
        again = false
        await check().catch(e => SR5_SystemHelpers.srLog(1, `${failure}: ${e}`))
      } while (again)
      checking = null
    })()
    return checking
  }
}
