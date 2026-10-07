// The canvas layer that draws the crowns of PANs (couronne du PAN, lot 2): the constellation B at the Static level,
// with its full (wireless on), dashed (silent) and grey (offline) lines, a generic icon per category and the name on
// hover. A crown shows what getGraph() makes visible to the current user. Lot 3: the observer's own marks as small
// diamonds over an icon, a yellow ring for the gamemaster on what no player sees, and the gamemaster's menu to reveal
// a device (pan-crown.js); the radial menu comes with lot 4. Which crowns are open is the client's own state: lot 8
// opens them by the HUD button, on hover, always, or with the key of the AR view (pan-openings.js). Lot 9: the
// ambiences Sober (unfolding, pulses) and Spectacular (halo, flicker, rain of code), under the gamemaster's ceiling
// (pan-ambience.js).
//
// A layer of its own in the interface group, above the tokens and under the HTML HUD (PLAN-COURONNE-PAN-MATRICE § 3).
// Each crown is a container placed on its token's center by the refreshToken hook, which also fires during the
// animation of a move: the crown follows the token.

import {
  getGraph, tokenOfNode
} from "./pan-crown.js"
import {
  closeRadialMenu, closeRadialMenuOf, openRadialMenu
} from "./pan-radial-menu.js"
import {
  crownAngle, dashesOf, layoutCrown, signatureOf
} from "./pan-layout.js"
import {
  iconPathOf, isTintedIcon, nodeIconPathOf
} from "./pan-icons.js"
import {
  PAN_TOKEN_KINDS
} from "./pan-graph.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  crownsToShow, panOpeningMode
} from "./pan-openings.js"
import {
  PAN_CROWN_HOOKS, safeCall
} from "./pan-hooks.js"
import {
  PAN_DEPLOY_MS, PAN_RAIN_MAX, ambienceRank, currentAmbience, deployScale, pulsePhase, pulsePoint, rainCrownIds
} from "./pan-ambience.js"

// The glyphs of the rain of code (lot 9), drawn once in a single texture: a ParticleContainer draws all its sprites
// from the base texture of the first one
const RAIN_GLYPHS = "アイウエオカキクケコサシスセソタチツテト01ABCDEF"
const RAIN_CELL = 28
// How long no frame of a move must come before the crowns are built again (M1, M5)
export const PAN_SETTLE_MS = 250

// The colors of the mock-up
const COLORS = {
  line: 0x39f3b1,
  offline: 0x55615f,
  disc: 0x041311,
  picture: 0xbfffee,
  pictureOffline: 0x7d8a88,
  // The gamemaster's ring on what no player sees (lot 3): yellow since lot 8, the Mark picture of DjamZ being purple
  hidden: 0xffd23f,
  mark: 0xff4d6d,
  pulse: 0xd6fff3,
}

// A container of the ambience (lot 9) that the pointer goes through
function inert(container){
  container.eventMode = "none"
  container.interactiveChildren = false
  return container
}

const MODE_LABELS = {
  active: "SR5.PanCrownModeActive",
  silent: "SR5.PanCrownModeSilent",
  offline: "SR5.PanCrownModeOffline",
}

export class SR5PanCrownLayer extends foundry.canvas.layers.CanvasLayer {
  constructor(){
    super()
    // Above the tokens layer (200) of the interface group, under the templates (400)
    this.zIndex = 250
    this.eventMode = "passive"
    this.interactiveChildren = true
    // token id -> {token, container, lines, icons, angle, droneTokenIds, version}
    this.crowns = new Map()
    this.lastClick = null
    // token id -> soft (pending refresh: true after a move, false for a full drawing)
    this._pending = new Map()
    this._frame = false
    // token id -> its center at its last refresh, and the timer of the end of the moves (M1)
    this._centers = new Map()
    this._settleTimer = null
    this._discs = new Map()
    // Lot 8: what opened the crowns (pan-openings.js)
    this.manual = new Set()
    this.dismissed = new Set()
    this.hovered = null
    this.arView = false
    this._hoverTimer = null
    this._syncing = Promise.resolve()
    // Lot 9: the ambience drawn, and its clock, on the canvas ticker only while a crown is open above Static
    this.ambience = "static"
    this._ticking = false
    this._onTick = () => this.#tick()
    this._dots = new Map()
    this._haloTexture = null
    this._glyphs = null
    this._rain = null
    this._drops = []
    this._flicker = null
  }

  /** Read again the level of ambience (settings, reduced motion, performance mode) and apply it to the open crowns */
  applyAmbience(){
    const level = currentAmbience()
    const changed = level !== this.ambience
    this.ambience = level
    const rank = ambienceRank(level)
    if (rank < 2) {
      this.#clearRain()
      this.#endFlicker()
    }
    if (!rank) for (const crown of this.crowns.values()){
      crown.deployStart = null
      crown.container.scale.set(1)
    }
    if (changed) this.refresh()
    this.#updateTicker()
  }

