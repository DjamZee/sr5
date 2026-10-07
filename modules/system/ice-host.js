// SR5 p. 249: "Les CI utilisent les attributs matriciels de leur serveur". An IC tied to a host (system.matrix.hostUuid,
// A6 of the API pour Matrice v1) reads the host's Attack, Sleaze, Data Processing and Firewall; an IC tied to no host
// keeps its own
export const ICE_HOST_ATTRIBUTES = ["attack", "sleaze", "dataProcessing", "firewall"]

/** Whether the actor is a host (an actorDevice of type host) */
function isHost(actor) {
  return actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "host"
}

/** The four matrix attributes an IC takes from its host, {attack, sleaze, dataProcessing, firewall}, or null when
 *  `host` is no host */
export function iceHostAttributes(host) {
  if (!isHost(host)) return null
  const attributes = host.system.matrix.attributes ?? {
  }
  return Object.fromEntries(ICE_HOST_ATTRIBUTES.map(key => [key, Number(attributes[key]?.value) || 0]))
}

/** The host an IC runs in, or null: its hostUuid resolved without waiting, a host only */
export function iceHostOf(ice) {
  const uuid = ice?.system?.matrix?.hostUuid
  if (!uuid || typeof fromUuidSync !== "function") return null
  let host = null
  try {
    host = fromUuidSync(uuid)
  } catch {
    return null
  }
  return isHost(host) ? host : null
}

/** The ICs among `actors` that run in `host` */
export function icesOfHost(host, actors) {
  if (!host?.uuid) return []
  return [...(actors ?? [])].filter(actor => actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "ice" &&
    actor.system.matrix.hostUuid === host.uuid)
}

/** The actors of the world, then those of the unlinked IC tokens of every scene: the copies of an IC that Matrice
 *  launches are unlinked tokens, and kept the host's attributes read at their creation (review 36). Only the tokens
 *  of an IC are read, so as not to build every synthetic actor of the world */
export function matrixActorsOf(actors, scenes) {
  const isIceBase = token => {
    const base = actors?.get?.(token.actorId)
    return base?.type === "actorDevice" && base.system?.matrix?.deviceType === "ice"
  }
  const unlinked = [...(scenes ?? [])].flatMap(scene => [...(scene?.tokens ?? [])]
    .filter(token => !token.actorLink && isIceBase(token)).map(token => token.actor).filter(Boolean))
  return [...(actors ?? []), ...unlinked]
}

function prepareAgain(ices) {
  for (const ice of ices) {
    ice.prepareData()
    if (ice.sheet?.rendered) ice.sheet.render(false)
  }
}

/** Each client prepares its own documents: an IC prepared before its host (world load order) or a host changed later
 *  would leave the IC with stale attributes */
export function registerIceHostHooks() {
  Hooks.once("ready", () => prepareAgain(matrixActorsOf(game.actors, game.scenes).filter(actor => actor.type === "actorDevice" &&
    actor.system?.matrix?.deviceType === "ice" && actor.system.matrix.hostUuid)))
  Hooks.on("updateActor", actor => {
    if (isHost(actor)) prepareAgain(icesOfHost(actor, matrixActorsOf(game.actors, game.scenes)))
  })
}
