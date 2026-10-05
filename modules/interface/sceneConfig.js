import {
  SR5
} from "../config.js"
import {
  BACKGROUND_COUNT_PHENOMENA, phenomenonOptions, phenomenonNoise
} from "./background-count-phenomena.js"
import {
  activeManaShifts
} from "../system/background-count.js"
import {
  removeManaShift
} from "../system/mana-shift.js"

export default class SR5SceneConfig extends foundry.applications.sheets.SceneConfig {

  static PARTS = (() => {
    const {
      footer, ...rest 
    } = foundry.applications.sheets.SceneConfig.PARTS
    return {
      ...rest,
      sr5tabs: {
        template: "systems/sr5/templates/interface/scene-sr5-tabs.hbs" 
      },
      ...(footer ? {
        footer 
      } : {
      })
    }
  })()

  static TABS = {
    sheet: {
      tabs: [
        ...foundry.applications.sheets.SceneConfig.TABS.sheet.tabs,
        {
          id: "environmentalMod", icon: "fa-solid fa-cloud-sun-rain", label: "SR5.EnvironmentalModifiers" 
        },
        {
          id: "matrixNoise", icon: "fa-solid fa-wifi", label: "SR5.SceneMatrixNoise" 
        },
        {
          id: "backgroundCount", icon: "fa-solid fa-hat-wizard", label: "SR5.SceneBackgroundCount" 
        },
      ],
      initial: "basics",
      labelPrefix: "SCENE.TABS.SHEET"
    },
    ambience: foundry.applications.sheets.SceneConfig.TABS.ambience
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options)
    if (partId === "sr5tabs") {
      if (foundry.utils.isEmpty(this.document.flags.sr5)) {
        await this.document.setFlag("sr5", "placeholder", true)
      }
      context.sr5lists = SR5
      context.sr5phenomena = phenomenonOptions()
      //Shadow Spells p. 25: the Mana Flux / Ebb running on this scene
      const now = game.time?.worldTime ?? 0
      context.sr5manaShifts = activeManaShifts(this.document.flags.sr5, now).map(s => ({
        id: s.id, name: s.name, shift: s.kind === "flux" ? "+1" : "-1", hours: Math.ceil((s.expires - now) / 3600)
      }))
    }
    return context
  }

  //The form's values when it is open (not yet saved), the scene's otherwise
  computeMatrixNoise(element) {
    const read = (name) => element?.querySelector(`[name="flags.sr5.${name}"]`)?.value ?? this.document.flags.sr5?.[name]
    return (parseInt(read("matrixSpam")) || 0) + (parseInt(read("matrixStatic")) || 0) +
      phenomenonNoise(read("backgroundCountPhenomenon"), read("backgroundCountValue"))
  }

  //Shows the noise; it is only saved with the form (or here on render, from saved values): saving it
  //on a field change redrew the sheet and lost every value not yet saved
  updateMatrixNoise(element, save = false) {
    const matrixNoise = this.computeMatrixNoise(element)
    const noiseField = element.querySelector('[name="sceneNoiseRating"]')
    if (noiseField) noiseField.value = matrixNoise
    if (save && matrixNoise !== this.document.flags.sr5?.matrixNoise) this.document.setFlag("sr5", "matrixNoise", matrixNoise)
  }

  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData)
    foundry.utils.setProperty(submitData, "flags.sr5.matrixNoise", this.computeMatrixNoise(form))
    return submitData
  }

  async _onRender(context, options) {
    await super._onRender(context, options)
    this.updateMatrixNoise(this.element, true)

    const matrixSpam = this.element.querySelector('[name="flags.sr5.matrixSpam"]')
    if (matrixSpam) matrixSpam.addEventListener("change", _ev => {
      this.updateMatrixNoise(this.element)
    })

    const matrixStatic = this.element.querySelector('[name="flags.sr5.matrixStatic"]')
    if (matrixStatic) matrixStatic.addEventListener("change", _ev => {
      this.updateMatrixNoise(this.element)
    })

    //Aetherologie p. 33-35: a phenomenon fills the count and its alignment, which stay editable
    const phenomenon = this.element.querySelector('[name="flags.sr5.backgroundCountPhenomenon"]')
    const countField = this.element.querySelector('[name="flags.sr5.backgroundCountValue"]')
    const alignmentField = this.element.querySelector('[name="flags.sr5.backgroundCountAlignement"]')
    if (phenomenon) phenomenon.addEventListener("change", ev => {
      const preset = BACKGROUND_COUNT_PHENOMENA[ev.currentTarget.value]
      if (preset) {
        if (countField) countField.value = preset.value
        if (alignmentField) alignmentField.value = preset.alignment
      }
      this.updateMatrixNoise(this.element)
    })
    if (countField) countField.addEventListener("change", _ev => {
      this.updateMatrixNoise(this.element)
    })
    for (const button of this.element.querySelectorAll(".sr5-mana-shift-remove")) {
      button.addEventListener("click", ev => removeManaShift(this.document, ev.currentTarget.dataset.id))
    }
  }
}
