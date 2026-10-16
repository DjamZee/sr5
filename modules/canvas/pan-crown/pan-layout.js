// Where the icons of a crown go (couronne du PAN, lot 2, constellation B chosen by DjamZ on 07/10): the master of
// the PAN is linked to the token, its slaves to the master; the devices slaved to nothing are linked to the token.
// Plain geometry with no Foundry in it, so that tests can read it. Coordinates are relative to the token's center.

// Sizes of the model, in canvas pixels for a grid of 100 px (an icon of 30 px, as on the mock-up)
export const PAN_LAYOUT = {
  iconRadius: 15,
  // Aired out at the relecture djamz.13 (DjamZ, img 11-12): 46, 56 and 54 before
  masterGap: 52,
  slaveRing: 64,
  // 40 before: the loose devices sat on the token's name
  deviceGap: 48,
  // The least distance between the centers of two icons (retours de DjamZ, 07/10): an icon with all it can wear, four
  // marks over it (1.7 radius high, 1.5 wide), the monitor under it (1.3), the count of marks at its side (2), fits
  // in 3.6 radii; a crowded ring grows, then a second ring opens one spacing further out
  // 62 and not 64: at 64 the lines of an outer ring of eight slaves cross the icons of the inner one
  minSpacing: 62,
  // A token bigger than a cell gets a bigger crown, by the square root of its size in cells, up to twice (relecture
  // djamz.13, DjamZ: « à la taille du jeton »)
  maxSizeScale: 2,
  // Between the edge of the token and the start of its lines
  lineMargin: 3,
  // How wide a ring opens: the slaves around the master, away from the token; the loose devices around the token,
  // on the side opposite the master, never beyond its sides (so they never meet the slaves)
  slaveSpread: Math.PI * 1.1,
  // Beyond 8 slaves, their fan opens up to here (the token's picture and name kept clear)
  crowdedSlaves: 8,
  crowdedSpread: Math.PI * 1.7,
  deviceSpread: Math.PI,
}

/**
 * What a crown shows of its graph, as a string (relecture, M1): two builds with the same signature draw the same
 * icons, so that a crown is only laid out again after a move. The distances are left out (they change at each step);
 * what they decide, the visibility, is in. Null when it cannot be told (a module's node that does not turn into
 * JSON): the crown is then drawn again.
 * @param {Object} graph        the graph of getGraph
 * @param {Object} [token]      the crown's token, {w, h}
 * @param {Map} [nodeTokens]    node uuid -> the token its line goes to, {id}
 * @return {String|null}
 */
export function signatureOf(graph, token = null, nodeTokens = new Map()){
  try {
    return JSON.stringify([
      token?.w ?? null, token?.h ?? null, graph?.master ?? null, graph?.links ?? [],
      (graph?.nodes ?? []).map(n => [
        n.uuid, n.kind, n.name, n.mode, n.silentFrom, n.icon, n.customIcon, n.via, n.ownerOnly, n.linkOwnerOnly,
        n.revealed, n.revealedTo, n.visibility?.visible, n.visibility?.reason, n.hiddenFromPlayers, n.viewerMarks, n.intel, n.badges,
        nodeTokens.get(n.uuid)?.id ?? null,
      ]),
    ])
  } catch {
    return null
  }
}

/**
 * Lay out a crown.
 * @param {Object} graph                    the graph of getGraph (nodes, links, master), each node with visibility
 * @param {Object} options
 * @param {Number} options.tokenRadius      half the token's width, in canvas pixels
 * @param {Number} [options.scale]          grid size / 100
 * @param {Number} [options.angle]          the direction of the master, in radians (default: up)
 * @param {Number} [options.lineRadius]     where the token's own lines start, from its center (default: tokenRadius);
 *                                          0 for a small token, whose lines reach the middle of its cell
 * @param {Function} [options.tokenOffset]  node -> {x, y} of the node's own token relative to this one (a deployed
 *                                          drone on the scene), or null; such a node has no icon, only its line
 * @return {{icons: Array, lines: Array}}
 *   icons: [{node, x, y, radius}]
 *   lines: [{from: {x, y}, to: {x, y}, mode, uuid}]; the mode is the one of the node the line leads to
 */
