import {
  descriptionPartialModel 
} from './partial/description.js'
import {
  effectsPartialModel 
} from './partial/effects.js'
import {
  activationPartialModel 
} from './partial/activation.js'
import {
  ratingPartialModel 
} from './partial/rating.js'
import {
  boughtOrSoldPartialModel 
} from './partial/boughtOrSold.js'
import {
  capacityPartialModel 
} from './partial/capacity.js'
import {
  sr5ModsPartialModel 
} from '../common/mods.js'

export class sr5ItemVehicleModDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...effectsPartialModel.defineSchema(),
      ...activationPartialModel.defineSchema(),
      ...ratingPartialModel.defineSchema(),
      ...boughtOrSoldPartialModel.defineSchema(),
      ...capacityPartialModel.defineSchema(),
      type: new fields.StringField({
        initial: ''
      }),
      tools: new fields.StringField({
        initial: ''
      }),
      skill: new fields.StringField({
        initial: ''
      }),
      slots: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        multiplier: new fields.StringField({
          initial: ''
        }),
      }),
      threshold: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema(),
        multiplier: new fields.StringField({
          initial: ''
        }),
      }),
      surname: new fields.StringField({
        initial: ''
      }),
      //Fitted at the factory: free, takes up neither slots nor points, its effect already in the profile (Rigger 5.0 p. 156, 191)
      isFactory: new fields.BooleanField({
        initial: false
      }),
      //What the system works out for it by code (system/vehicle-mods.js); empty: known by its name, or none
      effectKind: new fields.StringField({
        initial: ''
      }),
      isWeaponMounted: new fields.BooleanField({
        initial: false
      }),
      weaponMount: new fields.SchemaField({
        size: new fields.StringField({
          initial: ''
        }),
        visibility: new fields.StringField({
          initial: ''
        }),
        flexibility: new fields.StringField({
          initial: ''
        }),
        control: new fields.StringField({
          initial: ''
        }),
      }),
      weaponChoices: new fields.ArrayField(new fields.ObjectField()),
      mountedWeapon: new fields.StringField({
        initial: ''
      }),
      mountedWeaponName: new fields.StringField({
        initial: ''
      }),
      //A drone arm has its own Strength and Agility, 0 for the starting ones: Body and Pilot (Rigger 5.0 p. 129)
      droneArm: new fields.SchemaField({
        isDroneArm: new fields.BooleanField({
          initial: false
        }),
        strength: new fields.NumberField({
          initial: 0, integer: true, min: 0
        }),
        agility: new fields.NumberField({
          initial: 0, integer: true, min: 0
        }),
      }),
      secondaryPropulsion: new fields.SchemaField({
        isSecondaryPropulsion: new fields.BooleanField({
          initial: false
        }),
        type: new fields.StringField({
          initial: ''
        }),
      }),
      vehiclePriceMultiplier: new fields.SchemaField({
        acceleration: new fields.NumberField({
          initial: 0
        }),
        handling: new fields.NumberField({
          initial: 0
        }),
        speed: new fields.NumberField({
          initial: 0
        }),
        body: new fields.NumberField({
          initial: 0
        }),
        seating: new fields.NumberField({
          initial: 0
        }),
        vehicle: new fields.NumberField({
          initial: 0
        }),
      }),
    }
  }
}
