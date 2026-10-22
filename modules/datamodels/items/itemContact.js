import {
  sidekickPartialModel 
} from './partial/sidekick.js'
import {
  descriptionPartialModel 
} from './partial/description.js'
import {
  characterAttributesPartialModel 
} from '../actors/partial/attributes.js'
import {
  characterMagicAttributesPartialModel 
} from '../actors/partial/magicAttributes.js'
import {
  skillGroupsPartialModel 
} from '../actors/partial/skillGroups.js'
import {
  skillsPartialModel 
} from '../actors/partial/skills.js'
import {
  sheetPreferencesPartialModel 
} from '../actors/partial/sheetPreferences.js'
import {
  sr5ModsPartialModel 
} from '../common/mods.js'

export class sr5ItemContactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...sidekickPartialModel.defineSchema(),
      ...characterAttributesPartialModel.defineSchema(),
      ...characterMagicAttributesPartialModel.defineSchema(),
      ...skillGroupsPartialModel.defineSchema(),
      ...skillsPartialModel.defineSchema(),
      ...sheetPreferencesPartialModel.defineSchema(),
      connection: new fields.NumberField({
        initial: 0
      }),
      loyalty: new fields.NumberField({
        initial: 0
      }),
      metatype: new fields.StringField({
        initial: ''
      }),
      gender: new fields.StringField({
        initial: ''
      }),
      age: new fields.StringField({
        initial: ''
      }),
      type: new fields.StringField({
        initial: ''
      }),
      paymentMethod: new fields.StringField({
        initial: ''
      }),
      hobby: new fields.StringField({
        initial: ''
      }),
      familySituation: new fields.StringField({
        initial: ''
      }),
      nickname: new fields.StringField({
        initial: ''
      }),
      metatypeVariant: new fields.StringField({
        initial: ''
      }),
      ethnicalGroup: new fields.StringField({
        initial: ''
      }),
      nationality: new fields.StringField({
        initial: ''
      }),
      language: new fields.ArrayField(new fields.ObjectField()),
      knowledge: new fields.ArrayField(new fields.ObjectField()),
      weapons: new fields.ArrayField(new fields.ObjectField()),
      ammunitions: new fields.ArrayField(new fields.ObjectField()),
      armors: new fields.ArrayField(new fields.ObjectField()),
      decks: new fields.ArrayField(new fields.ObjectField()),
      vehicles: new fields.ArrayField(new fields.ObjectField()),
      conditionMonitors: new fields.SchemaField({
        condition: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          actual: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          boxes: new fields.ArrayField(new fields.ObjectField()),
        }),
        edge: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          actual: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          boxes: new fields.ArrayField(new fields.ObjectField()),
        }),
      }),
      isCreated: new fields.BooleanField({
        initial: false
      }),
      // The commcode the gamemaster answers on for a contact played without a sheet (SR5 p. 241, API pour CONTACTS):
      // given at the first call (game.sr5.contacts.commcodeOf), written by hand too
      commcode: new fields.StringField({
        initial: ''
      }),
      // The chips between the character and the contact (Run Faster p. 170-172, favor-rules.js):
      // > 0 the contact owes the character, < 0 the character owes the contact
      favors: new fields.SchemaField({
        chips: new fields.NumberField({
          initial: 0, integer: true
        }),
        relation: new fields.StringField({
          initial: ''
        }),
        intimidated: new fields.BooleanField({
          initial: false
        }),
        log: new fields.ArrayField(new fields.ObjectField()),
      }),
    }
  }
}