export function layoutCrown(graph, {
  tokenRadius = 50, scale = 1, angle = -Math.PI / 2, tokenOffset = () => null, lineRadius = tokenRadius, lineBox = null,
  nameBox = null, lineEdge = null
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

  // The token's name (relecture djamz.13, passe 2): no icon on it, and no line of the token across it
  const onName = nameBox ? (x, y) => x > nameBox.x0 - iconRadius && x < nameBox.x1 + iconRadius &&
    y > nameBox.y0 - iconRadius && y < nameBox.y1 + iconRadius : null
  // ...nor below it, nor where the line from the token to the icon would brush it (passe 2: the ends of a long name)
  const underName = nameBox ? (x, y) => onName(x, y) || (x > nameBox.x0 - iconRadius && x < nameBox.x1 + iconRadius &&
    y > nameBox.y0) || segmentHitsBox(edgeToward({
    x, y
  }, tokenRadius), {
    x, y
  }, {
    x0: nameBox.x0 - 4 * scale, x1: nameBox.x1 + 4 * scale, y0: nameBox.y0, y1: nameBox.y1
  }) : null

  const master = shown.find(n => n.uuid === graph.master)
  const r1 = tokenRadius + PAN_LAYOUT.masterGap * scale
  // A master that would fall on the name, or below it, turns aside, and its slaves and the loose devices with it
  if (underName) for (let k = 1; k <= 12 && underName(Math.cos(angle) * r1, Math.sin(angle) * r1); k++) {
    angle += (k % 2 ? 1 : -1) * k * Math.PI / 12
  }
  const masterAt = {
    x: Math.cos(angle) * r1, y: Math.sin(angle) * r1
  }
  if (master) place(master, masterAt.x, masterAt.y)

  // The slaves fan out around the master, away from the token
  const slaves = shown.filter(n => graph.links.some(l => l.to === n.uuid && l.from === graph.master))
  const gap = PAN_LAYOUT.minSpacing * scale
  for (const node of slaves.filter(n => !onRing(n))) place(node, 0, 0)
  // The devices slaved to nothing ring the token, on the side opposite the master
  // (a node a module links to both the token and the master is placed once, as a slave: lot 11)
  const loose = shown.filter(n => graph.links.some(l => l.to === n.uuid && l.from === "owner") && n.uuid !== graph.master &&
    !slaves.includes(n))
  // Many loose devices (the samurai's ~15, passe 2): a wider fan, each a spacing from the icons already there, and
  // its line from the token crossing none of them
  const crowdedLoose = loose.filter(onRing).length > PAN_LAYOUT.crowdedSlaves
  const looseClear = (x, y) => !!underName?.(x, y) || icons.some(i => Math.hypot(i.x - x, i.y - y) < gap - 1e-6 ||
    segmentToPoint(edgeToward({
      x, y
    }, tokenRadius), {
      x, y
    }, i) < iconRadius + 2 * scale)
  const placeLoose = () => {
    for (const node of loose.filter(n => !onRing(n))) place(node, 0, 0)
    fan(loose.filter(onRing), angle + Math.PI, tokenRadius + PAN_LAYOUT.deviceGap * scale, center, place, {
      maxSpread: crowdedLoose ? PAN_LAYOUT.crowdedSpread : PAN_LAYOUT.deviceSpread, gap,
      // A line through an icon is refused for every loose device (passe 2, the rigger), not for many only
      forbidden: looseClear
    })
  }
  // Many slaves (a samurai and his ~20 pieces, passe 2): the loose devices first, then a fan that opens wider round
  // the master, never on the token's picture, its name, or a spacing from an icon already there
  const crowded = slaves.filter(onRing).length > PAN_LAYOUT.crowdedSlaves
  if (crowded) placeLoose()
  // ...and its line from the master crosses neither the picture nor the name
  const clear = (x, y) => Math.hypot(x, y) < tokenRadius + iconRadius + 4 * scale || !!onName?.(x, y) ||
    icons.some(i => Math.hypot(i.x - x, i.y - y) < gap - 1e-6) ||
    segmentToPoint(masterAt, {
      x, y
    }, center) < tokenRadius + 4 * scale || (!!nameBox && segmentHitsBox(masterAt, {
    x, y
  }, nameBox))
  fan(slaves.filter(onRing), angle, PAN_LAYOUT.slaveRing * scale, masterAt, place, {
    maxSpread: crowded ? PAN_LAYOUT.crowdedSpread : PAN_LAYOUT.slaveSpread, gap, forbidden: crowded ? clear : onName
  })
  if (!crowded) placeLoose()

  for (const link of graph.links){
    const to = at[link.to]
    if (!to) continue
    // From the edge of the token's picture rather than its middle, so that the line does not cross it (lot 35)
    // A square picture: from the edge of the square, corners included (relecture djamz.13, img 01)
    // Where the picture really ends, read on its transparency, when it is known (relecture djamz.13, passe 2)
    const from = link.from !== "owner" ? at[link.from] : lineEdge ? edgeToward(to, lineEdge(unit(to))) :
      lineBox ? boxEdgeToward(to, lineBox) : edgeToward(to, lineRadius)
    // A slave seen while its master is not: no line to an icon that is not there
    if (!from) continue
    const node = shown.find(n => n.uuid === link.to)
    // A sprite's line to the technomancer who compiled it: hers and the gamemaster's alone (pan-graph.js)
    if (node.linkOwnerOnly && !["gm", "owner"].includes(node.visibility?.reason)) continue
    lines.push({
      from, to, mode: node.mode, uuid: node.uuid, color: link.color ?? null
    })
  }
  return {
    icons, lines
  }
}

/**
 * Where the lines of a token start, from its center: the edge of its picture, so that they touch it (séance de DjamZ
 * du 09/10) and never cross it, small picture included: they seem to run under the token that makes them and over the
 * others (lot 35, DjamZ 14/10). Drawing them truly under its picture is not clean in Foundry V13: a token's picture is
 * in the primary group, lit and sorted by elevation then sort, the crown in the interface group above the whole of it.
 * @param {Object} token
 * @param {Number} token.w            width of the token, in canvas pixels
 * @param {Number} token.h            height
 * @param {Number} [token.scaleX]     the scale of its picture (texture)
 * @param {Number} [token.scaleY]
 * @return {Number}
 */
export function lineRadiusOf({
  w, h, scaleX = 1, scaleY = 1
}){
  // The picture as shown, bigger than its cell included (relecture djamz.13, passe 2: a big ring, lines from inside it)
  return Math.max(w * Math.abs(scaleX), h * Math.abs(scaleY)) / 2
}

/**
 * The half sides of a token's square picture, a margin added, where its lines start (relecture djamz.13, img 01: a
 * circle inside the square let the lines cross its corners). Null for a token in a ring of V13 or a round picture:
 * the circle of lineRadiusOf holds then.
 * @param {Object} token   {w, h, scaleX, scaleY, round}
 * @param {Number} [margin]
 * @return {{hw: Number, hh: Number}|null}
 */
export function lineBoxOf({
  w, h, scaleX = 1, scaleY = 1, round = false
}, margin = 0){
  if (round) return null
  return {
    hw: w * Math.abs(scaleX) / 2 + margin, hh: h * Math.abs(scaleY) / 2 + margin
  }
}

/**
 * The scale of a crown: the grid's (an icon of 30 px on a grid of 100), grown with the size of the token in cells
 * by its square root, up to PAN_LAYOUT.maxSizeScale (relecture djamz.13)
 * @param {Number} gridSize   canvas pixels of a cell
 * @param {Number} w          width of the token, in canvas pixels
 * @param {Number} h          height
 */
export function crownScaleOf(gridSize, w, h){
  const grid = Math.max(gridSize / 100, 0.5)
  const cells = Math.max(w, h) / (gridSize || 100)
  return grid * Math.min(PAN_LAYOUT.maxSizeScale, Math.max(1, Math.sqrt(cells || 1)))
}

/**
 * Where the picture really ends along a direction (relecture djamz.13, passe 2: a round picture in a square texture
 * left the lines starting in the void on its diagonals). The alpha of the texture, n × n, is read from the edge of
 * the shown box inward; the first pixel that is not transparent is the edge.
 * @param {Uint8Array} alpha   n × n alphas, row by row, 0-255
 * @param {Number} n
 * @param {{x, y}} dir         a unit vector from the center
 * @param {{hw, hh}} box       half sides of the picture as shown, canvas pixels
 * @return {Number}            the distance from the center to the edge of the picture, canvas pixels
 */
export function pictureEdgeAlong(alpha, n, dir, box, threshold = 40){
  const reach = Math.min(dir.x ? box.hw / Math.abs(dir.x) : Infinity, dir.y ? box.hh / Math.abs(dir.y) : Infinity)
  if (!alpha?.length || !Number.isFinite(reach)) return Number.isFinite(reach) ? reach : 0
  const steps = 2 * n
  for (let k = steps; k > 0; k--) {
    const d = reach * k / steps
    const u = (dir.x * d / box.hw + 1) / 2, v = (dir.y * d / box.hh + 1) / 2
    const col = Math.min(n - 1, Math.max(0, Math.floor(u * n))), row = Math.min(n - 1, Math.max(0, Math.floor(v * n)))
    if (alpha[row * n + col] >= threshold) return d
  }
  return 0
}

/**
 * The box the mask of a crown's lines covers (R4d), relative to the token's center, in whole pixels: every end of a
 * line and the whole picture, a pad around. Outside it a sprite mask hides everything, so nothing may be left out.
 * @param {Number[]} xs   the x of the ends of the lines
 * @param {Number[]} ys   their y
 * @param {Number} w      width of the picture as shown
 * @param {Number} h      height
 * @param {Number} pad
 * @return {{x, y, w, h}}
 */
export function maskBoundsOf(xs, ys, w, h, pad = 0){
  const x0 = Math.floor(Math.min(-w / 2, ...xs) - pad), y0 = Math.floor(Math.min(-h / 2, ...ys) - pad)
  const x1 = Math.ceil(Math.max(w / 2, ...xs) + pad), y1 = Math.ceil(Math.max(h / 2, ...ys) + pad)
  return {
    x: x0, y: y0, w: x1 - x0, h: y1 - y0
  }
}

// The least distance from point p to the segment a-b
function segmentToPoint(a, b, p){
  const dx = b.x - a.x, dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
}

// Does the segment a-b cross the box {x0, x1, y0, y1} (sampled: the box is a name, a few dozen pixels)
function segmentHitsBox(a, b, box){
  for (let k = 0; k <= 40; k++) {
    const x = a.x + (b.x - a.x) * k / 40, y = a.y + (b.y - a.y) * k / 40
    if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) return true
  }
  return false
}

