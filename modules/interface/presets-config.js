import {
  AUTOMATION_PRESET_KEYS, RULES_PRESET_KEYS, presetChanges, taggedBooleanSettings, applySettingValues,
  saveCurrentSettings, savedSettings
} from "../system/settings-presets.js"
import {
  RULE_LOCK_KEYS, currentRuleLocks, presetOf
} from "../system/rule-locks.js"
import {
  TOKEN_DEFAULTS_SETTING
} from "../system/token-defaults.js"
import {
  RULE_LOCKS_SETTING, buildWorldPreset, worldPresetFileName, parseWorldPreset, worldPresetChanges
} from "../system/world-preset-file.js"

// The names of the hidden settings a preset file carries: their menu's, as they have none of their own
const FILE_SETTING_LABELS = {
  [RULE_LOCKS_SETTING]: "SR5.RULELOCKS_Menu_T", [TOKEN_DEFAULTS_SETTING]: "SR5.TOKENDEFAULTS_Menu_T",
  sr5ShopBuyerMode: "SR5.ShopConfigBuyers",
}

/**
 * The gamemaster's presets (lot 10, system/settings-presets.js): automation and rules, what the choice changes before
 * it is applied, and the settings saved by the table to come back to.
 * Opened from the first tab of the settings window (sr5PresetsMenu).
 * The world preset as a .json file (pack 5, § 3, system/world-preset-file.js): exported to share with another
 * gamemaster, imported after a look at what it changes.
 */
