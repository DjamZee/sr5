// The Overwatch Score only rises, until a reboot brings it back to 0 (SR5 p. 231, 244). A player could lower it on her
// own sheet by actor.update (Jakob, 4 -> 0). Two lowerings are the player's own, written from her browser: the reboot,
// and an Emulate whose limit she pushes after the roll, which swaps the rating already added for the hits (Data Trails
// p. 159). Nothing a player sends can tell them apart from a console, which can call them as well. So (Élise's
// go-ahead, 06/10): her browser drops a lowering unless one of those asks for it (sr5OverwatchLower), on the actor, on
// an unlinked token and on its delta; and the active GM is told of every lowering a player writes, to rule on it.
// Nothing is written back.

const PATH = "system.matrix.overwatchScore"
/** The lowerings a player writes herself, named by the update's sr5OverwatchLower option */
export const LOWER_REASONS = {
  reboot: "SR5.OverwatchLowerReboot", emulate: "SR5.OverwatchLowerEmulate"
}

// A path of an update, whose keys may be dotted, nested, or both ("system.matrix": {overwatchScore})
function locate(object, path){
  if (!object || typeof object !== "object") return null
  if (Object.hasOwn(object, path)) return {
    parent: object, key: path
  }
  const keys = path.split(".")
  for (let i = keys.length - 1; i > 0; i--) {
    const head = keys.slice(0, i).join(".")
    if (Object.hasOwn(object, head)) {
      const found = locate(object[head], keys.slice(i).join("."))
      if (found) return found
    }
  }
  return null
}

/** The Overwatch Score an update writes, under `prefix` ("delta." for a token); undefined when it writes none. */
export function writtenOverwatch(changes, prefix = ""){
  const found = locate(changes, prefix + PATH)
  return found ? found.parent[found.key] : undefined
}

/**
 * Before a player's update: drops from `changes` an Overwatch Score lower than the stored one, unless the update is a
 * lowering of her own (reboot, Emulate). Returns true when it dropped it.
 */
export function stripOverwatchDecrease(changes, current, options = {
}, prefix = ""){
  if (Object.hasOwn(LOWER_REASONS, options?.sr5OverwatchLower ?? "")) return false
  const found = locate(changes, prefix + PATH)
  if (!found) return false
  if (!(Number(found.parent[found.key]) < (Number(current) || 0))) return false
  delete found.parent[found.key]
  return true
}

const storedOf = actor => actor?._source?.system?.matrix?.overwatchScore

/** preUpdateToken: an unlinked token's delta carries its actor's score. */
export function sr5HookPreUpdateTokenOverwatch(token, changes, options){
  if (game.user?.isGM || token.actorLink) return
  if (stripOverwatchDecrease(changes, storedOf(token.actor), options, "delta.")) ui.notifications.warn(game.i18n.localize("SR5.WARN_OverwatchGMOnly"))
}

/** preUpdateActorDelta: the delta of an unlinked token, written by itself. */
export function sr5HookPreUpdateActorDeltaOverwatch(delta, changes, options){
  if (game.user?.isGM) return
  if (stripOverwatchDecrease(changes, storedOf(delta.parent?.actor), options)) ui.notifications.warn(game.i18n.localize("SR5.WARN_OverwatchGMOnly"))
}

// The GMs' memory of the last score seen, by actor (token actors by their token's uuid)
const lastSeen = new Map()
const keyOf = actor => (actor?.isToken ? actor.token?.uuid : actor?.uuid)

/** Remembers the score of an actor, as the GM sees it. */
export function noteOverwatch(actor){
  const key = keyOf(actor)
  if (key) lastSeen.set(key, Number(actor.system?.matrix?.overwatchScore) || 0)
}

/**
 * After an update, on a GM's browser: the lowering a player wrote, {before, after}, or null. The memory is kept up to
 * date for every update that writes the score.
 */
export function overwatchDrop(actor, written, writer){
  const key = keyOf(actor)
  if (!key || !written) return null
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

// Every GM keeps the memory up to date, so that another GM who becomes the active one reads it fresh; the active GM
// alone tells the GMs
async function tellDrop(actor, written, options, userId){
  if (!game.user?.isGM) return
  const writer = game.users?.get(userId)
  const drop = overwatchDrop(actor, written, writer)
  if (!drop || !isActiveGM()) return
  const escape = text => foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
  await ChatMessage.create({
    content: `<p>${game.i18n.format("SR5.WARN_OverwatchLoweredByPlayer", {
      user: escape(writer?.name ?? userId), actor: escape(actor.name), before: drop.before, after: drop.after,
      reason: game.i18n.localize(LOWER_REASONS[options?.sr5OverwatchLower] ?? "SR5.No"),
    })}</p>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
  })
}

/** updateActor hook: tells the GMs of a lowering a player wrote. */
export function sr5HookOverwatchDrop(actor, data, options, userId){
  return tellDrop(actor, writtenOverwatch(data) !== undefined, options, userId)
}

/** updateToken hook: the same, for a score written in an unlinked token's delta. */
export function sr5HookUpdateTokenOverwatch(token, changes, options, userId){
  if (token.actorLink || !token.actor) return
  return tellDrop(token.actor, writtenOverwatch(changes, "delta.") !== undefined, options, userId)
}