  #updateTicker(){
    const needed = this.crowns.size > 0 && ambienceRank(this.ambience) > 0
    const ticker = canvas?.app?.ticker
    if (!ticker || needed === this._ticking) return
    this._ticking = needed
    if (needed) ticker.add(this._onTick)
    else {
      ticker.remove(this._onTick)
      this.#clearRain()
      this.#endFlicker()
    }
  }

  // One function per frame for every crown: the unfolding, the pulses, and at the Spectacular level the rain and the
  // flicker
  #tick(){
    const now = performance.now()
    const dt = Math.min(canvas.app.ticker.deltaMS, 100)
    for (const crown of this.crowns.values()){
      if (crown.deployStart !== null && crown.deployStart !== undefined) {
        const elapsed = now - crown.deployStart
        crown.container.scale.set(deployScale(elapsed))
        if (elapsed >= PAN_DEPLOY_MS) crown.deployStart = null
      }
      if (!crown.container.visible) continue
      for (const pulse of crown.pulseData ?? []){
        const point = pulsePoint(pulse.from, pulse.to, now, pulse.phase)
        pulse.sprite.position.set(point.x, point.y)
      }
    }
    if (ambienceRank(this.ambience) < 2) return
    this.#rainStep(dt)
    this.#flickerStep(now, dt)
  }

  static get layerOptions(){
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "sr5PanCrown"
    })
  }

  /** @override */
  async _draw(){
    // The performance mode is read again at each drawing of the canvas (lot 9)
    this.applyAmbience()
  }

  /** @override */
  async _tearDown(){
    canvas.app?.ticker?.remove(this._onTick)
    this._ticking = false
    this.#clearRain()
    this._flicker = null
    this._rain?.destroy()
    this._rain = null
    this._glyphs?.[0]?.baseTexture.destroy()
    this._glyphs = null
    this._haloTexture?.destroy(true)
    this._haloTexture = null
    for (const texture of this._dots.values()) texture.destroy(true)
    this._dots.clear()
    for (const crown of this.crowns.values()) crown.container.destroy({
      children: true
    })
    this.crowns.clear()
    this._pending.clear()
    this._frame = false
    this._centers.clear()
    clearTimeout(this._settleTimer)
    this._settleTimer = null
    for (const texture of this._discs.values()) texture.destroy(true)
    this._discs.clear()
    // The tokens of another scene: the AR view stays, the rest goes
    this.manual.clear()
    this.dismissed.clear()
    this.hovered = null
    clearTimeout(this._hoverTimer)
  }

  isOpen(token){
    return this.crowns.has(token?.id)
  }

  /** Open or close the crown of a token, by hand (the HUD button). @return {Boolean} whether it is open now */
  async toggle(token){
    if (this.isOpen(token)) {
      this.close(token)
      return false
    }
    await this.open(token)
    return true
  }

  /** Open a crown by hand: it stays open whatever the other openings do */
  async open(token){
    if (!token?.id) return
    this.manual.add(token.id)
    this.dismissed.delete(token.id)
    await this.#show(token)
  }

  /** Close a crown by hand: the AR view and "always visible" leave it closed until they are shown again */
  close(token){
    if (!token?.id) return
    this.manual.delete(token.id)
    this.dismissed.add(token.id)
    this.#hide(token)
  }

  /**
   * A token was deleted: its crown goes, and nothing is kept of how it was opened. Not close(): a token brought back
   * by Ctrl+Z keeps its id, and would stay "closed by hand" (relecture).
   */
  forget(tokenId){
    if (!tokenId) return
    this.manual.delete(tokenId)
    this.dismissed.delete(tokenId)
    this._centers.delete(tokenId)
    if (this.hovered === tokenId) this.hovered = null
    this.#hide({
      id: tokenId
    })
  }

  /** The tokens of the scene that may carry a crown (a storage on the ground has no PAN) */
  #crownTokens(){
    return (canvas?.tokens?.placeables ?? []).filter(t => t.actor && t.actor.type !== "actorStorage" && !t.destroyed)
  }

  /** Open and close the crowns as the openings of lot 8 say, once at a time */
  sync(){
    this._syncing = this._syncing.then(() => this.#sync()).catch(error => console.error(error))
    return this._syncing
  }

  async #sync(){
    if (!canvas?.ready) return
    const tokens = this.#crownTokens()
    const shown = crownsToShow({
      tokenIds: tokens.map(t => t.id), manual: this.manual, dismissed: this.dismissed, hovered: this.hovered,
      mode: panOpeningMode(), arView: this.arView,
    })
    for (const crown of [...this.crowns.values()]) if (!shown.has(crown.token.id)) this.#hide(crown.token)
    await Promise.all(tokens.filter(t => shown.has(t.id) && !this.isOpen(t)).map(t => this.#show(t)))
  }

  /** The AR view of the key (pan-openings.js): every crown, or back to the others */
  async setArView(shown){
    shown = !!shown
    if (shown === this.arView) return
    this.arView = shown
    // A crown closed by hand comes back with the next AR view
    this.dismissed.clear()
    await this.sync()
  }

  /** The mode "on hover": the crown of the token under the pointer, kept while the pointer is on the crown */
  onHoverToken(token, hovered){
    if (panOpeningMode() !== "hover") return
    clearTimeout(this._hoverTimer)
    if (hovered) {
      if (this.hovered === token.id) return
      this.hovered = token.id
      return void this.sync()
    }
    if (this.hovered !== token.id) return
    this.#leaveHover()
  }

  // Close the hovered crown a moment later, unless the pointer reaches one of its icons meanwhile
  #leaveHover(){
    clearTimeout(this._hoverTimer)
    this._hoverTimer = setTimeout(() => {
      this.hovered = null
      this.sync()
    }, 400)
  }

  async #show(token){
    if (!token?.actor || this.isOpen(token)) return
    const container = this.addChild(new PIXI.Container())
    container.eventMode = "passive"
    // Lot 11: the free drawing of the modules (sr5.panCrownRendered), under the lines, emptied at each drawing
    const decor = container.addChild(new PIXI.Container())
    // Lot 9: the halos under the lines, the pulses on them, both out of the pointer's way
    const halos = container.addChild(inert(new PIXI.Container()))
    const lines = container.addChild(new PIXI.Graphics())
    const pulses = container.addChild(inert(new PIXI.Container()))
    const icons = container.addChild(new PIXI.Container())
    icons.eventMode = "passive"
    const sceneCenter = canvas.dimensions.sceneRect.center
    const crown = {
      token, container, decor, lines, icons, halos, pulses, pulseData: [], droneTokenIds: new Set(), version: 0,
      // The last build (M1): its graph, the tokens its lines go to, what it showed, its scale
      graph: null, nodeTokens: new Map(), signature: null, scale: 1,
      // Fixed once open, so that the crown does not swing round while its token moves
      angle: crownAngle(token.center, sceneCenter),
      deployStart: null,
    }
    this.crowns.set(token.id, crown)
    this.#place(crown)
    // Sober and above: the crown unfolds from its token once its pictures are loaded
    const unfolds = ambienceRank(this.ambience) > 0
    if (unfolds) container.scale.set(0)
    this.#updateTicker()
    await this.#rebuild(crown)
    if (unfolds && this.crowns.get(token.id) === crown) crown.deployStart = performance.now()
  }

  #hide(token){
    const crown = this.crowns.get(token?.id)
    if (!crown) return
    this.crowns.delete(token.id)
    if (this._flicker?.crown === crown) this._flicker = null
    crown.container.destroy({
      children: true
    })
    this.#updateTicker()
    // The token the crown was drawn on, a Token placeable even when only its id is known
    safeCall(PAN_CROWN_HOOKS.closed, [crown.token])
  }

  /**
   * Draw again, once in the next frame, the crowns whose token or graph changed (all of them by default).
   * @param {Array<String>|null} tokenIds
   * @param {Object} [options]
   * @param {Boolean} [options.soft]  after a move: drawn again only if what is seen changed, else its lines are laid
   *                                  out again (M1). Any other refresh draws the crown again in full.
   */
  refresh(tokenIds = null, {
    soft = false
  } = {
  }){
    if (!this.crowns.size) return
    for (const id of tokenIds ?? this.crowns.keys()){
      if (!this.crowns.has(id)) continue
      // A full refresh asked in the same frame wins over a soft one
      this._pending.set(id, soft && (this._pending.get(id) ?? true))
    }
    if (this._frame || !this._pending.size) return
    // On the canvas's own clock: nothing is drawn between two of its frames anyway
    this._frame = true
    canvas.app.ticker.addOnce(() => {
      this._frame = false
      const pending = [...this._pending]
      this._pending.clear()
      for (const [id, isSoft] of pending){
        const crown = this.crowns.get(id)
        if (crown) this.#rebuild(crown, {
          soft: isSoft
        })
      }
    })
  }

  // A build that fails takes its crown away, rather than leave it half drawn at the scale 0 of its unfolding
  async #rebuild(crown, options){
    try {
      await this.#build(crown, options)
    } catch (error) {
      console.error("SR5 | PAN crown: a crown could not be drawn", error)
      if (this.crowns.get(crown.token.id) === crown) this.#hide(crown.token)
    }
  }

  /**
   * A token was redrawn (moved, animated, hidden): follow it, and the lines that lead to it. This fires at each frame
   * of a move: the crowns are only placed and their lines drawn again there, from the graph of their last build; what
   * a move may change in what is seen (100 m, SR5 p. 236) is worked out once, when the move is over (relecture, M1).
   */
  onRefreshToken(token){
    const crown = this.crowns.get(token.id)
    if (crown) this.#place(crown)
    if (!this.crowns.size) return
    const center = token.center
    const at = `${center.x},${center.y}`
    const before = this._centers.get(token.id)
    this._centers.set(token.id, at)
    // A token seen for the first time, or redrawn where it stands (hover, target, border): nothing moved
    if (before === undefined || before === at) return
    for (const other of this.crowns.values()){
      if (other === crown ? other.droneTokenIds.size : other.droneTokenIds.has(token.id)) this.#relayout(other)
    }
    // What is seen within 100 m (SR5 p. 236) may change, whoever moved: the viewer, an observed token (an NPC whose
    // commlink comes within range, or goes out of it: M5), a player's token for the gamemaster's yellow ring
    this.#settleLater()
  }

  // Once the moves are over (no frame of a move for a while), the crowns are built again, and drawn again only if what
  // is seen changed
  #settleLater(){
    clearTimeout(this._settleTimer)
    this._settleTimer = setTimeout(() => {
      this._settleTimer = null
      this.refresh(null, {
        soft: true
      })
    }, PAN_SETTLE_MS)
  }

  // The lines of a crown laid out again where the tokens stand now, from the graph of its last build: no graph, no
  // picture, no text is made again
  #relayout(crown){
    const {
      token, graph
    } = crown
    if (!graph || token.destroyed) return
    if ([...crown.nodeTokens.values()].some(t => t.destroyed)) return void this.refresh([token.id])
    const layout = layoutCrown(graph, this.#layoutOptions(crown, (node) => crown.nodeTokens.get(node.uuid) ?? null))
    this.#drawLines(crown.lines, layout.lines, crown.scale)
    const pulsing = layout.lines.filter(line => line.mode !== "offline")
    if (pulsing.length !== crown.pulseData.length) return void this.refresh([token.id])
    pulsing.forEach((line, i) => {
      crown.pulseData[i].from = line.from
      crown.pulseData[i].to = line.to
    })
  }

  // The options of layoutCrown for a crown: a node on a token of its own is a line to that token (lot 7)
  #layoutOptions(crown, tokenOf){
    const {
      token
    } = crown
    return {
      tokenRadius: Math.max(token.w, token.h) / 2,
      scale: crown.scale,
      angle: crown.angle,
      tokenOffset: node => {
        if (!PAN_TOKEN_KINDS.includes(node.kind)) return null
        const other = tokenOf(node)
        if (!other || other === token) return null
        return {
          x: other.center.x - token.center.x, y: other.center.y - token.center.y
        }
      },
    }
  }

  #place(crown){
    const {
      token, container
    } = crown
    if (token.destroyed) return
    const center = token.center
    container.position.set(center.x, center.y)
    container.visible = token.visible
  }

  async #build(crown, {
    soft = false
  } = {
  }){
    const version = ++crown.version
    const {
      token
    } = crown
    if (token.destroyed || !token.actor) return this.#hide(token)
    const graph = getGraph(token)
    if (!graph) return this.#hide(token)
    // The tokens the lines go to (lot 7), looked up once per build: a move only lays the lines out again (M1)
    const nodeTokens = new Map()
    for (const node of graph.nodes){
      if (!PAN_TOKEN_KINDS.includes(node.kind)) continue
      const other = tokenOfNode(node, {
        actor: token.actor, token
      })
      if (other) nodeTokens.set(node.uuid, other)
    }
    const signature = signatureOf(graph, token, nodeTokens)
    // After a move, nothing seen changed: the lines follow the tokens, the icons stay as they are
    if (soft && crown.graph && signature !== null && signature === crown.signature) {
      crown.graph = graph
      crown.nodeTokens = nodeTokens
      this.#place(crown)
      return this.#relayout(crown)
    }

    // The pictures first, each loaded once for all the crowns. An item's own picture that cannot be loaded falls back
    // on the generic one of its category (lot 10); the sign of the marks is the generic "mark" picture.
    const table = CONFIG.SR5?.panIcons
    const paths = new Map([[iconPathOf("mark", table), iconPathOf("device")]])
    for (const node of graph.nodes) paths.set(nodeIconPathOf(node, table), iconPathOf(node.icon, table))
    const textures = new Map()
    await Promise.all([...paths].map(async ([path, fallback]) => textures.set(path, await foundry.canvas.loadTexture(path, {
      fallback
    }))))
    // A newer build started while this one waited, or the crown was closed
    if (version !== crown.version || this.crowns.get(token.id) !== crown) return

    crown.droneTokenIds.clear()
    const scale = Math.max(canvas.dimensions.size / 100, 0.5)
    crown.scale = scale
    crown.graph = graph
    crown.nodeTokens = nodeTokens
    crown.signature = signature
    // A drone, the rigger's master, the master of a device of the scenery, a device of the scenery: a line to its
    // token, wherever it is on the scene (lot 7); with no token, an icon in the crown
    const layout = layoutCrown(graph, this.#layoutOptions(crown, node => {
      const other = nodeTokens.get(node.uuid) ?? null
      if (other && other !== token) crown.droneTokenIds.add(other.id)
      return other
    }))

    this.#drawLines(crown.lines, layout.lines, scale)
    for (const child of crown.icons.removeChildren()) child.destroy({
      children: true
    })
    const markTexture = textures.get(iconPathOf("mark", table))
    for (const icon of layout.icons){
      const path = nodeIconPathOf(icon.node, table)
      crown.icons.addChild(this.#iconOf(icon, {
        texture: textures.get(path), tinted: isTintedIcon(path), markTexture
      }, graph, crown))
    }
    this.#drawAmbience(crown, layout, scale)
    for (const child of crown.decor.removeChildren()) child.destroy({
      children: true
    })
    safeCall(PAN_CROWN_HOOKS.rendered, [token, crown.decor, graph])
    this.#place(crown)
  }

  // Lot 9: a pulse on each line that is not offline (Sober), a halo under each icon that is not (Spectacular)
  #drawAmbience(crown, layout, scale){
    for (const child of crown.pulses.removeChildren()) child.destroy()
    for (const child of crown.halos.removeChildren()) child.destroy()
    crown.pulseData = []
    const rank = ambienceRank(this.ambience)
    if (!rank) return
    const dot = this.#dotTexture(scale)
    const now = performance.now()
    layout.lines.forEach((line, index) => {
      if (line.mode === "offline") return
      const sprite = crown.pulses.addChild(new PIXI.Sprite(dot))
      sprite.anchor.set(0.5)
      const pulse = {
        sprite, from: line.from, to: line.to, phase: pulsePhase(index)
      }
      const point = pulsePoint(pulse.from, pulse.to, now, pulse.phase)
      sprite.position.set(point.x, point.y)
      crown.pulseData.push(pulse)
    })
    if (rank < 2) return
    const halo = this.#haloTexture()
    for (const icon of layout.icons){
      if (icon.node.mode === "offline") continue
      const sprite = crown.halos.addChild(new PIXI.Sprite(halo))
      sprite.anchor.set(0.5)
      sprite.position.set(icon.x, icon.y)
      sprite.width = sprite.height = icon.radius * 4
      sprite.blendMode = PIXI.BLEND_MODES.ADD
    }
  }

  // The dot of a pulse, drawn once per size
  #dotTexture(scale){
    const radius = Math.round(2.4 * scale * 10) / 10
    let texture = this._dots.get(radius)
    if (texture) return texture
    const dot = new PIXI.Graphics()
    dot.beginFill(COLORS.pulse, 1)
    dot.drawCircle(0, 0, radius)
    dot.endFill()
    texture = canvas.app.renderer.generateTexture(dot, {
      resolution: 3
    })
    dot.destroy()
    this._dots.set(radius, texture)
    return texture
  }

  // A blurred disc drawn once: the halo costs a sprite, never a PIXI filter (the bench: a blur filter triples the cost)
  #haloTexture(){
    if (this._haloTexture) return this._haloTexture
    const size = 96
    const picture = document.createElement("canvas")
    picture.width = picture.height = size
    const context = picture.getContext("2d")
    const gradient = context.createRadialGradient(size / 2, size / 2, size / 16, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, "rgba(57, 243, 177, 0.55)")
    gradient.addColorStop(1, "rgba(57, 243, 177, 0)")
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    this._haloTexture = PIXI.Texture.from(picture)
    return this._haloTexture
  }

  // The glyphs of the rain, one texture each, all cut from a single picture
  #glyphTextures(){
    if (this._glyphs) return this._glyphs
    const picture = document.createElement("canvas")
    picture.width = RAIN_CELL * RAIN_GLYPHS.length
    picture.height = RAIN_CELL
    const context = picture.getContext("2d")
    context.font = `${Math.round(RAIN_CELL * 0.8)}px monospace`
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillStyle = "#39f3b1"
    ;[...RAIN_GLYPHS].forEach((glyph, i) => context.fillText(glyph, (i + 0.5) * RAIN_CELL, RAIN_CELL / 2))
    const base = PIXI.BaseTexture.from(picture)
    this._glyphs = [...RAIN_GLYPHS].map((glyph, i) => new PIXI.Texture(base, new PIXI.Rectangle(i * RAIN_CELL, 0, RAIN_CELL, RAIN_CELL)))
    return this._glyphs
  }

  // The rain of code, on the crowns opened one by one (Q10 of DjamZ), never more than PAN_RAIN_MAX glyphs on the canvas
  #rainStep(dt){
    const shown = new Set([...this.crowns.values()].filter(c => c.container.visible).map(c => c.token.id))
    const falling = rainCrownIds({
      shown, manual: this.manual, hovered: this.hovered
    })
    if (!falling.size && !this._drops.length) return
    if (!this._rain) {
      this._rain = this.addChildAt(inert(new PIXI.ParticleContainer(PAN_RAIN_MAX, {
        vertices: true, position: true, uvs: true, alpha: true
      })), 0)
    }
    const glyphs = this.#glyphTextures()
    const scale = Math.max(canvas.dimensions.size / 100, 0.5)
    const frames = dt / (1000 / 60)
    for (const id of falling){
      if (this._drops.length >= PAN_RAIN_MAX) break
      if (Math.random() > 0.6 * frames) continue
      const center = this.crowns.get(id).token.center
      const sprite = this._rain.addChild(new PIXI.Sprite(glyphs[Math.floor(Math.random() * glyphs.length)]))
      sprite.anchor.set(0.5)
      sprite.scale.set(scale * 13 / RAIN_CELL)
      const y0 = center.y - 110 * scale
      sprite.position.set(center.x + (Math.random() - 0.5) * 190 * scale, y0)
      this._drops.push({
        sprite, y0, tokenId: id, speed: (0.6 + Math.random() * 1.2) * 2.2 * scale
      })
    }
    const fall = 220 * scale
    this._drops = this._drops.filter(drop => {
      const {
        sprite
      } = drop
      sprite.y += drop.speed * frames
      const life = 1 - (sprite.y - drop.y0) / fall
      if (life <= 0 || !falling.has(drop.tokenId)) {
        sprite.destroy()
        return false
      }
      sprite.alpha = life * 0.55
      if (Math.random() < 0.04) sprite.texture = glyphs[Math.floor(Math.random() * glyphs.length)]
      return true
    })
  }

  #clearRain(){
    for (const drop of this._drops) drop.sprite.destroy()
    this._drops = []
  }

  // Now and then an icon dims for a blink
  #flickerStep(now, dt){
    if (this._flicker) {
      if (now < this._flicker.until) return
      this.#endFlicker()
    }
    if (Math.random() > 0.08 * dt / (1000 / 60)) return
    const crowns = [...this.crowns.values()].filter(c => c.container.visible && c.icons.children.length)
    if (!crowns.length) return
    const crown = crowns[Math.floor(Math.random() * crowns.length)]
    const icon = crown.icons.children[Math.floor(Math.random() * crown.icons.children.length)]
    icon.alpha = 0.55
    this._flicker = {
      crown, icon, until: now + 70
    }
  }

  #endFlicker(){
    const icon = this._flicker?.icon
    if (icon && !icon.destroyed) icon.alpha = 1
    this._flicker = null
  }

  #drawLines(graphics, lines, scale){
    graphics.clear()
    for (const line of lines){
      // A module's decorative color (A8); an offline line stays grey, which tells its mode
      const color = line.mode === "offline" ? COLORS.offline : (line.color ?? COLORS.line)
      graphics.lineStyle({
        width: 1.6 * scale, color, alpha: 0.85
      })
      if (line.mode === "silent") {
        for (const [x1, y1, x2, y2] of dashesOf(line.from, line.to, 5 * scale, 5 * scale)){
          graphics.moveTo(x1, y1)
          graphics.lineTo(x2, y2)
        }
      } else {
        graphics.moveTo(line.from.x, line.from.y)
        graphics.lineTo(line.to.x, line.to.y)
      }
    }
  }

  #iconOf({
    node, x, y, radius
  }, {
    texture, tinted, markTexture
  }, graph, crown){
    const icon = new PIXI.Container()
    icon.position.set(x, y)
    icon.eventMode = "static"
    icon.cursor = "pointer"
    icon.hitArea = new PIXI.Circle(0, 0, radius + 2)
    const offline = node.mode === "offline"

    // One texture per kind of disc, shared by every crown: sprites are drawn in one batch, a Graphics each is not
    // (20 crowns: 2.6 ms per render with a Graphics per icon)
    const hidden = !!graph.viewer?.isGM && node.hiddenFromPlayers === true
    const disc = icon.addChild(new PIXI.Sprite(this.#discTexture(node.mode, node.uuid === graph.master, radius, hidden)))
    disc.anchor.set(0.5)

    if (texture) {
      const picture = icon.addChild(new PIXI.Sprite(texture))
      picture.anchor.set(0.5)
      // A picture in colour keeps the colour of its family (DjamZ); a white pictogram (SVG) takes the colour of the
      // crown. Offline, both go grey and dim.
      if (tinted) {
        picture.width = picture.height = radius * 1.3
        picture.tint = offline ? COLORS.pictureOffline : COLORS.picture
      } else {
        picture.width = picture.height = radius * 1.6
        picture.tint = offline ? COLORS.pictureOffline : 0xffffff
        if (offline) picture.alpha = 0.6
      }
    }

    // The name on hover, made the first time it is read: a crown drawn again makes no text (M1)
    let label = null
    const showLabel = () => {
      if (!label) {
        const style = foundry.canvas.containers.PreciseText.getTextStyle({
          fontSize: Math.round(radius * 0.9), anchor: CONST.TEXT_ANCHOR_POINTS.TOP
        })
        label = icon.addChild(new foundry.canvas.containers.PreciseText(labelOf(node, graph), style))
        label.anchor.set(0.5, 0)
        label.position.set(0, radius + 4)
      }
      label.visible = true
    }

    // The observer's own marks (SR5 p. 238): one diamond per mark, over the icon, on her screen alone
    if (node.viewerMarks > 0) icon.addChild(this.#marksOf(Math.min(node.viewerMarks, 4), radius, markTexture))
    // What her Matrix Perception brought back (lot 5, SR5 p. 237): the monitor under the icon, the number of marks of
    // anyone, without their owners, at its side. Never drawn without a perception (decision 6 of DjamZ)
    if (node.intel?.monitor?.boxes > 0) icon.addChild(monitorOf(node.intel.monitor, radius))
    if (typeof node.intel?.marks === "number") icon.addChild(marksCountOf(node.intel.marks, radius))

    icon.on("pointerover", () => {
      showLabel()
      // Over its neighbours while it is read
      icon.parent?.setChildIndex(icon, icon.parent.children.length - 1)
      // On hover (lot 8), the crown stays while the pointer goes from its token to its icons
      if (this.hovered === crown.token.id) clearTimeout(this._hoverTimer)
    })
    icon.on("pointerout", () => {
      if (label) label.visible = false
      if (this.hovered === crown.token.id) this.#leaveHover()
    })
    // The token stays selected, and the canvas does not start a selection box under the icon
    icon.on("pointerdown", event => {
      event.stopPropagation()
      if (event.button === 0) this.#onClickIcon(crown, node, event)
    })
    icon.on("pointerup", event => event.stopPropagation())
    return icon
  }

  // The disc of an icon: its mode (full, dashed, grey) and the second ring of the master, drawn once per size
  #discTexture(mode, isMaster, radius, hidden = false){
    const key = `${mode}|${isMaster}|${radius}|${hidden}`
    let texture = this._discs.get(key)
    if (texture) return texture
    const color = mode === "offline" ? COLORS.offline : COLORS.line
    const disc = new PIXI.Graphics()
    disc.beginFill(COLORS.disc, 0.92)
    disc.drawCircle(0, 0, radius)
    disc.endFill()
    disc.lineStyle({
      width: radius / 8, color
    })
    if (mode === "silent") dashedCircle(disc, radius, 10)
    else disc.drawCircle(0, 0, radius)
    // The master of the PAN wears a second, thin ring
    if (isMaster) {
      disc.lineStyle({
        width: radius / 18, color, alpha: 0.6
      })
      disc.drawCircle(0, 0, radius * 1.17)
    }
    // What no player sees, for the gamemaster: a yellow ring outside the others
    if (hidden) {
      disc.lineStyle({
        width: radius / 7, color: COLORS.hidden, alpha: 0.95
      })
      disc.drawCircle(0, 0, radius * 1.32)
    }
    // Sharp up to the deepest zoom of the canvas
    texture = canvas.app.renderer.generateTexture(disc, {
      resolution: 3
    })
    disc.destroy()
    this._discs.set(key, texture)
    return texture
  }

  // The marks of the observer: small diamonds in a row over the icon, the Mark picture of DjamZ (lot 10), or drawn
  // diamonds without it
  #marksOf(count, radius, texture = null){
    if (texture) {
      const row = new PIXI.Container()
      const size = radius * 0.8
      const step = size * 0.9
      for (let i = 0; i < count; i++){
        const mark = row.addChild(new PIXI.Sprite(texture))
        mark.anchor.set(0.5)
        mark.width = mark.height = size
        mark.position.set((i - (count - 1) / 2) * step, -radius * 1.3)
      }
      return row
    }
    const marks = new PIXI.Graphics()
    const size = radius * 0.28
    const step = size * 2.4
    const y = -radius * 1.25
    marks.lineStyle({
      width: Math.max(radius / 15, 1), color: COLORS.disc, alpha: 0.9
    })
    for (let i = 0; i < count; i++){
      const x = (i - (count - 1) / 2) * step
      marks.beginFill(COLORS.mark, 1)
      marks.drawPolygon([x, y - size, x + size, y, x, y + size, x - size, y])
      marks.endFill()
    }
    return marks
  }

  // Lot 2 proves that the click reaches the right icon; the hook opens the radial menu of lot 4
  #onClickIcon(crown, node, event){
    this.lastClick = {
      tokenId: crown.token.id, uuid: node.uuid, name: node.name, time: Date.now()
    }
    SR5_SystemHelpers.srLog(3, `PAN crown: click on ${node.name} (${node.uuid}) of ${crown.token.name}`)
    Hooks.callAll("sr5.panCrownClickIcon", {
      token: crown.token, node, point: {
        x: event?.clientX ?? 0, y: event?.clientY ?? 0
      }
    })
  }
}