function boxEdgeToward(point, {
  hw, hh
}){
  const ax = Math.abs(point.x), ay = Math.abs(point.y)
  if (!ax && !ay) return {
    x: 0, y: 0
  }
  const t = Math.min(ax ? hw / ax : Infinity, ay ? hh / ay : Infinity)
  return {
    x: point.x * t, y: point.y * t
  }
}

function unit(point){
  const length = Math.hypot(point.x, point.y) || 1
  return {
    x: point.x / length, y: point.y / length
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
  maxSpread = PAN_LAYOUT.slaveSpread, gap = PAN_LAYOUT.minSpacing, forbidden = null
} = {
}){
  const arcs = []
  let rest = [...nodes]
  let r = radius
  // The token's name kept clear (relecture djamz.13, passe 2): an angle whose place on the arc covers it is taken by
  // no icon
  const blocked = a => !!forbidden && forbidden(origin.x + Math.cos(direction + a) * r, origin.y + Math.sin(direction + a) * r)
  for (let guard = 0; rest.length && guard < 40; guard++){
    // The least angle between two neighbours on this arc
    const step = 2 * Math.asin(Math.min(1, gap / (2 * r)))
    const capacity = Math.max(1, Math.floor(maxSpread / step + 1e-9) + 1)
    let arc = rest.slice(0, capacity)
    let n = arc.length
    // As before for a few icons (0.62 rad apiece), wider when they need it, never wider than the arc may open
    let spread = n === 1 ? 0 : Math.min(maxSpread, Math.max(step * (n - 1), 0.62 * n))
    // An outer arc opens and turns a little, so that its lines run between the icons of the inner arcs, not through
    // them (the master's lines are straight)
    const evenly = s => Array.from({
      length: n
    }, (_, i) => n === 1 ? 0 : -s / 2 + s * i / (n - 1))
    let angles = evenly(spread)
    if (arcs.length) ({
      spread, angles
    } = staggerOf(n, spread, maxSpread, arcs.flatMap(a => a.angles), evenly))
    // On the name: the places of the arc a step apart that leave it clear, taken evenly; the rest goes further out
    if (angles.some(blocked)) {
      const slots = Array.from({
        length: capacity
      }, (_, i) => capacity === 1 ? 0 : -maxSpread / 2 + maxSpread * i / (capacity - 1)).filter(a => !blocked(a))
      n = Math.min(n, slots.length)
      arc = rest.slice(0, n)
      angles = pickSpread(slots, n, arcs.flatMap(a => a.angles))
      spread = n > 1 ? angles[n - 1] - angles[0] : 0
    }
    rest = rest.slice(n)
    angles.forEach((angle, i) => {
      const a = direction + angle
      place(arc[i], origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r)
    })
    if (n) arcs.push({
      radius: r, count: n, spread, angles
    })
    r += gap
  }
  return arcs
}