export class SR5PresetsConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-presets-config",
    tag: "form",
    classes: ["sr5", "sr-application", "sr-presets-config"],
    position: {
      width: 600, height: "auto"
    },
    window: {
      title: "SR5.PRESETS_Menu_T", icon: "fas fa-wand-magic-sparkles", resizable: true
    },
    form: {
      handler: SR5PresetsConfig.#onSubmit, closeOnSubmit: false
    },
    actions: {
      saveMine: SR5PresetsConfig.#onSaveMine,
      restoreMine: SR5PresetsConfig.#onRestoreMine,
      exportFile: SR5PresetsConfig.#onExportFile,
      importFile: SR5PresetsConfig.#onImportFile,
    },
  }

  static PARTS = {
    form: {
      template: "systems/sr5/templates/interface/presets-config.hbs"
    }
  }

  // The choice being looked at, before it is applied
  #choice = {
    automation: "", rules: ""
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const option = (prefix, keys, selected) => [{
      key: "", label: "SR5.PRESETS_Keep", selected: !selected
    }, ...keys.map(key => ({
      key, label: `SR5.PRESETS_${prefix}_${key}`, hint: `SR5.PRESETS_${prefix}_${key}_D`, selected: key === selected
    }))]
    context.automation = option("Automation", AUTOMATION_PRESET_KEYS, this.#choice.automation)
    context.rules = option("Rules", RULES_PRESET_KEYS, this.#choice.rules)
    context.changes = this.#previewRows()
    context.hasChoice = !!(this.#choice.automation || this.#choice.rules)
    const saved = savedSettings()
    context.saved = saved ? game.i18n.format("SR5.PRESETS_SavedOn", {
      date: new Date(saved.time).toLocaleString(game.i18n.lang), user: saved.user
    }) : null
    return context
  }

  // One row per setting the choice would change: its name, what it is now, what it would become
  #previewRows(){
    const {
      values, locks
    } = presetChanges(this.#choice, taggedBooleanSettings())
    const rows = []
    for (const [key, value] of Object.entries(values)) {
      const setting = game.settings.settings.get(`sr5.${key}`)
      if (!setting) continue
      const now = game.settings.get("sr5", key)
      if (now === value) continue
      rows.push({
        label: game.i18n.localize(setting.name), from: SR5PresetsConfig.valueLabel(setting, now), to: SR5PresetsConfig.valueLabel(setting, value)
      })
    }
    if (locks) {
      const now = currentRuleLocks()
      if (RULE_LOCK_KEYS.some(k => now[k] !== locks[k])) rows.push({
        label: game.i18n.localize("SR5.RULELOCKS_Menu_T"),
        from: game.i18n.localize(`SR5.RULELOCKS_Preset_${presetOf(now)}`),
        to: game.i18n.localize(`SR5.RULELOCKS_Preset_${presetOf(locks)}`),
      })
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang))
  }

  static valueLabel(setting, value){
    // A list or a group of values (rule locks, token defaults): its rows are not shown one by one
    if (value && typeof value === "object") return game.i18n.localize(Array.isArray(value) && !value.length ? "SR5.PRESETS_File_Empty" : "SR5.PRESETS_File_Group")
    if (typeof value === "boolean") return game.i18n.localize(value ? "SR5.SETTINGS_Default_On" : "SR5.SETTINGS_Default_Off")
    if (setting.choices && Object.hasOwn(setting.choices, value)) return game.i18n.localize(setting.choices[value])
    return String(value)
  }

  async _onRender(context, options) {
    await super._onRender(context, options)
    // A choice shows at once what it would change
    for (const select of this.element.querySelectorAll("select[data-preset]")) select.addEventListener("change", () => {
      this.#choice[select.dataset.preset] = select.value
      this.render()
    })
    const input = this.element.querySelector(".sr-preset-file-input")
    input?.addEventListener("change", async () => {
      const file = input.files?.[0]
      input.value = ""
      if (file) await SR5PresetsConfig.#importText(await file.text())
      this.render()
    })
  }

  static async #apply(values, locks){
    const {
      written, reload
    } = await applySettingValues(values, locks)
    ui.notifications.info(game.i18n.format("SR5.PRESETS_Applied", {
      count: written.length
    }))
    if (reload) await foundry.applications.settings.SettingsConfig.reloadConfirm({
      world: true
    })
    // The settings window open behind shows the new values
    foundry.applications.instances.get("sr5-settings-config")?.render()
    return written
  }

  static async #onSubmit(_event, _form, _formData) {
    const {
      values, locks
    } = presetChanges(this.#choice, taggedBooleanSettings())
    if (!this.#choice.automation && !this.#choice.rules) return
    await SR5PresetsConfig.#apply(values, locks)
    this.#choice = {
      automation: "", rules: ""
    }
    this.render()
  }

  static async #onSaveMine() {
    await saveCurrentSettings()
    ui.notifications.info(game.i18n.localize("SR5.PRESETS_Saved"))
    this.render()
  }

  // The world's settings in a .json file, with the system's version and the date
  static #onExportFile() {
    const date = new Date()
    const data = buildWorldPreset({
      date
    })
    foundry.utils.saveDataToFile(`${JSON.stringify(data, null, 2)}\n`, "application/json", worldPresetFileName(game.world?.id, date))
    ui.notifications.info(game.i18n.format("SR5.PRESETS_File_Exported", {
      count: Object.keys(data.settings).length
    }))
  }

  static #onImportFile() {
    this.element.querySelector(".sr-preset-file-input")?.click()
  }

  // A file read: what it changes, what it leaves out, then the gamemaster's word before anything is written
  static async #importText(text) {
    const parsed = parseWorldPreset(text)
    if (parsed.error) return ui.notifications.error(game.i18n.localize(`SR5.PRESETS_File_Error_${parsed.error}`))
    const esc = value => foundry.utils.escapeHTML(String(value ?? ""))
    const changes = worldPresetChanges(parsed)
    const rows = changes.map(({
      key, from, to
    }) => {
      const setting = game.settings.settings.get(`sr5.${key}`)
      const label = game.i18n.localize(FILE_SETTING_LABELS[key] ?? setting?.name ?? key)
      const valueLabel = value => key === "sr5ShopBuyerMode" ? game.i18n.localize(`SR5.ShopBuyerMode_${value}`) : SR5PresetsConfig.valueLabel(setting, value)
      return {
        label, from: valueLabel(from), to: valueLabel(to)
      }
    }).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang))
    const date = Date.parse(parsed.date)
    let content = `<p>${esc(game.i18n.format("SR5.PRESETS_File_From", {
      version: parsed.systemVersion || "?", date: Number.isNaN(date) ? "?" : new Date(date).toLocaleString(game.i18n.lang)
    }))}</p>`
    if (parsed.systemVersion && parsed.systemVersion !== game.system.version) content += `<p class="hint">${esc(game.i18n.format("SR5.PRESETS_File_OtherVersion", {
      version: game.system.version
    }))}</p>`
    content += rows.length ? `<table class="sr-preset-preview"><tbody>${rows.map(row => `<tr><th scope="row">${esc(row.label)}</th><td class="from">${esc(row.from)}</td><td class="arrow"><i class="fas fa-arrow-right" aria-hidden="true"></i></td><td class="to">${esc(row.to)}</td></tr>`).join("")}</tbody></table>` :
      `<p class="hint">${esc(game.i18n.localize("SR5.PRESETS_File_NoChange"))}</p>`
    if (parsed.ignored.length) content += `<p class="hint">${esc(game.i18n.localize("SR5.PRESETS_File_Ignored"))} ${parsed.ignored.map(key => `<code>${esc(key)}</code>`).join(", ")}</p>`
    if (parsed.invalid.length) content += `<p class="hint">${esc(game.i18n.localize("SR5.PRESETS_File_Invalid"))} ${parsed.invalid.map(key => `<code>${esc(key)}</code>`).join(", ")}</p>`
    if (!changes.length) return foundry.applications.api.DialogV2.prompt({
      window: {
        title: "SR5.PRESETS_File_Import"
      },
      classes: ["sr-world-preset-import"],
      content,
      rejectClose: false,
    })
    const sure = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.PRESETS_File_Import"
      },
      classes: ["sr-world-preset-import"],
      position: {
        width: 560
      },
      content,
      rejectClose: false,
    })
    if (!sure) return
    await SR5PresetsConfig.#apply(parsed.values, parsed.locks)
  }

  static async #onRestoreMine() {
    const saved = savedSettings()
    if (!saved) return
    const sure = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.PRESETS_Restore"
      },
      content: `<p>${game.i18n.localize("SR5.PRESETS_RestoreConfirm")}</p>`,
      rejectClose: false,
    })
    if (!sure) return
    await SR5PresetsConfig.#apply(saved.values, saved.locks ?? null)
    this.render()
  }
}
