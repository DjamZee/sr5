import {
  effectsPartialModel 
} from './partial/effects.js'

export class sr5ItemEffectDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...effectsPartialModel.defineSchema(),
      type: new fields.StringField({
        initial: ''
      }),
      gameEffect: new fields.HTMLField({
        initial: ''
      }),
      // The effect sheet has a description editor too (descriptionGameEffect-edit.hbs)
      description: new fields.HTMLField({
        initial: ''
      }),
      itemRating: new fields.StringField({
        initial: ''
      }),
      target: new fields.StringField({
        initial: ''
      }),
      duration: new fields.NumberField({
        initial: 1
      }),
      durationType: new fields.StringField({
        initial: ''
      }),
      // World time (seconds) a minute, hour, day, week or month effect began at: its end is counted from it
      startTime: new fields.NumberField({
        initial: null, nullable: true
      }),
      value: new fields.StringField({
        initial: ''
      }),
      ownerID: new fields.StringField({
        initial: ''
      }),
      ownerName: new fields.StringField({
        initial: ''
      }),
      ownerItem: new fields.StringField({
        initial: ''
      }),
      hasEffectOnItem: new fields.StringField({
        initial: 'false'
      }),
    }
  }
}