// n of the sorted slots, as evenly spread among them as can be; on an outer arc, the choice whose angles keep furthest
// from those of the inner arcs, so that the lines run between their icons (passe 2: they crossed them)
function pickSpread(slots, n, inner = []){
  if (n <= 0) return []
  if (n >= slots.length) return [...slots]
  const candidates = [n === 1 ? [slots[Math.floor((slots.length - 1) / 2)]] : Array.from({
    length: n
  }, (_, i) => slots[Math.round(i * (slots.length - 1) / (n - 1))])]
  const stride = n === 1 ? 1 : Math.max(1, Math.floor((slots.length - 1) / (n - 1)))
  for (let start = 0; start + (n - 1) * stride < slots.length; start++) candidates.push(Array.from({
    length: n
  }, (_, i) => slots[start + i * stride]))
  if (!inner.length) return candidates[0]
  const clearance = angles => Math.min(...angles.flatMap(a => inner.map(b => Math.abs(a - b))))
  return candidates.reduce((best, c) => clearance(c) > clearance(best) + 1e-9 ? c : best)
}

// The opening and the turn of an arc, never wider than it may open, that keep its angles furthest from the angles of
// the inner arcs (the least change when several are as good). Neighbours only move apart: the gap still holds.
function staggerOf(n, spread, maxSpread, inner, evenly){
  const clearance = angles => Math.min(...angles.flatMap(a => inner.map(b => Math.abs(a - b))))
  let best = {
    spread, angles: evenly(spread)
  }
  let bestClearance = clearance(best.angles)
  const openings = n === 1 ? [0] : Array.from({
    length: 9
  }, (_, k) => spread + (maxSpread - spread) * k / 8)
  for (const s of openings){
    const limit = Math.min((maxSpread - s) / 2, 0.5)
    const base = evenly(s)
    for (let k = -20; k <= 20; k++){
      const angles = base.map(a => a + limit * k / 20)
      const c = clearance(angles)
      if (c > bestClearance + 1e-9) {
        best = {
          spread: s, angles
        }
        bestClearance = c
      }
    }
  }
  return best
}

