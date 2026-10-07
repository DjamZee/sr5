// Where the icons of a crown go (couronne du PAN, lot 2, constellation B chosen by DjamZ on 07/10): the master of
// the PAN is linked to the token, its slaves to the master; the devices slaved to nothing are linked to the token.
// Plain geometry with no Foundry in it, so that tests can read it. Coordinates are relative to the token's center.

// Sizes of the model, in canvas pixels for a grid of 100 px (an icon of 30 px, as on the mock-up)
export const PAN_LAYOUT = {
  iconRadius: 15,
  masterGap: 46,
  slaveRing: 50,
  deviceGap: 40,
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
  const place = (node, x, y) => {
    const offset = tokenOffset(node)
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
  const ring = PAN_LAYOUT.slaveRing * scale
  fan(slaves, angle, ring, masterAt, place)

  // The devices slaved to nothing ring the token, on the side opposite the master
  const loose = shown.filter(n => graph.links.some(l => l.to === n.uuid && l.from === "owner") && n.uuid !== graph.master)
  fan(loose, angle + Math.PI, tokenRadius + PAN_LAYOUT.deviceGap * scale, center, place)

  for (const link of graph.links){
    const to = at[link.to]
    if (!to) continue
    // From the token's edge rather than its middle, so that the line does not cross its picture
    const from = link.from === "owner" ? edgeToward(to, tokenRadius) : at[link.from]
    // A slave seen while its master is not: no line to an icon that is not there
    if (!from) continue
    const node = shown.find(n => n.uuid === link.to)
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

// Spread n nodes on an arc around a point, centered on a direction
function fan(nodes, direction, radius, origin, place){
  const n = nodes.length
  if (!n) return
  const spread = Math.min(Math.PI * 1.1, 0.62 * n)
  nodes.forEach((node, i) => {
    const a = direction + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1))
    place(node, origin.x + Math.cos(a) * radius, origin.y + Math.sin(a) * radius)
  })
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
