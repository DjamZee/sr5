import {
  descriptionPartialModel 
} from './partial/description.js'
import {
  storablePartialModel 
} from './partial/storable.js'
import {
  boughtOrSoldPartialModel 
} from './partial/boughtOrSold.js'
import {
  activationPartialModel 
} from './partial/activation.js'
import {
  effectsPartialModel 
} from './partial/effects.js'
import {
  migrateDrugSource
} from '../../entities/items/drug-phase.js'

export class sr5ItemDrugDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...storablePartialModel.defineSchema(),
      ...boughtOrSoldPartialModel.defineSchema(),
      ...activationPartialModel.defineSchema(),
      ...effectsPartialModel.defineSchema(),
      quantity: new fields.NumberField({
        initial: 1
      }),
      vector: new fields.SchemaField({
        contact: new fields.BooleanField({
          initial: false
        }),
        ingestion: new fields.BooleanField({
          initial: false
        }),
        inhalation: new fields.BooleanField({
          initial: false
        }),
        injection: new fields.BooleanField({
          initial: false
        }),
        value: new fields.ArrayField(new fields.StringField()),
      }),
      speed: new fields.StringField({
        initial: ''
      }),
      duration: new fields.StringField({
        initial: ''
      }),
      //Street, standard, pharmaceutical or custom (Chrome Flesh p. 194): it changes the crash duration
      quality: new fields.StringField({
        initial: 'standard'
      }),
      addiction: new fields.SchemaField({
        type: new fields.StringField({
          initial: ''
        }),
        rating: new fields.NumberField({
          initial: 0
        }),
        threshold: new fields.NumberField({
          initial: 0
        }),
      }),
      onUse: new fields.SchemaField({
        duration: new fields.StringField({
          initial: ''
        }),
        contrecoup: new fields.StringField({
          initial: ''
        }),
      }),
      interact: new fields.BooleanField({
        initial: false
      }),
      //The drug stat (duration, speed, crash) is an object: an ArrayField kept only its integer keys, so none
      handleShot: new fields.ObjectField(),
      wirelessTurnedOn: new fields.BooleanField({
        initial: false
      }),
      //"", "rise" or "crash" (entities/items/drug-phase.js): isActive and wirelessTurnedOn follow it
      phase: new fields.StringField({
        initial: ''
      }),
    }
  }

  static migrateData(source) {
    //Stored by the former ArrayField: always an empty list, since it dropped every key of the stat
    if (Array.isArray(source.handleShot)) source.handleShot = {
    }
    //The crash was the "wireless" box of an effect, and the wireless switch of the drug
    migrateDrugSource(source)
    return super.migrateData(source)
  }
}
