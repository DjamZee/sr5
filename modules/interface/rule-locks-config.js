import {
  RULE_LOCK_CASES, RULE_LOCK_FAMILIES, currentRuleLocks, setRuleLocks
} from "../system/rule-locks.js"

/**
 * The gamemaster's rule locks (B13): one box per family of rules.
 *
 * Opened from the "Rule locks" tab of the settings window (`sr5RuleLocksMenu`). The Book / Light selector it had went
 * to the presets menu (lot 10, automation advanced / light), so that the window has one selector only; the preset the
 * boxes amount to is still written (sr5RuleLocksPreset) by setRuleLocks. The values live in system/rule-locks.js.
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

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object
    const locks = Object.fromEntries([...RULE_LOCK_FAMILIES, ...Object.keys(RULE_LOCK_CASES)]
      .map(key => [key, data[`lock.${key}`] === true]))
    await setRuleLocks(locks)
  }
}
