import {
  decideVisionSource, isSharedWith, isJumpedInDrone, jumpedInRiggerIds
} from "../system/shared-vision.js"

export class SR5Token extends foundry.canvas.placeables.Token {

  /**
   * A drone or a device shares what it sees with the users in its list (SR5 p. 241: Invite Mark,
   * Snoop), even when it is hidden and while they keep their own token selected. A rigger jumped
   * into a drone sees through the drone, and no longer through his body (SR5 p. 231, 266).
   * Everything else is left to the core.
   * @override
   */
  _isVisionSource() {
    if (canvas.visibility.tokenVision && this.hasSight && !game.user.isGM) {
      const decision = decideVisionSource({
        isGM: false,
        sharedWithMe: isSharedWith(this.document, game.user.id),
        isMyJumpedInDrone: isJumpedInDrone(this.actor) && !!this.actor.isOwner,
        isBlindBody: this.#isJumpedInRigger(),
      })
      if (decision !== null) return decision
    }
    return super._isVisionSource()
  }

  //A rigger jumped into a drone, linked to it by his actor or, unlinked, by his token
  #isJumpedInRigger() {
    if (!["actorPc", "actorGrunt"].includes(this.actor?.type)) return false
    const drones = [
      ...(game.actors?.filter(a => a.type === "actorDrone") ?? []),
      ...(canvas.tokens?.placeables ?? []).map(t => t.actor).filter(a => a?.isToken && a.type === "actorDrone"),
    ]
    const riggers = jumpedInRiggerIds(drones)
    return riggers.has(this.actor.id) || riggers.has(this.document.id)
  }

  /** @override */
  _drawBar(number, bar, data) {
    let mainColorElement = document.getElementById("players")
    let mainColorRGB = window.getComputedStyle(mainColorElement, null).getPropertyValue("border-color")
    let mainColorArray = mainColorRGB.slice(mainColorRGB.indexOf("(") + 1, mainColorRGB.indexOf(")")).split(", ")
    let mainColor = mainColorArray.map(function convertToFloat(number) {
      return number / 255
    })
    let subColorElement = document.getElementById("sidebar")
    let subColorRGB = window.getComputedStyle(subColorElement, null).getPropertyValue("border-left-color")
    let subColorArray = subColorRGB.slice(subColorRGB.indexOf("(") + 1, subColorRGB.indexOf(")")).split(", ")
    let subColor = subColorArray.map(function convertToFloat(number) {
      return number / 255
    })

    bar.scale.set(0.95, 0.5)
    const val = Number(data.value)
    let h = Math.max(canvas.dimensions.size / 12, 8)
    if (this.height >= 2) h *= 1.6 // Enlarge the bar for large tokens
    // Draw the bar
    bar.clear().beginFill(new PIXI.Color(subColor).toNumber(), 0.7).lineStyle(0.5, 0x000000, 1)
    // each max draw a green rectangle in background
    for (let index = 0; index < data.max; index++) {
      bar.drawRect(index * (this.w / data.max), 0, this.w / data.max, h)
    }
    // each actual value draw a rectangle from dark green to red
    bar.beginFill(new PIXI.Color(mainColor).toNumber(), 0.7).lineStyle(0.5, 0x000000, 1)
    for (let index = 0; index < Math.clamp(val, 0, data.max); index++) {
      bar.drawRect(index * (this.w / data.max), 0, this.w / data.max, h)
    }
    // Set position
    let posY = number === 0 ? this.h - (h-4) : 2
    bar.position.set(2.5, (posY))
  }
  
}




