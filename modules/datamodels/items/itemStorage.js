import {
  sidekickPartialModel 
} from './partial/sidekick.js'
import {
  descriptionPartialModel 
} from './partial/description.js'
import {
  boughtOrSoldPartialModel 
} from './partial/boughtOrSold.js'
import {
  lockablePartialModel
} from './partial/lockable.js'
import {
  defaultLockFor
} from '../../interface/storage-lock.js'

export class sr5ItemStorageDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields
    return {
      ...descriptionPartialModel.defineSchema(),
      ...sidekickPartialModel.defineSchema(),
      ...boughtOrSoldPartialModel.defineSchema(),
      // Kind of storage: stash, safe, backpack, garage...
      type: new fields.StringField({
        initial: ''
      }),
      // How many items fit in. 0 means no limit.
      capacity: new fields.SchemaField({
        value: new fields.NumberField({
          initial: 0
        }),
        used: new fields.NumberField({
          initial: 0
        }),
      }),
      // A garage holds a single vehicle of a given kind (Run Faster p. 216)
      vehicleType: new fields.StringField({
        initial: ''
      }),
      // Lifestyle this storage belongs to, if any
      linkedLifestyle: new fields.StringField({
        initial: ''
      }),
      // Can be dropped on the canvas as its own actor
      isDeployable: new fields.BooleanField({
        initial: false
      }),
      isDeployed: new fields.BooleanField({
        initial: false
      }),
      deployedActorId: new fields.StringField({
        initial: ''
      }),
      streetAddress: new fields.StringField({
        initial: ''
      }),
      city: new fields.StringField({
        initial: ''
      }),
      country: new fields.StringField({
        initial: ''
      }),
      ...lockablePartialModel.defineSchema(),
    }
  }

  /** A safe comes with its maglock the first time it becomes a safe. */
  static #withDefaultLock(type, lock, changes) {
    if (lock?.type) return
    const fresh = defaultLockFor(type)
    if (fresh) foundry.utils.mergeObject(changes, {
      system: {
        lock: fresh
      }
    })
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false
    const changes = {
    }
    sr5ItemStorageDataModel.#withDefaultLock(data.system?.type ?? this.type, data.system?.lock ?? this.lock, changes)
    if (changes.system) this.parent.updateSource(changes)
  }

  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false
    const type = changes.system?.type
    if (type && type !== this.type) sr5ItemStorageDataModel.#withDefaultLock(type, this.lock, changes)
  }
}
