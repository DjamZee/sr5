import {
  sr5ModsPartialModel 
} from '../../common/mods.js'

export class specialPropertiesPartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      specialProperties: new fields.SchemaField({
        smartlink: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Dice on every addiction test (Chrome Flesh p. 58-59, The Complete Trog p. 180)
        addictionResistance: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Dice on every toxin resistance, whatever the vector (The Complete Trog p. 180)
        toxinResistance: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Added to the Karma divisor of Street Cred (Assassin's Primer p. 15, Consummate Professional: 10 more, so Karma / 20)
        streetCredDivisor: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Added to the threshold of every test that has one (Bliss SR5 p. 412, Purple Orchid Chrome Flesh p. 190)
        thresholdModifier: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        concentration: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        controlRig: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        damageReduction: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Antitoxin nanoware (Chrome Flesh p. 154): its rating comes from the implant's custom effect
        antitoxin: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Immunity to a toxin vector (SR5 p. 409-410 and 439): gas mask (inhalation), chemical seal (contact and inhalation)
        toxinImmunityContact: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        toxinImmunityInhalation: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Levels taken off a radiation zone (Antirad, Chrome Flesh p. 151; Radiation tolerance, p. 170), added up
        antirad: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        hardenedArmors: new fields.SchemaField({
          normalWeapon: new fields.SchemaField({
            type: new fields.StringField({
              initial: ''
            }),
            ...sr5ModsPartialModel.defineSchema(),
          }),
          astral: new fields.SchemaField({
            type: new fields.StringField({
              initial: ''
            }),
            ...sr5ModsPartialModel.defineSchema(),
          }),
          cold: new fields.SchemaField({
            type: new fields.StringField({
              initial: ''
            }),
            ...sr5ModsPartialModel.defineSchema(),
          }),
          fire: new fields.SchemaField({
            type: new fields.StringField({
              initial: ''
            }),
            ...sr5ModsPartialModel.defineSchema(),
          }),
          toxins: new fields.SchemaField({
            type: new fields.StringField({
              initial: ''
            }),
            ...sr5ModsPartialModel.defineSchema(),
          }),
          pathogens: new fields.SchemaField({
            type: new fields.StringField({
              initial: ''
            }),
            ...sr5ModsPartialModel.defineSchema(),
          }),
        }),
        // Aim for Perfection (Assassin's Primer p. 15): Called Shot modifiers halved
        calledShotHalved: new fields.BooleanField({
          initial: false
        }),
        doublePenalties: new fields.BooleanField({
          initial: false
        }),
        energyAura: new fields.StringField({
          initial: ''
        }),
        regeneration: new fields.BooleanField({
          initial: false
        }),
        // Head case advantage (Stolen Souls p. 201): Nanite Volume added to toxin and disease resistances
        naniteToxinResistance: new fields.BooleanField({
          initial: false
        }),
        // Immunodeficiency (SR5 p. 83): the Power of any disease is +2 for every resistance test
        immunodeficiency: new fields.BooleanField({
          initial: false
        }),
        essenceDrain: new fields.BooleanField({
          initial: false
        }),
        anticoagulant: new fields.BooleanField({
          initial: false
        }),
        // Aggravated Wounds critter power (Howling Shadows p. 213)
        aggravatedWounds: new fields.BooleanField({
          initial: false
        }),
        fullDefenseAttribute: new fields.StringField({
          initial: 'willpower'
        }),
        fullDefenseValue: new fields.NumberField({
          initial: 0
        }),
        actions: new fields.SchemaField({
          free: new fields.SchemaField({
            value: new fields.NumberField({
              initial: 1
            }),
            base: new fields.NumberField({
              initial: 1
            }),
            modifiers: new fields.ArrayField(new fields.ObjectField()),
            current: new fields.NumberField({
              initial: 1
            }),
          }),
          simple: new fields.SchemaField({
            value: new fields.NumberField({
              initial: 2
            }),
            base: new fields.NumberField({
              initial: 2
            }),
            modifiers: new fields.ArrayField(new fields.ObjectField()),
            current: new fields.NumberField({
              initial: 2
            }),
          }),
          complex: new fields.SchemaField({
            value: new fields.NumberField({
              initial: 1
            }),
            base: new fields.NumberField({
              initial: 1
            }),
            modifiers: new fields.ArrayField(new fields.ObjectField()),
            current: new fields.NumberField({
              initial: 1
            }),
          }),
          interruption: new fields.SchemaField({
            value: new fields.NumberField({
              initial: 10
            }),
            base: new fields.NumberField({
              initial: 10
            }),
            modifiers: new fields.ArrayField(new fields.ObjectField()),
            current: new fields.NumberField({
              initial: 10
            }),
          }),
        }),
      }),
    }
  }
}
