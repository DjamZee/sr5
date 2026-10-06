import {
  sr5ModsPartialModel 
} from '../../common/mods.js'

export class characterEssencePartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      essence: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        base: new fields.NumberField({
          initial: 6
        }),
        // Faille d'Essence (Chrome Flesh p. 74): the hole left at the last removal, and what the implants took then.
        // Written by the active gamemaster alone (system/essence-hole.js)
        holeAmount: new fields.NumberField({
          initial: 0, min: 0
        }),
        holeBase: new fields.NumberField({
          initial: 0, min: 0
        }),
      }),
    }
  }
}
