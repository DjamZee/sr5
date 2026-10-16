import {
  SR5SharedVision
} from "./shared-vision.js"
import {
  SR5Pickpocket
} from "./pickpocket.js"
import {
  playerMayOpenPan
} from "../canvas/pan-crown/pan-crown.js"
import {
  activeDeviceOf
} from "../canvas/pan-crown/pan-graph.js"
import {
  normalizeCommcode
} from "../system/commcode-rules.js"
import {
  hudShopOfToken
} from "./shop-vendor-rules.js"

/**
 * Icons of the system on the token HUD.
 *
 * The V13 TokenHUD builds its own parts from the core templates and never
 * reads a system template, so the old srtoken-hud.hbs was dead weight: the
 * only way back to the SR5 icons is to swap them once the HUD is rendered.
 */
const HUD_ICONS = {
  '[data-action="config"]': "hud_configure.svg",
  '[data-action="target"]': "hud_target.svg",
  '[data-action="visibility"]': "hud_visibility.svg",
  '[data-action="togglePalette"][data-palette="effects"]': "hud_effect.svg",
  '[data-action="combat"]': "hud_combat.svg"
}

export default class SR5TokenHud extends foundry.applications.hud.TokenHUD {
  constructor(...args) {
    super(...args)
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "token-hud"
    })
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this.#dressControlIcons()
    this.#addStorageButton()
    this.#addPanCrownButton()
    this.#addCommcodeButton()
    this.#addShopButton()
    SR5SharedVision.addHudButton(this)
    SR5Pickpocket.addHudButton(this)
    //Opened on someone else's token to pick his pocket: nothing else of his is the user's to touch
    if (!this.document?.isOwner) {
      for (const el of this.element?.querySelectorAll(".control-icon, .attribute, input, .palette") ?? []) {
        if (!el.closest(".sr-hud-pickpocket, .sr-hud-pickpocket-plant, .sr-hud-pan, .sr-hud-shop")) el.remove()
      }
      // Nothing left of it for her: no empty HUD
      if (!this.element?.querySelector(".control-icon")) this.close()
    }
  }

  /**
   * Give each control the SR5 drawing, and leave alone any control we have
   * no drawing for — the movement action and the two sort arrows.
   */
  #dressControlIcons() {
    for (const [selector, file] of Object.entries(HUD_ICONS)) {
      for (const control of this.element?.querySelectorAll(`.control-icon${selector}`) ?? []) {
        // Core draws some of these as a Font Awesome glyph and others as an
        // image of its own: both have to give way to the SR5 drawing.
        const icon = control.querySelector(":scope > i, :scope > img")
        if (!icon) continue
        const img = document.createElement("img")
        img.src = `systems/sr5/assets/img/ui/${file}`
        img.alt = ""
        icon.replaceWith(img)
      }
    }
  }

  /**
   * A way into a storage left on the ground that costs no selection: opening
   * it by clicking its own token would make the bag the one who takes.
   */
  #addStorageButton() {
    if (this.document?.actor?.type !== "actorStorage") return

    const middle = this.element?.querySelector(".col.middle")
    if (!middle || middle.querySelector(".sr-hud-storage")) return

    const button = document.createElement("button")
    button.type = "button"
    button.className = "control-icon sr-hud-storage"
    button.dataset.tooltip = game.i18n.localize("SR5.HUD.OpenStorage")
    button.innerHTML = "<img src=\"systems/sr5/assets/img/ui/hud_storage.svg\" alt=\"\" />"
    button.addEventListener("click", event => {
      event.preventDefault()
      event.stopPropagation()
      // Render alone: whoever is standing there stays the one who takes
      this.document?.actor?.sheet?.render(true)
    })
    middle.appendChild(button)
  }

  /**
   * A vendor's shop from the right-click (relecture djamz.13, lot R6): the gamemaster's way into the
   * counter, since his double-click opens the Grunt's sheet; the double-click stays as it was.
   */
  #addShopButton() {
    const shop = hudShopOfToken(this.document, game.user?.isGM)
    if (!shop) return

    const column = this.element?.querySelector(".col.left")
    if (!column || column.querySelector(".sr-hud-shop")) return

    const button = document.createElement("button")
    button.type = "button"
    button.className = "control-icon sr-hud-shop"
    button.dataset.tooltip = game.i18n.localize("SR5.HUD.OpenShop")
    button.setAttribute("aria-label", button.dataset.tooltip)
    button.innerHTML = "<i class=\"fas fa-store\"></i>"
    button.addEventListener("click", async event => {
      event.preventDefault()
      event.stopPropagation()
      this.close()
      // Loaded on demand, as the double-click does
      const {
        SR5ShopVendor
      } = await import("./shop-vendor.js")
      SR5ShopVendor.openShop(shop.actor, shop.storage)
    })
    column.appendChild(button)
  }

  /**
   * Open and close the crown of the token's PAN (couronne du PAN, lot 2).
   * A storage on the ground has no PAN.
   */
  #addPanCrownButton() {
    const token = this.object
    const layer = canvas?.sr5PanCrown
    if (!token?.actor || !layer || token.actor.type === "actorStorage") return
    // Someone else's token: for a player with a commlink, a deck or an RCC (séance de DjamZ du 09/10)
    if (!this.document?.isOwner && !game.user?.isGM && !playerMayOpenPan(token)) return

    const column = this.element?.querySelector(".col.right")
    if (!column || column.querySelector(".sr-hud-pan")) return

    const button = document.createElement("button")
    button.type = "button"
    button.className = "control-icon sr-hud-pan"
    button.classList.toggle("active", layer.isOpen(token))
    button.dataset.tooltip = game.i18n.localize("SR5.HUD.PanCrown")
    button.setAttribute("aria-label", button.dataset.tooltip)
    button.textContent = "PAN"
    button.addEventListener("click", async event => {
      event.preventDefault()
      event.stopPropagation()
      button.classList.toggle("active", await layer.toggle(token))
    })
    column.appendChild(button)
  }

  /**
   * The messaging of the token's device (relecture djamz.13, SR5 p. 241, lot 14): for its owner and the gamemaster,
   * when it has a device with a commcode
   */
  #addCommcodeButton() {
    const actor = this.object?.actor
    if (!actor || !this.document?.isOwner) return
    const device = activeDeviceOf(actor)
    const own = normalizeCommcode(device?.system?.commcode) ? device :
      Array.from(actor.items ?? []).find(i => i.type === "itemDevice" && normalizeCommcode(i.system?.commcode))
    if (!own) return

    const column = this.element?.querySelector(".col.right")
    if (!column || column.querySelector(".sr-hud-commcode")) return

    const button = document.createElement("button")
    button.type = "button"
    button.className = "control-icon sr-hud-commcode"
    button.dataset.tooltip = game.i18n.localize("SR5.COMMCODE_Open")
    button.setAttribute("aria-label", button.dataset.tooltip)
    button.innerHTML = "<i class=\"fas fa-comment-dots\"></i>"
    button.addEventListener("click", async event => {
      event.preventDefault()
      event.stopPropagation()
      ;(await import("./commcode-window.js")).SR5CommcodeWindow.openDevice(own.uuid)
    })
    column.appendChild(button)
  }
}
