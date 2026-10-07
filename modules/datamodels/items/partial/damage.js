import {
  sr5ModsPartialModel 
} from '../../common/mods.js'

export class damagePartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      damageValue: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        isStrengthBased: new fields.BooleanField({
          initial: false
        }),
        // Magic counted this many times in the DV: an engulf is Magic x 2 (SR5 p. 399), a spirit's Magic is its Force
        magicMultiplier: new fields.NumberField({
          initial: 0, integer: true, min: 0
        }),
      }),
      damageType: new fields.StringField({
        initial: ''
      }),
      damageElement: new fields.StringField({
        initial: ''
      }),
      damageElementSecond: new fields.StringField({
        initial: ''
      }),
      armorPenetration: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        // "strength" or "magic": the AP is lowered by that rating, as "PA -FOR" or "PA -Magie" (SR5 p. 399, Howling Shadows p. 138)
        linkedAttribute: new fields.StringField({
          initial: '', blank: true
        }),
      }),
      accuracy: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        isPhysicalLimitBased: new fields.BooleanField({
          initial: false
        }),
      }),
    }
  }
}
