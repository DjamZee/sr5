// Where the icons of a crown go (couronne du PAN, lot 2, constellation B chosen by DjamZ on 07/10): the master of
// the PAN is linked to the token, its slaves to the master; the devices slaved to nothing are linked to the token.
// Plain geometry with no Foundry in it, so that tests can read it. Coordinates are relative to the token's center.

// Sizes of the model, in canvas pixels for a grid of 100 px (an icon of 30 px, as on the mock-up)
export const PAN_LAYOUT = {
  iconRadius: 15,
  masterGap: 46,
  slaveRing: 56,
  deviceGap: 40,
  // The least distance between the centers of two icons (retours de DjamZ, 07/10): an icon with all it can wear, four
  // marks over it (1.7 radius high, 1.5 wide), the monitor under it (1.3), the count of marks at its side (2), fits
  // in 3.6 radii; a crowded ring grows, then a second ring opens one spacing further out
  minSpacing: 54,
  // How wide a ring opens: the slaves around the master, away from the token; the loose devices around the token,
  // on the side opposite the master, never beyond its sides (so they never meet the slaves)
  slaveSpread: Math.PI * 1.1,
  deviceSpread: Math.PI,
}

/**
 * Lay out a crown.
 * @param {Object} graph                    the graph of getGraph (nodes, links, master), each node with visibility
 * @param {Object} options
 * @param {Number} options.tokenRadius      half the token's width, in canvas pixels
 * @param {Number} [options.scale]          grid size / 100
 * @param {Number} [options.angle]          the direction of the master, in radians (default: up)
 * @param {Function} [options.tokenOffset]  node -> {x, y} of the node's own token relative to this one (a deployed
 *                                          drone on the scene), or null; such a node has no icon, only its line
 * @return {{icons: Array, lines: Array}}
 *   icons: [{node, x, y, radius}]
 *   lines: [{from: {x, y}, to: {x, y}, mode, uuid}]; the mode is the one of the node the line leads to
 */
export function layoutCrown(graph, {
  tokenRadius = 50, scale = 1, angle = -Math.PI / 2, tokenOffset = () => null
} = {
}){
  const icons = []
  const lines = []
  if (!graph?.nodes?.length) return {
    icons, lines
  }
  const iconRadius = PAN_LAYOUT.iconRadius * scale
  const center = {
    x: 0, y: 0
  }
  const seen = n => n.visibility?.visible !== false
  // A node reached through another one (the line up to the master of a drone or of a door, lot 7) is shown with it
  const shown = graph.nodes.filter(n => seen(n) && (!n.via || graph.nodes.some(o => o.uuid === n.via && seen(o))))
  const at = {
  }
  // A node on its own token takes no place in a ring: only a line goes to it
  const offsets = new Map(shown.map(n => [n.uuid, tokenOffset(n)]))
  const onRing = n => !offsets.get(n.uuid)
  const place = (node, x, y) => {
    const offset = offsets.get(node.uuid)
    if (offset) {
      at[node.uuid] = {
        x: offset.x, y: offset.y
      }
      return
    }
    at[node.uuid] = {
      x, y
    }
    icons.push({
      node, x, y, radius: iconRadius
    })
  }

  const master = shown.find(n => n.uuid === graph.master)
  const r1 = tokenRadius + PAN_LAYOUT.masterGap * scale
  const masterAt = {
    x: Math.cos(angle) * r1, y: Math.sin(angle) * r1
  }
  if (master) place(master, masterAt.x, masterAt.y)

  // The slaves fan out around the master, away from the token
  const slaves = shown.filter(n => graph.links.some(l => l.to === n.uuid && l.from === graph.master))
  const gap = PAN_LAYOUT.minSpacing * scale
  for (const node of slaves.filter(n => !onRing(n))) place(node, 0, 0)
  fan(slaves.filter(onRing), angle, PAN_LAYOUT.slaveRing * scale, masterAt, place, {
    maxSpread: PAN_LAYOUT.slaveSpread, gap
  })

  // The devices slaved to nothing ring the token, on the side opposite the master
  const loose = shown.filter(n => graph.links.some(l => l.to === n.uuid && l.from === "owner") && n.uuid !== graph.master)
  for (const node of loose.filter(n => !onRing(n))) place(node, 0, 0)
  fan(loose.filter(onRing), angle + Math.PI, tokenRadius + PAN_LAYOUT.deviceGap * scale, center, place, {
    maxSpread: PAN_LAYOUT.deviceSpread, gap
  })

  for (const link of graph.links){
    const to = at[link.to]
    if (!to) continue
    // From the token's edge rather than its middle, so that the line does not cross its picture
    const from = link.from === "owner" ? edgeToward(to, tokenRadius) : at[link.from]
    // A slave seen while its master is not: no line to an icon that is not there
    if (!from) continue
    const node = shown.find(n => n.uuid === link.to)
    // A sprite's line to the technomancer who compiled it: hers and the gamemaster's alone (pan-graph.js)
    if (node.linkOwnerOnly && !["gm", "owner"].includes(node.visibility?.reason)) continue
    lines.push({
      from, to, mode: node.mode, uuid: node.uuid
    })
  }
  return {
    icons, lines
  }
}

