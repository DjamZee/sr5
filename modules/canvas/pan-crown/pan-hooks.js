// The hooks of the crown of a PAN, for the modules (couronne du PAN, lot 11, PLAN-COURONNE-PAN-MATRICE § 1): a
// module (Matrice v1: zones of a host, IC, spiders) adds nodes and lines to a crown, hides what its own rules hide,
// and adds entries to the radial menu, without touching the system. Plain rules with no Foundry in them, so that tests
// can read them: the hooks are called through `call`, Hooks.callAll by default.
//
// The rules of safety:
// - a subscriber works on a copy: it can ADD nodes and lines, never remove or change those of the system;
// - it can only HIDE, and only from the players: the system's visibility (SR5 p. 236-238, the rulings of DjamZ)
//   stays a ceiling, and the gamemaster sees everything;
// - it can grey out an entry of the menu, never enable one the system greys out;
// - an error of a subscriber is ignored: the crown is drawn as the system builds it.
// Without a module, no hook has a subscriber and the crown follows the book.

export const PAN_CROWN_HOOKS = {
  graph: "sr5.panCrownGraph",
  visibility: "sr5.panCrownVisibility",
  actions: "sr5.panCrownActions",
  rendered: "sr5.panCrownRendered",
  closed: "sr5.panCrownClosed",
}

const MODES = ["active", "silent", "offline"]

function defaultCall(hook, ...args){
  return globalThis.Hooks?.callAll(hook, ...args)
}

/** Call a hook; an error thrown through it is logged and goes no further */
export function safeCall(hook, args, call = defaultCall){
  try {
    call(hook, ...args)
    return true
  } catch (error) {
    console.error(`SR5 | ${hook}: a subscriber failed, ignored`, error)
    return false
  }
}

// A copy a subscriber may change at will: plain data (a function or a document is not copied)
function plainCopy(value){
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return null
    }
  }
}

const strings = list => Array.isArray(list) ? list.filter(id => typeof id === "string") : []

/**
 * A node a subscriber added, made whole: what the system reads of a node, with its defaults. It follows the same rules
 * of visibility as any node (owner, marked, revealed, within 100 m of its token: holderIds).
 * @return {Object|null}  null when it has no uuid of its own
 */
export function normalizeContributedNode(node){
  if (!node || typeof node !== "object" || typeof node.uuid !== "string" || !node.uuid) return null
  const holderIds = strings(node.holderIds)
  return {
    ...node,
    kind: typeof node.kind === "string" && node.kind ? node.kind : "module",
    name: String(node.name ?? ""),
    icon: typeof node.icon === "string" && node.icon ? node.icon : "device",
    customIcon: typeof node.customIcon === "string" && node.customIcon ? node.customIcon : null,
    holderIds,
    ownerIds: node.ownerIds === undefined ? holderIds : strings(node.ownerIds),
    mode: MODES.includes(node.mode) ? node.mode : "active",
    silentFrom: node.silentFrom ?? null,
    rating: Number(node.rating) || 0,
    marks: Array.isArray(node.marks) ? node.marks.filter(m => m && typeof m.ownerId === "string").map(m => ({
      ownerId: m.ownerId, value: Number(m.value) || 0
    })) : [],
    droneId: typeof node.droneId === "string" ? node.droneId : null,
    revealed: node.revealed === true,
    // Added by a module: the radial menu offers it the system's actions only if it asks for them (systemActions)
    contributed: true,
  }
}

/**
 * Let the subscribers of sr5.panCrownGraph add nodes and lines to a graph.
 * @param {Object} graph     the graph of buildPanGraph, changed in place
 * @param {Object} context   {token, actor}: the crown's token (null without one) and actor
 * @param {Function} [call]
 * @return {Object} the graph
 */
export function contributeToGraph(graph, {
  token = null, actor = null
} = {
}, call = defaultCall){
  if (!graph) return graph
  const copy = plainCopy(graph)
  if (!copy) return graph
  safeCall(PAN_CROWN_HOOKS.graph, [copy, token, actor], call)
  const uuids = new Set(graph.nodes.map(n => n.uuid))
  for (const node of Array.isArray(copy.nodes) ? copy.nodes : []){
    if (uuids.has(node?.uuid)) continue
    const added = normalizeContributedNode(node)
    if (!added) continue
    graph.nodes.push(added)
    uuids.add(added.uuid)
  }
  const linked = new Set(graph.links.map(l => `${l.from}>${l.to}`))
  for (const link of Array.isArray(copy.links) ? copy.links : []){
    const from = link?.from, to = link?.to
    if (typeof from !== "string" || typeof to !== "string" || from === to) continue
    if (!uuids.has(to) || (from !== "owner" && !uuids.has(from)) || linked.has(`${from}>${to}`)) continue
    graph.links.push({
      from, to, kind: typeof link.kind === "string" && link.kind ? link.kind : "module"
    })
    linked.add(`${from}>${to}`)
  }
  return graph
}

/**
 * Let the subscribers of sr5.panCrownVisibility hide a node: they get a copy of the node and of the verdict, and may
 * set verdict.visible to false (with a reason of their own). What the system hides stays hidden.
 * @param {Object} node      a node of the graph
 * @param {Object} viewer    {actor, token, isGM, ids}
 * @param {Object} verdict   {visible, reason} of the system (pan-visibility.js)
 * @param {Function} [call]
 * @return {{visible: Boolean, reason: String}}
 */
export function applyVisibilityHooks(node, viewer, verdict, call = defaultCall){
  // The gamemaster sees everything: what a module hides from the players shows in her yellow ring
  if (!verdict?.visible || viewer?.isGM) return verdict
  const proposed = {
    visible: true, reason: verdict.reason
  }
  safeCall(PAN_CROWN_HOOKS.visibility, [plainCopy(node) ?? {
  }, viewer, proposed], call)
  if (proposed.visible !== false) return verdict
  return {
    visible: false, reason: typeof proposed.reason === "string" && proposed.reason !== verdict.reason ? proposed.reason : "module"
  }
}

/**
 * Let the subscribers of sr5.panCrownActions add entries to the radial menu of a node, or grey out the system's.
 * @param {Object} node      a node of the graph
 * @param {Object} viewer    {actor, token, isGM}
 * @param {Array} entries    the system's entries: [{key, label, enabled, tooltip, group}]
 * @param {Function} [call]
 * @return {{greyed: Map<String, String>, added: Array}}
 *   greyed: key of a system entry -> its new tooltip, for those a subscriber greyed out;
 *   added:  [{key, label, tooltip, enabled, onClick}], the entries the subscribers added
 */
export function contributeActions(node, viewer, entries = [], call = defaultCall){
  const list = entries.map(entry => ({
    ...entry, system: true
  }))
  safeCall(PAN_CROWN_HOOKS.actions, [plainCopy(node) ?? {
  }, viewer, list], call)
  const greyed = new Map()
  const added = []
  const systemKeys = new Set(entries.map(e => e.key))
  for (const entry of list){
    if (!entry || typeof entry !== "object") continue
    if (entry.system === true && systemKeys.has(entry.key)) {
      const original = entries.find(e => e.key === entry.key)
      if (original.enabled && entry.enabled === false) greyed.set(entry.key, String(entry.tooltip ?? original.tooltip ?? ""))
      continue
    }
    if (typeof entry.label !== "string" || !entry.label || typeof entry.onClick !== "function") continue
    added.push({
      key: String(entry.key ?? entry.label),
      label: entry.label,
      tooltip: String(entry.tooltip ?? ""),
      enabled: entry.enabled !== false,
      onClick: entry.onClick,
    })
  }
  return {
    greyed, added
  }
}
