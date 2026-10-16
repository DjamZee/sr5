import {
  SETTINGS_TABS, SETTINGS_TAGS, SETTINGS_WINDOW_MENU, capturedMenus, capturedSettingIds, captureSystemSettings, catalogEntry
} from "../system/settings-catalog.js"
import {
  defaultBannerFolder
} from "./shop-vendor-templates.js"
import {
  activeMegapackId
} from "../system/megapack.js"

/**
 * The system's settings, by tab (B10). Opened from the one button left in Foundry's settings.
 *
 * Built on Foundry's own settings window (foundry.applications.settings.SettingsConfig): its fields,
 * its search box, its save and its reload prompt. Only the sorting changes: the settings that
 * captureSystemSettings took out of the general list are spread over the tabs of settings-catalog.js.
 * A player or an assistant without the right to change world settings sees only their own ones,
 * as in Foundry's window.
 */
export class SR5SettingsConfig extends foundry.applications.settings.SettingsConfig {

  static DEFAULT_OPTIONS = {
    id: "sr5-settings-config",
    classes: ["sr5-settings-config"],
    window: {
      title: "SR5.SETTINGS_Window_T", icon: "fas fa-sliders"
    },
    actions: {
      openSubmenu: SR5SettingsConfig.#onOpenSubmenu,
      resetDefaults: SR5SettingsConfig.#onResetDefaults,
    },
    initialCategory: null,
  }

  // Own tabs: left undeclared, the tabs built by Foundry's window would be read here, and the reverse
  static TABS = {
  }

  // Input name ("sr5.key") → its label and its default, written into the rendered rows
  #notes = new Map()

  /** @override */
  async _prepareContext(options) {
    // A user who may change world settings sees more tabs than one who may not: rebuilt at each opening
    if (options.isFirstRender) options.resetTabs = true
    return super._prepareContext(options)
  }

  /** @override */
  _prepareCategoryData() {
    const canConfigure = game.user.can("SETTINGS_MODIFY")
    const categories = {
    }
    const category = id => {
      const tab = SETTINGS_TABS.find(t => t.id === id) ?? SETTINGS_TABS.at(-1)
      return categories[tab.id] ??= {
        id: tab.id, label: game.i18n.localize(tab.label), entries: []
      }
    }

    for (const [key, menu] of capturedMenus()) {
      if (menu.restricted && !canConfigure) continue
      category(catalogEntry(key.slice(menu.namespace.length + 1)).tab).entries.push({
        key, icon: menu.icon, label: menu.name, hint: menu.hint, menu: true, buttonText: menu.label
      })
    }

    // Foundry's window builds the field of each setting it shows (a range, a file picker, a list...):
    // the captured settings are shown to it for the time of the call, then hidden again
    const ids = new Set(capturedSettingIds())
    const settings = ids.size ? [...ids].map(id => game.settings.settings.get(id)).filter(Boolean) : []
    let built
    try {
      for (const setting of settings) setting.config = true
      built = super._prepareCategoryData()
    } finally {
      for (const setting of settings) setting.config = false
    }

    this.#notes.clear()
    for (const entry of Object.values(built).flatMap(c => c.entries)) {
      const id = entry.field?.name
      if (entry.menu || !ids.has(id)) continue
      const setting = game.settings.settings.get(id)
      const {
        tab, tag
      } = catalogEntry(setting.key)
      category(tab).entries.push(entry)
      this.#notes.set(id, {
        tag, defaultLabel: SR5SettingsConfig.defaultLabel(setting)
      })
    }
    return categories
  }

  /** @override */
  _sortCategories(a, b) {
    const rank = c => SETTINGS_TABS.findIndex(t => t.id === c.id)
    return rank(a) - rank(b)
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options)
    // Relecture djamz.13 (R9): an empty banner folder reads the Megapack's (bannerFolderOf); the field says so
    // instead of staying empty, worlds that saved the window having kept an empty value whatever the default
    const banner = this.element.querySelector('[name="sr5.sr5ShopBannerFolder"]')
    if (banner && !banner.value?.trim()) banner.value = defaultBannerFolder(activeMegapackId())
    for (const [name, note] of this.#notes) {
      const group = this.element.querySelector(`[name="${name}"]`)?.closest(".form-group")
      if (!group) continue
      const label = group.querySelector(":scope > label")
      if (note.tag && label && !label.querySelector(".sr5-settings-tag")) {
        const tag = document.createElement("span")
        tag.className = `sr5-settings-tag ${note.tag}`
        tag.textContent = game.i18n.localize(SETTINGS_TAGS[note.tag])
        label.append(" ", tag)
      }
      if (note.defaultLabel !== null && !group.querySelector(".sr5-settings-default")) {
        let hint = group.querySelector(":scope > .hint")
        if (!hint) {
          hint = document.createElement("p")
          hint.className = "hint"
          group.append(hint)
        }
        const value = document.createElement("span")
        value.className = "sr5-settings-default"
        value.textContent = game.i18n.format("SR5.SETTINGS_Default", {
          value: note.defaultLabel
        })
        hint.append(" ", value)
      }
    }
  }

  /**
   * The default of a setting, as the window says it: checked or not, the label of a choice, or the value.
   * @returns {string|null} null when there is nothing to say (an object, a data model)
   */
  static defaultLabel(setting) {
    const value = setting.default
    if (typeof value === "boolean") return game.i18n.localize(value ? "SR5.SETTINGS_Default_On" : "SR5.SETTINGS_Default_Off")
    const choices = setting.choices
    if (choices && typeof choices === "object" && Object.hasOwn(choices, value)) return game.i18n.localize(choices[value])
    if (value === "" || value === null || value === undefined) return game.i18n.localize("SR5.SETTINGS_Default_Empty")
    if (typeof value === "object") return null
    return String(value)
  }

  // The submenus are no longer in game.settings.menus: they are opened from what was captured
  static async #onOpenSubmenu(_event, button) {
    const menu = capturedMenus().get(button.dataset.key) ?? game.settings.menus.get(button.dataset.key)
    if (!menu) return
    await new menu.type().render(true)
  }

  // Foundry's reset reads `config`, which the captured settings no longer have
  static #onResetDefaults() {
    const form = this.form
    for (const id of capturedSettingIds()) {
      const setting = game.settings.settings.get(id)
      const input = form?.elements?.namedItem(id)
      if (!setting || !input) continue
      if (input.type === "checkbox") input.checked = setting.default
      else input.value = setting.default
      input.dispatchEvent(new Event("change"))
    }
    ui.notifications.info("SETTINGS.ResetInfo", {
      localize: true
    })
  }
}

// At init, once every setting is registered: the one button left in Foundry's list, open to all users
export function registerSettingsWindow() {
  game.settings.registerMenu("sr5", SETTINGS_WINDOW_MENU, {
    name: "SR5.SETTINGS_Window_T",
    label: "SR5.SETTINGS_Window_L",
    hint: "SR5.SETTINGS_Window_D",
    icon: "fas fa-sliders",
    type: SR5SettingsConfig,
    restricted: false,
  })
  captureSystemSettings()
  // A setting registered later in the init (by a module of the system, for one) is picked up too
  Hooks.once("setup", () => captureSystemSettings())
}
