import {
  descriptionPartialModel
} from './partial/description.js'
import {
  effectsPartialModel
} from './partial/effects.js'

// Mentor spirit (SR5 p. 76, 323-324; Forbidden Arcana p. 90-95, 176). Its effects carry a mentorPath tag
// (all / magician / adept / drawback), read by applyCustomEffects through mentor-spirits.js.
export class sr5ItemMentorSpiritDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...effectsPartialModel.defineSchema(),
      // SR5 p. 76: the Mentor Spirit quality costs 5 Karma
      karmaCost: new fields.NumberField({
        initial: 5
      }),
      // SR5 p. 324: a mystic adept picks the Magician or the Adept block, once and for all
      mysticPath: new fields.StringField({
        initial: '', blank: true, choices: ["", "magician", "adept"]
      }),
      drawback: new fields.HTMLField({
        initial: ''
      }),
      // SR5 p. 325: Charisma + Willpower test to resist the drawback; a few mentors use others (Street Grimoire
      // p. 200-201: Chaos and Oracle Willpower + Intuition, Peacemaker Charisma + Intuition)
      resistAttributes: new fields.SchemaField({
        first: new fields.StringField({
          initial: "charisma"
        }),
        second: new fields.StringField({
          initial: "willpower"
        }),
      }),
      resistThreshold: new fields.NumberField({
        initial: 3
      }),
      // Power Points given to adepts by the Adept block
      freePowerPoints: new fields.NumberField({
        initial: 0
      }),
      // Mask of the mentor (Forbidden Arcana p. 176), read only with the mentorMask world setting
      mask: new fields.BooleanField({
        initial: false
      }),
    }
  }
}
