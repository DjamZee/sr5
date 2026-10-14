import {
  descriptionPartialModel
} from './partial/description.js'

// A file of the Matrix (SR5 p. 228, 237, 240, 242-243), carried by an actor: a host's files, or what a persona or a
// device stores. A file has no rating of its own: it defends with its owner's (SR5 p. 228), and it has no condition
// monitor (SR5 p. 230). What the book gives it: a protection and its rating (Edit File, p. 240), at most one data bomb
// (Set Data Bomb, p. 243), the date of its last edit (Matrix Perception, p. 237), and marks, as any icon (p. 237).
// The data the module Matrice v1 reads (lot MF) are described in the wiki page "Fichiers".
export class sr5ItemFileDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      // What the file holds, written by the gamemaster
      content: new fields.HTMLField({
        initial: ''
      }),
      // 0: not protected
      protection: new fields.NumberField({
        initial: 0, integer: true, min: 0, nullable: false
      }),
      // rating 0: no bomb. setBy: the id of the actor who set it (an unlinked token's id), who knows its password
      dataBomb: new fields.SchemaField({
        rating: new fields.NumberField({
          initial: 0, integer: true, min: 0, nullable: false
        }),
        destroysFile: new fields.BooleanField({
          initial: false
        }),
        setBy: new fields.StringField({
          initial: ''
        }),
        setByName: new fields.StringField({
          initial: ''
        }),
      }),
      // worldTime: game.time.worldTime of the last edit, null when nobody edited it in play
      lastEdit: new fields.SchemaField({
        worldTime: new fields.NumberField({
          initial: null, nullable: true
        }),
        by: new fields.StringField({
          initial: ''
        }),
        byName: new fields.StringField({
          initial: ''
        }),
      }),
      // The key cipher of its content (lot 39, a house rule: world setting sr5CommcodeCipher). key: the cipher's, set by
      // the gamemaster or the owner; known: the key its holder's player typed, that opens it when it is the same
      cipher: new fields.SchemaField({
        key: new fields.StringField({
          initial: ''
        }),
        known: new fields.StringField({
          initial: ''
        }),
      }),
      // The marks placed on it, as on a device: [{ownerId, value, ownerName, watchdog}]
      marks: new fields.ArrayField(new fields.ObjectField()),
    }
  }
}
