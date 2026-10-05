import {
  sr5ModsPartialModel 
} from '../../common/mods.js'

export class magicPartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields


    const dicePoolSchema = () => {
      return {
        dicePool: new fields.NumberField({
          initial: 0
        }),
        base: new fields.NumberField({
          initial: 0
        }),
        modifiers: new fields.ArrayField(new fields.ObjectField()),
      }
    }

    return {
      magic: new fields.SchemaField({
        magicType: new fields.StringField({
          initial: ''
        }),
        tradition: new fields.StringField({
          initial: ''
        }),
        concentration: new fields.BooleanField({
          initial: false
        }),
        elements: new fields.SchemaField({
          combat: new fields.StringField({
            initial: ''
          }),
          detection: new fields.StringField({
            initial: ''
          }),
          illusion: new fields.StringField({
            initial: ''
          }),
          manipulation: new fields.StringField({
            initial: ''
          }),
          health: new fields.StringField({
            initial: ''
          }),
        }),
        astralDamage: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        astralDefense: new fields.SchemaField({
          ...dicePoolSchema()
        }),
        astralTracking: new fields.SchemaField({
          ...dicePoolSchema()
        }),
        passThroughBarrier: new fields.SchemaField({
          ...dicePoolSchema()
        }),
        initiationGrade: new fields.NumberField({
          initial: 0
        }),
        powerPoints: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          maximum: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
        }),
        drainResistance: new fields.SchemaField({
          dicePool: new fields.NumberField({
            initial: 0
          }),
          base: new fields.NumberField({
            initial: 0
          }),
          modifiers: new fields.ArrayField(new fields.ObjectField()),
          linkedAttribute: new fields.StringField({
            initial: ''
          }),
        }),
        possession: new fields.BooleanField({
          initial: false
        }),
        // Mask of the mentor (Forbidden Arcana p. 176): set while preparing the actor, read by the Drain roll
        mentorMask: new fields.BooleanField({
          initial: false
        }),
        hasAstralProjection: new fields.BooleanField({
          initial: false
        }),
        counterSpellPool: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          current: new fields.NumberField({
            initial: 0
          }),
        }),
        reagents: new fields.NumberField({
          initial: 0
        }),
        reagentsRefined: new fields.NumberField({
          initial: 0
        }),
        reagentsRadical: new fields.NumberField({
          initial: 0
        }),
        orichalcum: new fields.NumberField({
          initial: 0
        }),
        boundedSpirit: new fields.SchemaField({
          current: new fields.NumberField({
            initial: 0
          }),
          max: new fields.NumberField({
            initial: 0
          }),
        }),
        spellList: new fields.ObjectField(),
        metamagics: new fields.SchemaField({
          centering: new fields.BooleanField({
            initial: false
          }),
          centeringValue: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          quickening: new fields.BooleanField({
            initial: false
          }),
          shielding: new fields.BooleanField({
            initial: false
          }),
          spellShaping: new fields.BooleanField({
            initial: false
          }),
          // Forbidden Arcana p. 43, 45
          structuredSpellcasting: new fields.BooleanField({
            initial: false
          }),
          harmoniousDefense: new fields.BooleanField({
            initial: false
          }),
          spellShapingValue: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
        }),
        // Magical masteries (Forbidden Arcana p. 30-41): level = quality rating
        masteries: new fields.SchemaField(Object.fromEntries(
          ["archivist", "arcaneBodyguard", "conjuringSpecialist", "deathSower", "illusionist", "mageHunter", "masterManipulator"]
            .map(key => [key, new fields.SchemaField({
              ...sr5ModsPartialModel.defineSchema()
            })])
        )),
        bgCount: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema()
        }),
        // Better Than Bad p. 140-141: the highest grey mana rating worn, and whether it is the armor's
        greyMana: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          fromArmor: new fields.BooleanField({
            initial: false
          }),
        }),
      }),
    }
  }
}
