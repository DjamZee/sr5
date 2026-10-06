// The Overwatch Score only rises, until a reboot brings it back to 0 (SR5 p. 231, 244). A player could lower it on her
// own sheet by actor.update (Jakob, 4 -> 0). Two lowerings are the player's own, written from her browser: the reboot,
// and an Emulate whose limit she pushes after the roll, which swaps the rating already added for the hits (Data Trails
// p. 159). Nothing a player sends can tell them apart from a console, which can call them as well. So (Élise's
// go-ahead, 06/10): her browser refuses a lowering unless one of those asks for it (sr5OverwatchLower), on the actor,
// on an unlinked token and on its delta; and the active GM is told of every lowering a player writes, to rule on it.
// Nothing is written back.
// Erna's second round: the key can be deleted ("-=overwatchScore"), matrix or system replaced whole, the token linked
// to a base actor with a lower score. So the guard never looks for the key in what is sent: it works out the score
// the update would leave, and compares it.

const PATH = "system.matrix.overwatchScore"
/** The lowerings a player writes herself, named by the update's sr5OverwatchLower option */
export const LOWER_REASONS = {
  reboot: "SR5.OverwatchLowerReboot", emulate: "SR5.OverwatchLowerEmulate"
}

const isPlain = value => !!value && typeof value === "object" && !Array.isArray(value)
const copy = value => (value === undefined ? undefined : structuredClone(value))
const read = (object, path) => path.split(".").reduce((o, key) => (o == null ? undefined : o[key]), object)
const scoreOf = value => Number(value) || 0

/**
 * Applies an update to a copy of a source, as Foundry does: dotted keys reach into the source, "-=key" deletes,
 * "==key" replaces, and objects merge unless the update is not recursive. Returns the copy.
 */
export function applyUpdate(source, changes, recursive = true){
  const target = isPlain(source) ? copy(source) : {
  }
  const apply = (into, update) => {
    for (const [key, value] of Object.entries(update ?? {
    })) {
      if (key.includes(".")) {
        const [head, ...rest] = key.split(".")
        if (!isPlain(into[head])) into[head] = {
        }
        apply(into[head], {
          [rest.join(".")]: value
        })
      } else if (key.startsWith("-=")) delete into[key.slice(2)]
      else if (key.startsWith("==")) into[key.slice(2)] = copy(value)
      else if (isPlain(value) && recursive) {
        if (!isPlain(into[key])) into[key] = {
        }
        apply(into[key], value)
      } else into[key] = isPlain(value) ? applyUpdate({
      }, value, true) : copy(value)
    }
  }
  apply(target, changes)
  return target
}

