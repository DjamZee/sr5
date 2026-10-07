import {
  RULE_LOCK_CASES, RULE_LOCK_FAMILIES, RULE_LOCK_PRESETS, currentRuleLocks, presetLocks, presetOf, setRuleLocks
} from "../system/rule-locks.js"

/**
 * The gamemaster's rule locks (B13): a preset and one box per family of rules.
 *
 * Opened from the "Rule locks" tab of the settings window (`sr5RuleLocksMenu`). Choosing "Book" or "Light"
 * checks or unchecks every box; touching a box turns the preset to "Custom". The values live in
 * system/rule-locks.js (sr5RuleLocks, sr5RuleLocksPreset).
 */
export class SR5RuleLocksConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-rule-locks-config",
    tag: "form",
    classes: ["sr5", "sr-application", "sr-rule-locks-config"],
    position: {
      width: 560, height: "auto"
    },
    window: {
      title: "SR5.RULELOCKS_Menu_T", icon: "fas fa-lock", resizable: true
    },
    form: {
      handler: SR5RuleLocksConfig.#onSubmit, closeOnSubmit: true
    },
  }

  static PARTS = {
    form: {
      template: "systems/sr5/templates/interface/rule-locks-config.hbs"
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const locks = currentRuleLocks()
    const preset = presetOf(locks)
    context.presets = RULE_LOCK_PRESETS.map(key => ({
      key, label: `SR5.RULELOCKS_Preset_${key}`, selected: key === preset
    }))
    context.families = RULE_LOCK_FAMILIES.map(family => ({
      key: family,
      label: `SR5.RULELOCKS_Family_${family}`,
      hint: `SR5.RULELOCKS_Family_${family}_D`,
      checked: locks[family],
      cases: Object.entries(RULE_LOCK_CASES)
        .filter(([, of]) => of === family)
        .map(([key]) => ({
          key, label: `SR5.RULELOCKS_Case_${key}`, checked: locks[key]
        })),
    }))
    return context
  }

  async _onRender(context, options) {
    await super._onRender(context, options)
    const select = this.element.querySelector("select[name=preset]")
    const boxes = [...this.element.querySelectorAll("input[type=checkbox][data-lock]")]
    // A preset checks or unchecks every box; "custom" leaves them as they are
    select?.addEventListener("change", () => {
      if (select.value === "custom") return
      const locks = presetLocks(select.value)
      for (const box of boxes) box.checked = locks[box.dataset.lock]
    })
    // A box touched: the preset says what the boxes now amount to
    for (const box of boxes) box.addEventListener("change", () => {
      if (!select) return
      select.value = presetOf(Object.fromEntries(boxes.map(b => [b.dataset.lock, b.checked])))
    })
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object
    const locks = Object.fromEntries([...RULE_LOCK_FAMILIES, ...Object.keys(RULE_LOCK_CASES)]
      .map(key => [key, data[`lock.${key}`] === true]))
    await setRuleLocks(locks)
  }
}
