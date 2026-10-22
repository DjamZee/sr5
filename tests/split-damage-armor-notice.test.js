import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// Romane: takeSplitDamage read this.itemsProperties, which the actor does not have (it is this.system.itemsProperties).
// A splitting hit whose physical half the armor took: the stun went on, then a TypeError, and no "the armor absorbs".
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')

const saved = {
  info: globalThis.ui.notifications.info, format: globalThis.game.i18n.format
}
afterEach(() => {
  globalThis.ui.notifications.info = saved.info
  globalThis.game.i18n.format = saved.format
})

describe('takeSplitDamage', () => {
  it('tells the armor took the physical half, read on the actor\'s system', async () => {
    const info = vi.fn()
    globalThis.ui.notifications.info = info
    globalThis.game.i18n.format = (key, data) => `${key} ${JSON.stringify(data)}`
    const actor = {
      takeDamage: vi.fn(), system: {
        itemsProperties: {
          armor: {
            value: 9
          }
        }
      }
    }
    await SR5Actor.prototype.takeSplitDamage.call(actor, {
      damage: {
        value: 8, splittedOne: 4, splittedTwo: 0
      }, combat: {
        situationalArmor: 2, armorPenetration: -1
      }
    })
    expect(actor.takeDamage).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('SR5.INFO_ArmorGreaterThanDVSoNoDamage {"armor":10,"damage":8}')
  })
})
