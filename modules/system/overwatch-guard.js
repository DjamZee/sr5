// The Overwatch Score only rises, until a reboot brings it back to 0 (SR5 p. 231, 244). A player could lower it on her
// own sheet by actor.update (Jakob, 4 -> 0). The reboot is the player's own action, written from her browser: nothing
// a player sends can tell it apart from a console, which can call rebootDeck() as well. So (Élise's go-ahead, 06/10):
// her browser drops a lowering unless the reboot asks for it (sr5OverwatchReset), and the active GM is told of every
// lowering a player writes, to rule on it; nothing is written back.

const PATH = "system.matrix.overwatchScore"

/** The Overwatch Score an update writes, dotted or nested; undefined when it writes none. */
export function writtenOverwatch(changes){
  if (!changes) return undefined
  if (PATH in changes) return changes[PATH]
  return changes.system?.matrix?.overwatchScore
}

/**
 * Before a player's update: drops from `changes` an Overwatch Score lower than the stored one, unless the update is a
 * reboot. Returns true when it dropped it.
 */
export function stripOverwatchDecrease(changes, current, options = {
}){
  if (options.sr5OverwatchReset) return false
  const next = writtenOverwatch(changes)
  if (next === undefined) return false
  const stored = Number(current) || 0
  if (!(Number(next) < stored)) return false
  if (PATH in changes) delete changes[PATH]
  if (changes.system?.matrix && "overwatchScore" in changes.system.matrix) delete changes.system.matrix.overwatchScore
  return true
}

// The active GM's memory of the last score seen, by actor (token actors by their token's uuid)
const lastSeen = new Map()
const keyOf = actor => (actor?.isToken ? actor.token?.uuid : actor?.uuid)

/** Remembers the score of an actor, as the active GM sees it. */
export function noteOverwatch(actor){
  const key = keyOf(actor)
  if (key) lastSeen.set(key, Number(actor.system?.matrix?.overwatchScore) || 0)
}

/**
 * After an update, on the active GM's browser: the lowering a player wrote, {before, after}, or null. The memory is
 * kept up to date for every update.
 */
export function overwatchDrop(actor, data, writer){
  const key = keyOf(actor)
  if (!key || writtenOverwatch(data) === undefined) return null
  const before = lastSeen.get(key)
  const after = Number(actor.system?.matrix?.overwatchScore) || 0
  lastSeen.set(key, after)
  if (before === undefined || writer?.isGM || !(after < before)) return null
  return {
    before, after
  }
}

/** Ready, on a GM's browser: the scores of the world's actors and of the unlinked tokens of its scenes. */
export function seedOverwatch(){
  if (!game.user?.isGM) return
  for (const actor of game.actors ?? []) noteOverwatch(actor)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink && token.actor) noteOverwatch(token.actor)
}

function isActiveGM(){
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}

/** updateActor hook: tells the GMs of a lowering a player wrote. */
export async function sr5HookOverwatchDrop(actor, data, options, userId){
  //Every GM keeps the memory up to date, so that another GM who becomes the active one reads it fresh
  if (!game.user?.isGM) return
  const writer = game.users?.get(userId)
  const drop = overwatchDrop(actor, data, writer)
  if (!drop || !isActiveGM()) return
  const escape = text => foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
  await ChatMessage.create({
    content: `<p>${game.i18n.format("SR5.WARN_OverwatchLoweredByPlayer", {
      user: escape(writer?.name ?? userId), actor: escape(actor.name), before: drop.before, after: drop.after,
      reboot: game.i18n.localize(options?.sr5OverwatchReset ? "SR5.Yes" : "SR5.No"),
    })}</p>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
  })
}
