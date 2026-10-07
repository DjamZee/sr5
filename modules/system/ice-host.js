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

/** The ICs of the world that run in `host` */
export function icesOfHost(host, actors) {
  if (!host?.uuid) return []
  return [...(actors ?? [])].filter(actor => actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "ice" &&
    actor.system.matrix.hostUuid === host.uuid)
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
  Hooks.once("ready", () => prepareAgain([...(game.actors ?? [])].filter(actor => actor.type === "actorDevice" &&
    actor.system?.matrix?.deviceType === "ice" && actor.system.matrix.hostUuid)))
  Hooks.on("updateActor", actor => {
    if (isHost(actor)) prepareAgain(icesOfHost(actor, game.actors))
  })
}
