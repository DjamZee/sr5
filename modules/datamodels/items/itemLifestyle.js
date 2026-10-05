import {
  descriptionPartialModel 
} from './partial/description.js'
import {
  boughtOrSoldPartialModel 
} from './partial/boughtOrSold.js'
import {
  sr5ModsPartialModel 
} from '../common/mods.js'

export class sr5ItemLifestyleDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...boughtOrSoldPartialModel.defineSchema(),
      type: new fields.StringField({
        initial: ''
      }),
      level: new fields.StringField({
        initial: ''
      }),
      rent: new fields.SchemaField({
        duration: new fields.NumberField({
          initial: 0
        }),
        bought: new fields.BooleanField({
          initial: false
        }),
        // World time (seconds) the months paid in advance run out at (SR5 p. 377): duration counts down to it
        paidUntil: new fields.NumberField({
          initial: null, nullable: true
        }),
      }),
      streetAddress: new fields.StringField({
        initial: ''
      }),
      city: new fields.StringField({
        initial: ''
      }),
      country: new fields.StringField({
        initial: ''
      }),
      options: new fields.ArrayField(new fields.ObjectField()),
      comforts: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        max: new fields.NumberField({
          initial: 0
        }),
        gameEffects: new fields.StringField({
          initial: ''
        }),
      }),
      security: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        max: new fields.NumberField({
          initial: 0
        }),
        gameEffects: new fields.StringField({
          initial: ''
        }),
      }),
      neighborhood: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        max: new fields.NumberField({
          initial: 0
        }),
        zone: new fields.StringField({
          initial: ''
        }),
        gameEffects: new fields.StringField({
          initial: ''
        }),
      }),
      point: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema()
      }),
      linkedIdentity: new fields.StringField({
        initial: ''
      }),
    }
  }
}
