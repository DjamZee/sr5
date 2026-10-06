/**
 * A lock on a storage (SR5 p. 365-366): a mechanical lock or a maglock, its
 * rating, an anti-tamper system, and whether it is shut. Shared by the
 * storage item and the storage put down on the map.
 */
export class lockablePartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      lock: new fields.SchemaField({
        // "", "mechanical" or "maglock"
        type: new fields.StringField({
          initial: ''
        }),
        rating: new fields.NumberField({
          initial: 4, integer: true, min: 1, max: 6
        }),
        // A wireless maglock can be hacked as well as picked (SR5 p. 239-240)
        wireless: new fields.BooleanField({
          initial: false
        }),
        // Anti-tamper system, rating 1-4, 0 for none (SR5 p. 365)
        antiTamper: new fields.NumberField({
          initial: 0, integer: true, min: 0, max: 4
        }),
        locked: new fields.BooleanField({
          initial: false
        }),
      }),
    }
  }
}