/**
 * The direction of the master: away from the middle of the scene, so that crowns at the edge of a group open
 * outwards (as on the mock-up); straight up for a token at the very middle.
 */
export function crownAngle(tokenCenter, sceneCenter, sceneRect = null, reach = 0){
  const dx = tokenCenter.x - sceneCenter.x
  const dy = tokenCenter.y - sceneCenter.y
  if (Math.hypot(dx, dy) < 1) return -Math.PI / 2
  const outward = Math.atan2(dy, dx)
  // Relecture djamz.13 (Élise): a crown that would leave the scene, a big token at its edge, turns inward
  if (!sceneRect || !reach) return outward
  const holds = (a, r) => {
    const x = tokenCenter.x + Math.cos(a) * r, y = tokenCenter.y + Math.sin(a) * r
    return x >= sceneRect.x && x <= sceneRect.x + sceneRect.width && y >= sceneRect.y && y <= sceneRect.y + sceneRect.height
  }
  // Its axis, and the sides of the fan of the slaves
  const inside = a => holds(a, reach) && holds(a - Math.PI / 3, reach * 0.85) && holds(a + Math.PI / 3, reach * 0.85)
  if (inside(outward)) return outward
  // The nearest turn from outward that keeps it in, else straight to the center
  for (let step = 1; step <= 12; step++) for (const sign of [1, -1]) {
    const a = outward + sign * step * Math.PI / 12
    if (inside(a)) return a
  }
  return outward + Math.PI
}

/**
 * How far a crown reaches from its token's center along its direction: the master, the ring of its slaves and a
 * second ring, an icon's radius beyond
 */
export function crownReachOf(tokenRadius, scale = 1){
  return tokenRadius + (PAN_LAYOUT.masterGap + PAN_LAYOUT.slaveRing + PAN_LAYOUT.minSpacing + PAN_LAYOUT.iconRadius) * scale
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
 * @return {{radius: {right: Number, left: Number}, right: Array<{x, y}>, left: Array<{x, y}>}}
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
  // Each column its own arc: a short one stays close to the icon
  const radiusOf = rows => Math.max(minRadius, Math.max(0, ...rows.map(Math.abs)) + step)
  const place = rows => {
    const radius = radiusOf(rows)
    return rows.map(y => ({
      x: Math.sqrt(radius * radius - y * y), y
    }))
  }
  return {
    radius: {
      right: radiusOf(columns.right), left: radiusOf(columns.left)
    },
    right: place(columns.right), left: place(columns.left)
  }
}
