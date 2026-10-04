import {
  descriptionPartialModel
} from './partial/description.js'
import {
  storablePartialModel
} from './partial/storable.js'
import {
  boughtOrSoldPartialModel
} from './partial/boughtOrSold.js'

// A GM-authored toxin (SR5 p. 409-412), dropped on weapons, grenades and creature attacks
export class sr5ItemToxinDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    const flag = () => new fields.BooleanField({
      initial: false
    })
    return {
      ...descriptionPartialModel.defineSchema(),
      ...storablePartialModel.defineSchema(),
      ...boughtOrSoldPartialModel.defineSchema(),
      quantity: new fields.NumberField({
        initial: 1
      }),
      vector: new fields.SchemaField({
        contact: flag(),
        ingestion: flag(),
        inhalation: flag(),
        injection: flag(),
      }),
      //In combat turns, 0 = immediate
      speed: new fields.NumberField({
        initial: 0, integer: true, min: 0
      }),
      power: new fields.NumberField({
        initial: 0, integer: true, min: 0
      }),
      //Venom and Noxious Breath: Power = Magic of the creature (SR5 p. 403)
      powerFromMagic: flag(),
      penetration: new fields.NumberField({
        initial: 0, integer: true
      }),
      effect: new fields.SchemaField({
        disorientation: flag(),
        nausea: flag(),
        paralysis: flag(),
        agony: flag(),
        arcaneInhibitor: flag(),
      }),
      damageType: new fields.StringField({
        initial: ''
      }),
      //Shown as is on the chat card, never automated (truth serum, etc.)
      special: new fields.StringField({
        initial: ''
      }),
      //How long the toxin stays active once released
      inertia: new fields.StringField({
        initial: ''
      }),
    }
  }
}
