// Hosts slaved to other hosts, « nodes » (lot 4 of DjamZ's session of 09/10). Off the book: SR5 p. 234 slaves devices to
// a master, never a host to a host; the world setting sr5HostNodes (unchecked by default, the book) lets a gamemaster
// build networks of hosts all the same — arbitrage de DjamZ (09/10 : « ça serait pas mal en terme de gameplay […] seuls
// les MJ que ça intéresse le feront »). A slaved host then hangs in its master's crown and defends with it when the master
// is the stronger (the WAN of SR5 p. 234, as for any device of the scenery).

export const HOST_NODES_SETTING = "sr5HostNodes"

/** Is the setting on? Off when the settings cannot be read (tests, before init) */
export function hostNodesAllowed(read = () => globalThis.game?.settings?.get("sr5", HOST_NODES_SETTING)){
  try {
    return read() === true
  } catch {
    return false
  }
}

/**
 * The hosts a host may be slaved to: not itself, nor one that already goes up to it through its own masters (a loop).
 * @param {Object} host                       the host to slave
 * @param {Object[]} hosts                    the hosts of the world
 * @param {(key: String) => Object|null} resolve   the actor named by a panMaster
 * @return {Object[]}
 */
export function hostMasterCandidates(host, hosts = [], resolve = () => null){
  // The sheet hands the data copy of its actor (_id, no id), the world hands documents (id): read either
  const idOf = actor => actor?.id ?? actor?._id
  const hostId = idOf(host)
  const leadsTo = candidate => {
    const seen = new Set()
    let current = candidate
    while (current && !seen.has(idOf(current))){
      if (idOf(current) === hostId) return true
      seen.add(idOf(current))
      const key = current.system?.matrix?.panMaster
      current = key ? resolve(key) : null
    }
    return false
  }
  return hosts.filter(other => other && idOf(other) !== hostId && !leadsTo(other))
}
