import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  default: matrixDefense
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixDefense.js')
const {
  SR5_UtilityItem
} = await import('../modules/entities/items/utilityItem.js')

// GM ruling (05/10): a slaved vehicle is an icon that can be attacked. SR5 p. 266: its Device Rating is its Pilot
// rating, a car's as well as a drone's
describe('Matrix defense of a vehicle', () => {
  beforeEach(() => {
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }
    }
  })

  function vehicle(type, pilot) {
    const system = {
      type, attributes: {
        pilot
      }, vehiclesMod: [], price: {
        value: 0, base: 0, modifiers: []
      }
    }
    SR5_UtilityItem._handleVehicle(system)
    return {
      name: 'Véhicule', system
    }
  }

  async function defensePool(item) {
    globalThis.fromUuid = vi.fn(async () => item)
    const actor = {
      type: 'actorPc', system: {
        matrix: {
          actions: {
            dataSpike: {
              defense: {
                modifiers: [], dicePool: 6
              }
            }
          }
        }
      }
    }
    const rollData = {
      test: {
      }, dicePool: {
        modifiers: []
      }, target: {
      }, combat: {
        activeDefenses: {
        }
      }, matrix: {
      }, previousMessage: {
      }
    }
    const chatData = {
      roll: {
        hits: 3
      }, target: {
        itemUuid: 'Actor.a.Item.car'
      }, matrix: {
      }, owner: {
      }, previousMessage: {
      }
    }
    return (await matrixDefense(rollData, 'dataSpike', actor, chatData)).dicePool.base
  }

  it('a car defends with twice its Pilot rating', async () => {
    expect(await defensePool(vehicle('car', 4))).toBe(8)
  })

  it('a drone too', async () => {
    expect(await defensePool(vehicle('drone', 3))).toBe(6)
  })
})