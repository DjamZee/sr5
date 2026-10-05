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
        initial: 0, integer: true, max: 0
      }),
      effect: new fields.SchemaField({
        disorientation: flag(),
        nausea: flag(),
        paralysis: flag(),
        agony: flag(),
        arcaneInhibitor: flag(),
        manasphereCut: flag(),
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
      //A disease is a toxin that comes back (Run Faster p. 111-112): its Speed is an interval, with a least
      //number of resistance tests; the effects below come from Bullets & Bandages p. 21
      pathogen: new fields.SchemaField({
        isPathogen: flag(),
        interval: new fields.SchemaField({
          value: new fields.NumberField({
            initial: 1, integer: true, min: 1
          }),
          unit: new fields.StringField({
            initial: 'day'
          }),
        }),
        minTests: new fields.NumberField({
          initial: 1, integer: true, min: 1
        }),
        //Dice off the first test of a willing subject (Cypher)
        volunteerPenalty: new fields.NumberField({
          initial: 0, integer: true, min: 0
        }),
        nature: new fields.StringField({
          initial: ''
        }),
        effect: new fields.SchemaField({
          reducedAttributes: flag(),
          essenceLoss: flag(),
          memoryLoss: flag(),
        }),
        //Written on the GM's card, never applied (transformation, death)
        finalEffect: new fields.StringField({
          initial: ''
        }),
      }),
    }
  }
}