// The Matrix condition monitor a perception read: a bar under the icon, the boxes of damage filled
function monitorOf({
  damage = 0, boxes = 0
}, radius){
  const bar = new PIXI.Graphics()
  const width = radius * 2, height = Math.max(radius / 5, 2), y = radius * 1.12
  const filled = Math.min(1, Math.max(0, damage / boxes))
  bar.beginFill(COLORS.disc, 0.92)
  bar.drawRect(-width / 2, y, width, height)
  bar.endFill()
  if (filled > 0) {
    bar.beginFill(COLORS.mark, 1)
    bar.drawRect(-width / 2, y, width * filled, height)
    bar.endFill()
  }
  bar.lineStyle({
    width: Math.max(radius / 20, 1), color: COLORS.line, alpha: 0.9
  })
  bar.drawRect(-width / 2, y, width, height)
  return bar
}

// The number of marks a perception counted: a neutral figure on the upper right of the icon
function marksCountOf(count, radius){
  const style = foundry.canvas.containers.PreciseText.getTextStyle({
    fontSize: Math.round(radius * 0.7), fill: COLORS.picture
  })
  const text = new foundry.canvas.containers.PreciseText(`◇${count}`, style)
  text.anchor.set(0, 0.5)
  text.position.set(radius * 0.8, -radius * 0.8)
  return text
}