function edgeToward(point, radius){
  const length = Math.hypot(point.x, point.y)
  if (!length) return {
    x: 0, y: 0
  }
  return {
    x: point.x / length * radius, y: point.y / length * radius
  }
}

/**
 * Spread nodes on arcs around a point, centered on a direction: two neighbours on an arc are never closer than the
 * gap (a chord, not an arc length); what an arc cannot hold goes on the next one, a gap further out, so that two
 * icons of two arcs are never closer than the gap either.
 * @return {Array<{radius: Number, count: Number, spread: Number}>}  the arcs used, for the tests
 */
export function fan(nodes, direction, radius, origin, place, {
  maxSpread = PAN_LAYOUT.slaveSpread, gap = PAN_LAYOUT.minSpacing
} = {
}){
  const arcs = []
  let rest = [...nodes]
  let r = radius
  while (rest.length){
    // The least angle between two neighbours on this arc
    const step = 2 * Math.asin(Math.min(1, gap / (2 * r)))
    const capacity = Math.max(1, Math.floor(maxSpread / step + 1e-9) + 1)
    const arc = rest.slice(0, capacity)
    rest = rest.slice(capacity)
    const n = arc.length
    // As before for a few icons (0.62 rad apiece), wider when they need it, never wider than the arc may open
    const spread = n === 1 ? 0 : Math.min(maxSpread, Math.max(step * (n - 1), 0.62 * n))
    arc.forEach((node, i) => {
      const a = direction + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1))
      place(node, origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r)
    })
    arcs.push({
      radius: r, count: n, spread
    })
    r += gap
  }
  return arcs
}

/**
 * The direction of the master: away from the middle of the scene, so that crowns at the edge of a group open
 * outwards (as on the mock-up); straight up for a token at the very middle.
 */
export function crownAngle(tokenCenter, sceneCenter){
  const dx = tokenCenter.x - sceneCenter.x
  const dy = tokenCenter.y - sceneCenter.y
  if (Math.hypot(dx, dy) < 1) return -Math.PI / 2
  return Math.atan2(dy, dx)
}

/**
 * Cut a segment into dashes, for the silent mode (PIXI draws no dashed line).
 * @return {Array<[Number, Number, Number, Number]>}  [x1, y1, x2, y2] of each dash
 */
export function dashesOf(from, to, dash = 5, gap = 5){
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (!length) return []
  const ux = (to.x - from.x) / length
  const uy = (to.y - from.y) / length
  const dashes = []
  for (let d = 0; d < length; d += dash + gap){
    const e = Math.min(d + dash, length)
    dashes.push([from.x + ux * d, from.y + uy * d, from.x + ux * e, from.y + uy * e])
  }
  return dashes
}

/**
 * Where the entries of the menu go (retours de DjamZ, 07/10: on a ring, the wide entries of a full menu overlapped).
 * Two columns bent into an arc around the icon: the Matrix actions on its right, the owner's and the gamemaster's
 * on its left, each family a little apart from the next. One row per entry, so that no two ever meet, whatever
 * their number; the arc widens with the tallest column.
 * @param {Object} families
 * @param {Array<Number>} families.right   the number of entries of each family of the right column
 * @param {Array<Number>} families.left    the same for the left column
 * @param {Object} [sizes]
 * @param {Number} [sizes.step]        the height of a row (an entry and the space under it), in pixels
 * @param {Number} [sizes.familyGap]   the extra space between two families
 * @param {Number} [sizes.minRadius]   the least distance from the icon to the inner edge of an entry
 * @return {{radius: Number, right: Array<{x, y}>, left: Array<{x, y}>}}
 *   x: the distance from the icon to the inner edge of the entry (to be negated on the left), y: its middle
 */
export function radialColumns({
  right = [], left = []
} = {
}, {
  step = 28, familyGap = 10, minRadius = 90
} = {
}){
  const rowsOf = families => {
    const rows = []
    let y = 0
    families.filter(count => count > 0).forEach((count, f) => {
      if (f) y += familyGap
      for (let i = 0; i < count; i++, y += step) rows.push(y)
    })
    const height = rows.length ? rows[rows.length - 1] : 0
    return rows.map(r => r - height / 2)
  }
  const columns = {
    right: rowsOf(right), left: rowsOf(left)
  }
  const reach = Math.max(0, ...columns.right.map(Math.abs), ...columns.left.map(Math.abs))
  const radius = Math.max(minRadius, reach + step)
  const place = y => ({
    x: Math.sqrt(radius * radius - y * y), y
  })
  return {
    radius, right: columns.right.map(place), left: columns.left.map(place)
  }
}
