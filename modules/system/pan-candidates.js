// S1 (ticket 4 d'Adrore, 16/10): the menus that slave a device list the actors of the device's scene, unlinked tokens
// included, each under its token's name; a generic host is posed on the scene as an unlinked token, renamed for it, and
// its devices around it. "Show everyone" gives back the world's actors. Pure rules: no Foundry in here.

const MASTER_DEVICE_TYPES = ["commlink", "cyberdeck", "riggerCommandConsole"]

const isDevice = actor => actor?.type === "actorDevice"
export const isHostActor = actor => isDevice(actor) && actor.system?.matrix?.deviceType === "host"
export const isIceActor = actor => isDevice(actor) && actor.system?.matrix?.deviceType === "ice"

/** The master device of a PAN an actor carries (commlink, cyberdeck, rigger command console), switched on, or null */
export function masterDeviceOf(actor) {
  return [...(actor?.items ?? [])].find(i => i.type === "itemDevice" && i.system?.isActive &&
    MASTER_DEVICE_TYPES.includes(i.system?.type)) ?? null
}

/**
 * The actors of a scene, each once: a linked token stands for its world actor, an unlinked token is an actor of its
 * own, named after its token. With showAll, the world's actors with no token there come after them.
 * @param {Object} options
 * @param {Object[]} options.tokens        the token documents of the scene ({id, name, actorLink, actor})
 * @param {Object[]} options.worldActors   the actors of the world
 * @param {Boolean} options.showAll        add the world's actors
 * @return {{ref: String, actor: Object, name: String, onScene: Boolean}[]} ref: the id the system names it by (the
 *   token's id for an unlinked token, as getRealActorFromID reads it)
 */
export function sceneCandidates({
  tokens = [], worldActors = [], showAll = false
} = {
}) {
  const out = [], seen = new Set()
  for (const token of tokens) {
    const actor = token?.actor
    if (!actor) continue
    const ref = token.actorLink ? actor.id : token.id
    if (seen.has(ref)) continue
    seen.add(ref)
    out.push({
      ref, actor, name: token.actorLink ? actor.name : (token.name || actor.name), onScene: true
    })
  }
  if (showAll) for (const actor of worldActors) {
    if (!actor || seen.has(actor.id)) continue
    seen.add(actor.id)
    out.push({
      ref: actor.id, actor, name: actor.name, onScene: false
    })
  }
  return out
}

const notSelf = (self) => candidate => candidate.actor !== self && (!self?.uuid || candidate.actor.uuid !== self.uuid)
const byLabel = (a, b) => a.label.localeCompare(b.label)

/**
 * The masters a device of the scenery can be slaved to (SR5 p. 234): the hosts, then the master devices of a PAN, by the
 * uuid of their instance (an unlinked host's is Scene.x.Token.y.Actor.z: two instances never stand for each other)
 * @return {{hosts: Object[], devices: Object[]}} options {value, label}
 */
export function panMasterChoices(candidates, self) {
  const hosts = [], devices = []
  for (const candidate of candidates.filter(notSelf(self))) {
    if (isHostActor(candidate.actor)) hosts.push({
      value: candidate.actor.uuid, label: candidate.name
    })
    else if (!isDevice(candidate.actor)) {
      const master = masterDeviceOf(candidate.actor)
      if (master) devices.push({
        value: master.uuid, label: `${candidate.name} — ${master.name}`
      })
    }
  }
  return {
    hosts: hosts.sort(byLabel), devices: devices.sort(byLabel)
  }
}

/** The hosts among the candidates, as options {value: uuid of the instance, label} */
export function hostChoices(candidates, self) {
  return candidates.filter(notSelf(self)).filter(c => isHostActor(c.actor)).map(c => ({
    value: c.actor.uuid, label: c.name
  })).sort(byLabel)
}

/**
 * The devices of the scene a host can take as slaves (S1, S2): devices of the scenery, never the host itself nor an IC
 * (it runs in its host, SR5 p. 249), a host only with the setting sr5HostNodes. A device slaved to another master is
 * kept, with that master, so that the sheet greys it; one slaved to this host is marked as such.
 * @param {Object[]} candidates   sceneCandidates
 * @param {Object} host           the host
 * @param {Object} options
 * @param {String[]} options.hostKeys     what this host answers to in panMaster (pan-graph.js panMasterKeysOf)
 * @param {Boolean} options.nodes         the setting sr5HostNodes
 * @return {{ref, actor, name, master: String|null, mine: Boolean}[]}
 */
export function slaveCandidates(candidates, host, {
  hostKeys = [], nodes = false
} = {
}) {
  return candidates.filter(notSelf(host)).filter(c => isDevice(c.actor) && !isIceActor(c.actor) && (!isHostActor(c.actor) || nodes))
    .map(c => {
      const master = c.actor.system?.matrix?.panMaster || null
      return {
        ...c, master, mine: !!master && hostKeys.includes(master)
      }
    })
}

/** "Slave the devices of the scene": those with no master at all; never one already slaved elsewhere */
export function freeSlaves(slaveList) {
  return slaveList.filter(c => !c.master)
}