// A path of an update, whose keys may be dotted, nested, or both ("system.matrix": {overwatchScore})
function locate(object, path){
  if (!isPlain(object)) return null
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

const announced = options => Object.hasOwn(LOWER_REASONS, options?.sr5OverwatchLower ?? "")

/**
 * Before a player's update. A score written lower is dropped from `changes`, so the rest of the update stays (a write
 * from a sheet a little behind the GM's); if the update would still leave a lower score (key deleted, object replaced,
 * token linked), the whole update is refused. `after(changes)` works out the score the update would leave.
 * @return {boolean} false when the update must be refused
 */
function guard(changes, options, before, after, prefix = ""){
  if (announced(options)) return true
  const found = locate(changes, prefix + PATH)
  const stripped = !!found && scoreOf(found.parent[found.key]) < before
  if (stripped) delete found.parent[found.key]
  const refused = after(changes) < before
  if (stripped || refused) ui.notifications.warn(game.i18n.localize("SR5.WARN_OverwatchGMOnly"))
  return !refused
}

/** preUpdateActor, on a player's browser: false refuses the update. */
export function guardActorOverwatch(actor, changes, options = {
}){
  const source = actor._source ?? {
  }
  return guard(changes, options, scoreOf(read(source, PATH)), next => scoreOf(read(applyUpdate(source, next, options.recursive !== false), PATH)))
}

// The score an unlinked token shows: its delta's, else its base actor's; a linked token shows its base actor's
function tokenScore(tokenSource){
  const base = () => scoreOf(read(game.actors?.get(tokenSource?.actorId)?._source, PATH))
  if (!tokenSource || tokenSource.actorLink) return base()
  const own = read(tokenSource.delta, PATH)
  return own === undefined || own === null ? base() : scoreOf(own)
}

/** preUpdateToken: the delta of an unlinked token carries its actor's score, and linking it shows the base actor's. */
export function sr5HookPreUpdateTokenOverwatch(token, changes, options = {
}){
  if (game.user?.isGM) return
  const source = token._source ?? {
  }
  //A token linked before and after the update shows its actor's score, which the update does not touch
  if (source.actorLink && changes.actorLink !== false) return
  return guard(changes, options, tokenScore(source), next => tokenScore(applyUpdate(source, next, options.recursive !== false)), "delta.") ?
    undefined : false
}

/** preUpdateActorDelta: the delta of an unlinked token, written by itself. */
export function sr5HookPreUpdateActorDeltaOverwatch(delta, changes, options = {
}){
  if (game.user?.isGM) return
  const token = delta.parent?._source ?? {
  }
  const withDelta = deltaSource => ({
    ...token, actorLink: false, delta: deltaSource
  })
  return guard(changes, options, tokenScore(withDelta(delta._source)),
    next => tokenScore(withDelta(applyUpdate(delta._source, next, options.recursive !== false)))) ? undefined : false
}

// The GMs' memory of the last score seen, by actor (an unlinked token's actor by its token's uuid)
const lastSeen = new Map()
const keyOf = actor => (actor?.isToken ? actor.token?.uuid : actor?.uuid)

/** Remembers the score of an actor, as the GM sees it. */
export function noteOverwatch(actor){
  const key = keyOf(actor)
  if (key) lastSeen.set(key, scoreOf(actor.system?.matrix?.overwatchScore))
}

/**
 * After an update, on a GM's browser: the lowering a player wrote, {before, after}, or null. Read on the score, never
 * on the keys sent: the memory is kept up to date for every update.
 */
export function overwatchDrop(key, after, writer){
  if (!key) return null
  const before = lastSeen.get(key)
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
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink && token.uuid) lastSeen.set(token.uuid, tokenScore(token._source))
}

function isActiveGM(){
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}

// Every GM keeps the memory up to date, so that another GM who becomes the active one reads it fresh; the active GM
// alone tells the GMs
async function tellDrop(key, name, after, options, userId){
  if (!game.user?.isGM) return
  const writer = game.users?.get(userId)
  const drop = overwatchDrop(key, after, writer)
  if (!drop || !isActiveGM()) return
  const escape = text => foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
  await ChatMessage.create({
    content: `<p>${game.i18n.format("SR5.WARN_OverwatchLoweredByPlayer", {
      user: escape(writer?.name ?? userId), actor: escape(name), before: drop.before, after: drop.after,
      reason: game.i18n.localize(LOWER_REASONS[options?.sr5OverwatchLower] ?? "SR5.No"),
    })}</p>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
  })
}

/** updateActor hook: tells the GMs of a lowering a player wrote. */
export function sr5HookOverwatchDrop(actor, _data, options, userId){
  return tellDrop(keyOf(actor), actor?.name, scoreOf(actor?.system?.matrix?.overwatchScore), options, userId)
}

/** updateToken hook: the same for a token, unlinked before or after the update. */
export function sr5HookUpdateTokenOverwatch(token, _changes, options, userId){
  if (!token?.uuid || (token.actorLink && !Object.hasOwn(_changes ?? {
  }, "actorLink"))) return
  return tellDrop(token.uuid, token.actor?.name ?? token.name, tokenScore(token._source), options, userId)
}
