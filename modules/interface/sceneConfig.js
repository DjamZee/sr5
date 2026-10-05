import {
  SR5
} from "../config.js"
import {
  BACKGROUND_COUNT_PHENOMENA, phenomenonOptions, phenomenonNoise
} from "./background-count-phenomena.js"

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
    }
    return context
  }

  updateMatrixNoise(element) {
    //The form's values when it is open (not yet saved), the scene's otherwise
    const read = (name) => element.querySelector(`[name="flags.sr5.${name}"]`)?.value ?? this.document.flags.sr5?.[name]
    let matrixNoise = (parseInt(read("matrixSpam")) || 0) + (parseInt(read("matrixStatic")) || 0) +
      phenomenonNoise(read("backgroundCountPhenomenon"), read("backgroundCountValue"))
    const noiseField = element.querySelector('[name="sceneNoiseRating"]')
    if (noiseField) noiseField.value = matrixNoise
    this.document.setFlag("sr5", "matrixNoise", matrixNoise)
  }

  async _onRender(context, options) {
    await super._onRender(context, options)
    this.updateMatrixNoise(this.element)

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
  }
}
