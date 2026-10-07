// The canvas layer that draws the crowns of PANs (couronne du PAN, lot 2): the constellation B at the Static level,
// with its full (wireless on), dashed (silent) and grey (offline) lines, a generic icon per category and the name on
// hover. A crown shows what getGraph() makes visible to the current user. Lot 3: the observer's own marks as small
// diamonds over an icon, a purple ring for the gamemaster on what no player sees, and the gamemaster's menu to reveal
// a device (pan-crown.js); the radial menu comes with lot 4. Which crowns are open is the client's own state.
//
// A layer of its own in the interface group, above the tokens and under the HTML HUD (PLAN-COURONNE-PAN-MATRICE § 3).
// Each crown is a container placed on its token's center by the refreshToken hook, which also fires during the
// animation of a move: the crown follows the token.

import {
  getGraph, openGmMenu, tokenOfNode
} from "./pan-crown.js"
import {
  crownAngle, dashesOf, layoutCrown
} from "./pan-layout.js"
import {
  iconPathOf
} from "./pan-icons.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"

// The colors of the mock-up
const COLORS = {
  line: 0x39f3b1,
  offline: 0x55615f,
  disc: 0x041311,
  picture: 0xbfffee,
  pictureOffline: 0x7d8a88,
  // The gamemaster's ring on what no player sees (lot 3)
  hidden: 0xb04dff,
  mark: 0xff4d6d,
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
    this._pending = new Set()
    this._frame = false
    this._discs = new Map()
  }

  static get layerOptions(){
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "sr5PanCrown"
    })
  }

  /** @override */
  async _draw(){
  }

  /** @override */
  async _tearDown(){
    for (const crown of this.crowns.values()) crown.container.destroy({
      children: true
    })
    this.crowns.clear()
    this._pending.clear()
    this._frame = false
    for (const texture of this._discs.values()) texture.destroy(true)
    this._discs.clear()
  }

  isOpen(token){
    return this.crowns.has(token?.id)
  }

  /** Open or close the crown of a token. @return {Boolean} whether it is open now */
  async toggle(token){
    if (this.isOpen(token)) {
      this.close(token)
      return false
    }
    await this.open(token)
    return true
  }

  async open(token){
    if (!token?.actor || this.isOpen(token)) return
    const container = this.addChild(new PIXI.Container())
    container.eventMode = "passive"
    const lines = container.addChild(new PIXI.Graphics())
    const icons = container.addChild(new PIXI.Container())
    icons.eventMode = "passive"
    const sceneCenter = canvas.dimensions.sceneRect.center
    const crown = {
      token, container, lines, icons, droneTokenIds: new Set(), version: 0,
      // Fixed once open, so that the crown does not swing round while its token moves
      angle: crownAngle(token.center, sceneCenter),
    }
    this.crowns.set(token.id, crown)
    this.#place(crown)
    await this.#build(crown)
  }

  close(token){
    const crown = this.crowns.get(token?.id)
    if (!crown) return
    this.crowns.delete(token.id)
    crown.container.destroy({
      children: true
    })
  }

  /** Draw again, once in the next frame, the crowns whose token or graph changed (all of them by default) */
  refresh(tokenIds = null){
    if (!this.crowns.size) return
    for (const id of tokenIds ?? this.crowns.keys()) if (this.crowns.has(id)) this._pending.add(id)
    if (this._frame || !this._pending.size) return
    // On the canvas's own clock: nothing is drawn between two of its frames anyway
    this._frame = true
    canvas.app.ticker.addOnce(() => {
      this._frame = false
      const ids = [...this._pending]
      this._pending.clear()
      for (const id of ids){
        const crown = this.crowns.get(id)
        if (crown) this.#build(crown)
      }
    })
  }

  /** A token was redrawn (moved, animated, hidden): follow it, and the lines that lead to it */
  onRefreshToken(token){
    const crown = this.crowns.get(token.id)
    if (crown) this.#place(crown)
    if (!this.crowns.size) return
    const linked = [...this.crowns.values()].filter(c => c.droneTokenIds.has(token.id)).map(c => c.token.id)
    // The viewer moved: what she sees within 100 m may change. A crown with lines to other tokens is laid out again.
    if (token.controlled) return this.refresh()
    // For the gamemaster, a player's token that moves changes what the players see (the purple ring)
    if (game.user?.isGM && token.actor?.hasPlayerOwner) return this.refresh()
    if (crown?.droneTokenIds.size) linked.push(token.id)
    if (linked.length) this.refresh(linked)
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

  async #build(crown){
    const version = ++crown.version
    const {
      token
    } = crown
    if (token.destroyed || !token.actor) return this.close(token)
    const graph = getGraph(token)
    if (!graph) return this.close(token)

    // The pictures first, each loaded once for all the crowns
    const paths = new Set(graph.nodes.map(n => iconPathOf(n.icon, CONFIG.SR5?.panIcons)))
    const textures = new Map()
    await Promise.all([...paths].map(async path => textures.set(path, await foundry.canvas.loadTexture(path, {
      fallback: iconPathOf("device")
    }))))
    // A newer build started while this one waited, or the crown was closed
    if (version !== crown.version || this.crowns.get(token.id) !== crown) return

    crown.droneTokenIds.clear()
    const scale = Math.max(canvas.dimensions.size / 100, 0.5)
    const layout = layoutCrown(graph, {
      tokenRadius: Math.max(token.w, token.h) / 2,
      scale,
      angle: crown.angle,
      tokenOffset: node => {
        if (node.kind !== "drone") return null
        const other = tokenOfNode(node, {
          actor: token.actor, token
        })
        if (!other || other === token) return null
        crown.droneTokenIds.add(other.id)
        return {
          x: other.center.x - token.center.x, y: other.center.y - token.center.y
        }
      },
    })

    this.#drawLines(crown.lines, layout.lines, scale)
    for (const child of crown.icons.removeChildren()) child.destroy({
      children: true
    })
    for (const icon of layout.icons){
      crown.icons.addChild(this.#iconOf(icon, textures.get(iconPathOf(icon.node.icon, CONFIG.SR5?.panIcons)), graph, crown))
    }
    this.#place(crown)
  }

  #drawLines(graphics, lines, scale){
    graphics.clear()
    for (const line of lines){
      const color = line.mode === "offline" ? COLORS.offline : COLORS.line
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
  }, texture, graph, crown){
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
      picture.width = picture.height = radius * 1.3
      picture.tint = offline ? COLORS.pictureOffline : COLORS.picture
    }

    const style = foundry.canvas.containers.PreciseText.getTextStyle({
      fontSize: Math.round(radius * 0.9), anchor: CONST.TEXT_ANCHOR_POINTS.TOP
    })
    const label = icon.addChild(new foundry.canvas.containers.PreciseText(labelOf(node, graph), style))
    label.anchor.set(0.5, 0)
    label.position.set(0, radius + 4)
    label.visible = false

    // The observer's own marks (SR5 p. 238): one diamond per mark, over the icon, on her screen alone
    if (node.viewerMarks > 0) icon.addChild(this.#marksOf(Math.min(node.viewerMarks, 4), radius))

    icon.on("pointerover", () => {
      label.visible = true
      // Over its neighbours while it is read
      icon.parent?.setChildIndex(icon, icon.parent.children.length - 1)
    })
    icon.on("pointerout", () => label.visible = false)
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
    // What no player sees, for the gamemaster: a purple ring outside the others
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

  // The marks of the observer: small diamonds in a row over the icon
  #marksOf(count, radius){
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

  // Lot 2 proves that the click reaches the right icon; lot 3 opens the gamemaster's reveal menu from the hook;
  // lot 4 opens the radial menu from here
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

function labelOf(node, graph){
  const mode = game.i18n.localize(MODE_LABELS[node.mode] ?? MODE_LABELS.active)
  const master = node.uuid === graph.master ? ` · ${game.i18n.localize("SR5.PanCrownMaster")}` : ""
  return `${node.name} — ${mode}${master}`
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
  Hooks.on("deleteToken", document => layer()?.close(document.object ?? {
    id: document.id
  }))
  for (const hook of ["updateItem", "createItem", "deleteItem", "updateActor", "controlToken", "updateUser", "createToken"]){
    Hooks.on(hook, () => layer()?.refresh())
  }
  // Lot 3: the gamemaster's click on an icon opens the reveal menu
  Hooks.on("sr5.panCrownClickIcon", data => {
    if (game.user?.isGM) openGmMenu(data)
  })
}