function labelOf(node, graph){
  const mode = game.i18n.localize(MODE_LABELS[node.mode] ?? MODE_LABELS.active)
  const master = node.uuid === graph.master ? ` · ${game.i18n.localize("SR5.PanCrownMaster")}` : ""
  const swarm = node.swarm ? ` · ${game.i18n.format("SR5.PanCrownSwarm", node.swarm)}` : ""
  return `${node.name} — ${mode}${master}${swarm}`
}

function dashedCircle(graphics, radius, count){
  const step = Math.PI * 2 / count
  for (let i = 0; i < count; i++){
    const a = i * step
    graphics.moveTo(Math.cos(a) * radius, Math.sin(a) * radius)
    graphics.arc(0, 0, radius, a, a + step * 0.55)
  }
}

/** The hooks that keep the open crowns in step with the canvas and the documents */
export function registerPanCrownHooks(){
  const layer = () => canvas?.sr5PanCrown
  Hooks.on("refreshToken", token => layer()?.onRefreshToken(token))
  // The radial menu goes with the scene shown, the token, the actor it was opened on
  Hooks.on("canvasTearDown", () => closeRadialMenu())
  Hooks.on("deleteActor", () => closeRadialMenu())
  Hooks.on("deleteToken", document => {
    closeRadialMenuOf(document.id)
    layer()?.forget(document.id)
    // The lines that led to it (a drone, a rigger, a device of the scenery: lot 7)
    layer()?.refresh()
  })
  // (an actor deleted: the crowns of its tokens go, the lines to them too)
  for (const hook of ["updateItem", "createItem", "deleteItem", "updateActor", "deleteActor", "controlToken", "updateUser", "createToken"]){
    Hooks.on(hook, () => layer()?.refresh())
  }
  // The gamemaster hides a token, or shows it again: the lines that lead to it come and go for the players
  Hooks.on("updateToken", (document, changes) => {
    if ("hidden" in (changes ?? {
    })) layer()?.refresh()
  })
  // Lot 4: a click on an icon opens its radial menu, for everyone (the gamemaster's reveal is in it)
  Hooks.on("sr5.panCrownClickIcon", data => openRadialMenu(data))
  // Lot 8: the openings on hover, always, and in the AR view follow the scene and its tokens
  Hooks.on("hoverToken", (token, hovered) => layer()?.onHoverToken(token, hovered))
  for (const hook of ["canvasReady", "createToken", "deleteToken", "deleteActor"]){
    Hooks.on(hook, () => layer()?.sync())
  }
}
