import {
  decideVisionSource, seesThrough, isJumpedInDrone, jumpedInRiggerIds, hidesItsOwnSight
} from "../system/shared-vision.js"
import {
  TOKEN_BAR_EMPTY, tokenBarFilledColor 
} from "./token-bar-colors.js"
import {
  SR5Pickpocket
} from "./pickpocket.js"
import {
  vendorShopOfToken
} from "./shop-vendor-rules.js"

export class SR5Token extends foundry.canvas.placeables.Token {

  /**
   * The core opens the HUD to the token's owners only. A thief who has his own token selected,
   * within reach, opens it on his target too, to pick a pocket (SR5 p. 422): the HUD then keeps
   * that single button.
   * @override
   */
  _canHUD(user, event) {
    if (super._canHUD(user, event)) return true
    //The core's own guards, before its ownership test
    if (this.layer._draggedToken || !this.layer.active || this.isPreview) return false
    if (canvas.controls.ruler?.active || (CONFIG.Canvas.rulerClass.canMeasure && (event?.type === "pointerdown"))) return false
    return SR5Pickpocket.canPickFrom(this.document)
  }

  /**
   * The core lets a double-click through to those who may see the actor (Limited at least). A
   * vendor whose shop is open lets anyone in: the double-click opens the shop, never the sheet.
   * @override
   */
  _canView(user, event) {
    if (super._canView(user, event)) return true
    //The core's own guards, before its permission test
    if (this.layer._draggedToken || !this.layer.active || this.isPreview) return false
    if (canvas.controls.ruler?.active || (CONFIG.Canvas.rulerClass.canMeasure && (event?.type === "pointerdown"))) return false
    return !!vendorShopOfToken(this.document)
  }

  /**
   * A vendor's token opens its shop to whoever does not own it: the players never see the
   * Grunt's sheet, they walk up to the counter (shop lot C).
   * @override
   */
  _onClickLeft2(event) {
    const vendor = vendorShopOfToken(this.document)
    if (!vendor) return super._onClickLeft2(event)
    // Loaded on demand: the shop is heavy, and a token is drawn long before anyone buys
    import("./shop-vendor.js").then(({
      SR5ShopVendor
    }) => SR5ShopVendor.openShop(vendor.actor, vendor.storage))
  }

  /**
   * The core takes control of the token right-clicked, which releases the others: on a target the
   * thief cannot control, his own token would be released and the pocket out of reach. The HUD
   * opens on the target and the thief stays selected.
   * @override
   */
  _onClickRight(event) {
    if (this.document.isOwner || !this.layer.hud || !SR5Pickpocket.canPickFrom(this.document)) return super._onClickRight(event)
    if (this.hasActiveHUD) this.layer.hud.close()
    else this.layer.hud.bind(this)
    if (!this._propagateRightClick(event)) event.stopPropagation()
  }

  /**
   * A drone or a device shares what it sees with the users in its list (SR5 p. 241: Invite Mark,
   * Snoop), even when it is hidden and while they keep their own token selected: they see both at
   * once, and exactly what the device's own vision reveals, nothing more (arbitrage de DjamZ,
   * 2026-10-04). A rigger jumped into a drone sees through the drone, and no longer through his
   * body (SR5 p. 231, 266; arbitrage de DjamZ, 2026-10-04). Everything else is left to the core.
   * @override
   */
  _isVisionSource() {
    if (canvas.visibility.tokenVision && this.hasSight && !game.user.isGM) {
      const decision = decideVisionSource({
        isGM: false,
        sharedWithMe: seesThrough(this.document, game.user.id),
        isMyJumpedInDrone: isJumpedInDrone(this.actor) && !!this.actor.isOwner,
        isBlindBody: this.#isJumpedInRigger(),
      })
      if (decision !== null) return decision
    }
    return super._isVisionSource()
  }

  /**
   * A device seen through shows what it sees, not itself: the user sees it only if his other eyes do
   * (arbitrage de DjamZ, 2026-10-04). The core shows any token whose vision is active, so its own
   * source is suppressed for the test, through the public suppression record of the source.
   * @override
   */
  get isVisible() {
    const source = this.vision
    if (!source || !hidesItsOwnSight({
      isGM: game.user.isGM, sharedWithMe: seesThrough(this.document, game.user.id), isOwner: !!this.actor?.isOwner
    })) return super.isVisible
    source.suppression.sr5SeenThrough = true
    try {
      return super.isVisible
    } finally {
      delete source.suppression.sr5SeenThrough
    }
  }

  //The riggers jumped into a drone, read once and kept until an actor, a token or a drone changes
  static #jumpedInRiggers = null

  static clearJumpedInRiggers() {
    SR5Token.#jumpedInRiggers = null
  }

  static getJumpedInRiggers() {
    if (!SR5Token.#jumpedInRiggers) SR5Token.#jumpedInRiggers = jumpedInRiggerIds([
      ...(game.actors?.filter(a => a.type === "actorDrone") ?? []),
      ...(canvas.tokens?.placeables ?? []).map(t => t.actor).filter(a => a?.isToken && a.type === "actorDrone"),
    ])
    return SR5Token.#jumpedInRiggers
  }

  //A rigger jumped into a drone, linked to it by his actor or, unlinked, by his token
  #isJumpedInRigger() {
    if (!["actorPc", "actorGrunt"].includes(this.actor?.type)) return false
    const riggers = SR5Token.getJumpedInRiggers()
    return riggers.has(this.actor.id) || riggers.has(this.document.id)
  }

  /** @override */
  _drawBar(number, bar, data) {
    bar.scale.set(0.95, 0.5)
    const val = Number(data.value)
    let h = Math.max(canvas.dimensions.size / 12, 8)
    if (this.height >= 2) h *= 1.6 // Enlarge the bar for large tokens
    // Draw the bar
    bar.clear().beginFill(TOKEN_BAR_EMPTY.color, TOKEN_BAR_EMPTY.alpha).lineStyle(0.5, 0x000000, 1)
    // each max draws an empty box in background
    for (let index = 0; index < data.max; index++) {
      bar.drawRect(index * (this.w / data.max), 0, this.w / data.max, h)
    }
    // each actual value draws a wounded box over it
    bar.beginFill(tokenBarFilledColor(data.attribute), 1).lineStyle(0.5, 0x000000, 1)
    for (let index = 0; index < Math.clamp(val, 0, data.max); index++) {
      bar.drawRect(index * (this.w / data.max), 0, this.w / data.max, h)
    }
    // Set position
    let posY = number === 0 ? this.h - (h-4) : 2
    bar.position.set(2.5, (posY))
  }
  
}




