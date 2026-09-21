/**
 * Icons of the system on the token HUD.
 *
 * The V13 TokenHUD builds its own parts from the core templates and never
 * reads a system template, so the old srtoken-hud.hbs was dead weight: the
 * only way back to the SR5 icons is to swap them once the HUD is rendered.
 */
const HUD_ICONS = {
  config: "hud_configure.svg",
  target: "hud_target.svg",
  visibility: "hud_visibility.svg",
  effects: "hud_effect.svg",
  combat: "hud_combat.svg"
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
  }

  /**
   * Replace the Font Awesome glyph of each control by the SR5 drawing, and
   * leave alone any control we have no drawing for.
   */
  #dressControlIcons() {
    for (const [action, file] of Object.entries(HUD_ICONS)) {
      for (const control of this.element?.querySelectorAll(`.control-icon[data-action="${action}"]`) ?? []) {
        const glyph = control.querySelector(":scope > i")
        if (!glyph) continue
        const img = document.createElement("img")
        img.src = `systems/sr5/assets/img/ui/${file}`
        img.alt = ""
        glyph.replaceWith(img)
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
}
