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
      // A storage of type "shop" is a vendor's stock (shop lot C): the actor carrying it
      // sells what is stored in it. Unused on every other kind of storage.
      shop: new fields.SchemaField({
        // The name over the counter; empty, the storage's own name
        label: new fields.StringField({
          initial: ''
        }),
        // Players may come in; the gamemasters always can
        isOpen: new fields.BooleanField({
          initial: false
        }),
        // Percent on the book price: the gamemaster's adjustment of SR5 p. 419
        margin: new fields.NumberField({
          initial: 0, integer: true, min: -100
        }),
        // Ceiling of the automatic restock; an item placed by hand goes past it
        maxAvailability: new fields.NumberField({
          initial: 12, integer: true, min: 0
        }),
        // Legalities the restock takes: 'legal', 'R' (restricted), 'F' (forbidden: Prohibé in French)
        legality: new fields.ArrayField(new fields.StringField(), {
          initial: ['legal', 'R']
        }),
        // Shelves of the shop window (SR5ShopCatalog.SHELVES) the restock fills
        shelves: new fields.ArrayField(new fields.StringField(), {
          initial: []
        }),
        perShelf: new fields.NumberField({
          initial: 10, integer: true, min: 0
        }),
        stackQuantity: new fields.NumberField({
          initial: 5, integer: true, min: 1
        }),
        // The credstick of the vendor the takings go on
        cashboxId: new fields.StringField({
          initial: ''
        }),
        // Items of its shelves it has not got, looked for on demand (SR5 p. 420)
        onOrder: new fields.BooleanField({
          initial: false
        }),
        // The gamemaster accepts or refuses each sale by hand
        approve: new fields.BooleanField({
          initial: false
        }),
        // Left for the vendor templates (lot C, part 2): banner 3:1, accent, portrait, template key
        banner: new fields.StringField({
          initial: ''
        }),
        accent: new fields.StringField({
          initial: ''
        }),
        portrait: new fields.StringField({
          initial: ''
        }),
        template: new fields.StringField({
          initial: ''
        }),
      }),
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
