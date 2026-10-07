import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// The gamemaster fits a mod on a vehicle item that is not deployed (workshop, lot R9). The item keeps its mods as raw
// data, whose slots.value is 0 until an actor prepares them: the workshop's gauge counted nothing (found by Honorine)
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async () => {}, emitForPlayer: async () => {}
  }
}))
vi.mock('../modules/entities/items/utilityItem.js', () => ({
  SR5_UtilityItem: {
    _handleItemPrice: system => {
      system.price.value = system.price.base * system.vehiclePriceMultiplier.body
    }
  }
}))

const {
  dropModOnWorkshop, workshopContext
} = await import('../modules/system/vehicle-workshop-apply.js')

// A prepared item: the slots multiplied by the rating, as the actor preparation does
class PreparedItem {
  constructor(data) {
    this.img = data.img ?? 'systems/sr5/assets/img/items/itemVehicleMod.svg'
    this.system = structuredClone(data.system)
    this.system.slots.value = this.system.slots.base * (this.system.itemRating || 1)
  }
}

const armor = {
  name: 'Blindage (standard)', type: 'itemVehicleMod', uuid: 'Compendium.x.Item.armor', parent: null,
  system: {
    type: 'protection', itemRating: 1, slots: {
      base: 2, value: 0, multiplier: 'rating'
    }, price: {
      base: 500, value: 0
    }, threshold: {
      value: 4
    }
  },
  toObject() {
    return structuredClone({
      _id: 'x', name: this.name, type: this.type, system: this.system
    })
  },
}

let vehicle
beforeEach(() => {
  globalThis.CONFIG.Item = {
    documentClass: PreparedItem
  }
  globalThis.fromUuid = async uuid => uuid === armor.uuid ? armor : null
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.game.user = {
    id: 'gm', isGM: true
  }
  globalThis.game.i18n = {
    format: k => k, localize: k => k
  }
  globalThis.foundry.utils.randomID = () => 'newmod'
  globalThis.foundry.applications = {
    api: {
      DialogV2: {
        wait: async () => 'fit'
      }
    }
  }
  vehicle = {
    documentName: 'Item', type: 'itemVehicle', name: 'Doberman', uuid: 'Item.doberman', isOwner: true, parent: null,
    img: 'icons/svg/mystery-man.svg',
    system: {
      type: 'drone', category: 'mediumDrone', seating: 0, vehiclesMod: [], price: {
        base: 5000
      },
      attributes: {
        body: 4, acceleration: 1, handling: 3, speed: 3
      },
    },
    update: vi.fn(async changes => {
      vehicle.system.vehiclesMod = changes['system.vehiclesMod']
    }),
  }
})

describe("the gamemaster's direct fitting on a vehicle item", () => {
  it('stores the prepared slots, and the gauge counts them', async () => {
    await dropModOnWorkshop(vehicle, {
      type: 'Item', uuid: armor.uuid
    })
    const [mod] = vehicle.system.vehiclesMod
    expect(mod).toMatchObject({
      _id: 'newmod', name: 'Blindage (standard)', system: {
        isActive: true, slots: {
          base: 2, value: 2
        }, price: {
          value: 2000
        }
      }
    })
    expect(workshopContext(vehicle).gauges.find(g => g.key === 'protection')).toMatchObject({
      used: 2, total: 4
    })
  })
})
