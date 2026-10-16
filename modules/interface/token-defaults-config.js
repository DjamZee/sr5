import {
  TOKEN_DEFAULTS_SETTING, TOKEN_FAMILIES, TOKEN_FIELDS, cleanTokenDefaults, currentTokenDefaults
} from "../system/token-defaults.js"

/**
 * The token of what the system creates in play, family by family (lot 9, system/token-defaults.js).
 *
 * Opened from the "Gamemaster's tools" tab of the settings window (`sr5TokenDefaultsMenu`). One row per family,
 * one column per field; "—" keeps what the system gives.
 */
export class SR5TokenDefaultsConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-token-defaults-config",
    tag: "form",
    classes: ["sr5", "sr-application", "sr-token-defaults-config"],
    position: {
      width: 1080, height: "auto"
    },
    window: {
      title: "SR5.TOKENDEFAULTS_Menu_T", icon: "fas fa-chess-pawn", resizable: true
    },
    form: {
      handler: SR5TokenDefaultsConfig.#onSubmit, closeOnSubmit: true
    },
    actions: {
      reset: SR5TokenDefaultsConfig.#onReset
    },
  }

  static PARTS = {
    form: {
      template: "systems/sr5/templates/interface/token-defaults-config.hbs"
    }
  }

  /** The label of a choice of a field */
  static choiceLabel(field, value) {
    if (field === "bar1" || field === "bar2") return value === "none" ? "SR5.TOKENDEFAULTS_BarNone" : `SR5.TOKENDEFAULTS_Bar_${value.split(".")[1]}`
    if (field === "disposition") return `TOKEN.DISPOSITION.${value}`
    if (field === "sight") return value === "on" ? "SR5.TOKENDEFAULTS_SightOn" : "SR5.TOKENDEFAULTS_SightOff"
    return `TOKEN.DISPLAY_${value}`
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const rows = currentTokenDefaults()
    context.columns = Object.keys(TOKEN_FIELDS).map(field => ({
      field, label: `SR5.TOKENDEFAULTS_Field_${field}`
    }))
    context.families = TOKEN_FAMILIES.map(family => ({
      family,
      label: `SR5.TOKENDEFAULTS_Family_${family}`,
      cells: Object.entries(TOKEN_FIELDS).map(([field, accepted]) => {
        const value = rows[family][field]
        if (accepted === "number") return {
          name: `${family}.${field}`, number: true, value: value ?? "", step: field === "size" ? 0.5 : 1
        }
        return {
          name: `${family}.${field}`,
          choices: accepted.map(choice => ({
            value: choice, label: SR5TokenDefaultsConfig.choiceLabel(field, choice), selected: value === choice
          }))
        }
      })
    }))
    return context
  }

  static async #onSubmit(_event, _form, formData) {
    const rows = foundry.utils.expandObject(formData.object)
    await game.settings.set("sr5", TOKEN_DEFAULTS_SETTING, cleanTokenDefaults(rows))
  }

  /** Every field back to "as the system does" (not saved until "Save") */
  static #onReset() {
    for (const input of this.element.querySelectorAll("select, input[type=number]")) input.value = ""
  }
}
