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

export class sr5ItemQualityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...effectsPartialModel.defineSchema(),
      ...activationPartialModel.defineSchema(),
      ...ratingPartialModel.defineSchema(),
      type: new fields.StringField({
        initial: ''
      }),
      karmaCost: new fields.NumberField({
        initial: 0
      }),
      // The Mentor Spirit quality (SR5 p. 76) designates the actor's itemMentorSpirit that carries the bonuses
      linkedMentor: new fields.StringField({
        initial: "", blank: true
      }),
      // Illusionist (Forbidden Arcana p. 37): the spell type, Physical or Mana, chosen for this level
      masteryOption: new fields.StringField({
        initial: "", blank: true
      }),
      // Prototype de transhumain (Chrome Flesh p. 57): the Essence of bioware it gives, the gamemaster's alone
      transhumanEssence: new fields.NumberField({
        initial: 1, min: 0
      }),
    }
  }
}
