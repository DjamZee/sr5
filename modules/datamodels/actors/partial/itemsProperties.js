import {
  sr5ModsPartialModel 
} from '../../common/mods.js'
import {
  MARTIAL_ARTS_LOCATIONS, martialArtsLocationKey
} from '../../../rolls/roll-helpers/martialArtsLocation.js'
import {
  CALLED_SHOT_ITEM_KEYS
} from '../../../system/effect-editor.js'

export class itemsPropertiesPartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      itemsProperties: new fields.SchemaField({
        weapon: new fields.SchemaField({
          damageValue: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          accuracy: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
        }),
        armor: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          specialDamage: new fields.SchemaField({
            acid: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            water: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            electricity: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            fire: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            cold: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            pollution: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            radiation: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            toxin: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            sound: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          toxin: new fields.SchemaField({
            contact: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            ingestion: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            inhalation: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
            injection: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          padded: new fields.BooleanField({
            initial: false
          }),
        }),
        environmentalMod: new fields.SchemaField({
          visibility: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          light: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          glare: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          wind: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          range: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
        }),
        martialArts: new fields.SchemaField({
          breakWeapon: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          disarm: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          entanglement: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          feint: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          pin: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          reversal: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          knockdown: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          shakeUp: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          blastOutOfHand: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          dirtyTrick: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          vitals: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          counterGrapple: new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          }),
          //Run & Gun p. 149 (Dim Mak), p. 148 (Choquer), p. 151 (Randori): a technique lowers the penalty of one location
          ...Object.fromEntries(MARTIAL_ARTS_LOCATIONS.map(location => [martialArtsLocationKey(location), new fields.SchemaField({
            isActive: new fields.BooleanField({
              initial: false
            }),
            modifier: new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            }),
          })])),
        }),
        //Called shots any item can ease (system/effect-editor.js): how much their penalty is lowered
        calledShots: new fields.SchemaField(Object.fromEntries(CALLED_SHOT_ITEM_KEYS.map(key => [key, new fields.SchemaField({
          modifier: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
        })]))),
      }),
    }
  }
}
