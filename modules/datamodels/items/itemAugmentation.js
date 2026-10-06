import {
  descriptionPartialModel 
} from './partial/description.js'
import {
  storablePartialModel 
} from './partial/storable.js'
import {
  effectsPartialModel 
} from './partial/effects.js'
import {
  boughtOrSoldPartialModel 
} from './partial/boughtOrSold.js'
import {
  activationPartialModel 
} from './partial/activation.js'
import {
  ratingPartialModel 
} from './partial/rating.js'
import {
  wirelessPartialModel 
} from './partial/wireless.js'
import {
  capacityPartialModel 
} from './partial/capacity.js'
import {
  sr5ModsPartialModel 
} from '../common/mods.js'

export class sr5ItemAugmentationDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...storablePartialModel.defineSchema(),
      ...effectsPartialModel.defineSchema(),
      ...boughtOrSoldPartialModel.defineSchema(),
      ...activationPartialModel.defineSchema(),
      ...ratingPartialModel.defineSchema(),
      ...wirelessPartialModel.defineSchema(),
      ...capacityPartialModel.defineSchema(),
      type: new fields.StringField({
        initial: ''
      }),
      category: new fields.StringField({
        initial: ''
      }),
      grade: new fields.StringField({
        initial: 'standard'
      }),
      isPlugged: new fields.BooleanField({
        initial: false
      }),
      // Chrome Flesh: posé sous Adapsine (p. 165), part of a lot d'augmentations (p. 96), bioware given by
      // Prototype de transhumain (p. 57). The gamemaster's alone once installed (entityItem.js, GM_ONLY_IMPLANT_FIELDS)
      underAdapsine: new fields.BooleanField({
        initial: false
      }),
      augmentationBundle: new fields.BooleanField({
        initial: false
      }),
      transhumanGift: new fields.BooleanField({
        initial: false
      }),
      essenceCost: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        multiplier: new fields.StringField({
          initial: ''
        }),
      }),
      accessory: new fields.ArrayField(new fields.ObjectField()),
      cyberlimbs: new fields.SchemaField({
        agility: new fields.SchemaField({
          value: new fields.NumberField({
            initial: 0
          }),
          base: new fields.NumberField({
            initial: 3
          }),
          customization: new fields.NumberField({
            initial: 0
          }),
        }),
        strength: new fields.SchemaField({
          value: new fields.NumberField({
            initial: 0
          }),
          base: new fields.NumberField({
            initial: 3
          }),
          customization: new fields.NumberField({
            initial: 0
          }),
        }),
        isCustom: new fields.BooleanField({
          initial: false
        }),
        enhancement: new fields.ArrayField(new fields.ObjectField()),
      }),
    }
  }
}
