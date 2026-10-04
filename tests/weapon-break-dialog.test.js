import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  weaponBreakChoices
} = await import('../modules/rolls/roll-helpers/thirdparty.js')
const {
  default: resistanceResultInfo
} = await import('../modules/rolls/roll-test-case/test-ResistanceResult.js')

// SR5 p. 197: a melee weapon that hits a barrier may break. The dialog offered no weapon (selectOptions
// reads valueAttr as a key of each choice, 'this.uuid' matched nothing), so the uuid sent was "" and the
// result card crashed on fromUuid("") as soon as the DV reached the Structure.
describe('Weapon break', () => {
  it('offers the active weapons as {uuid, name} read by the select', () => {
    const actor = {
      items: [
        {
          type: "itemWeapon", uuid: "Actor.a.Item.k", name: "Katana", system: {
            isActive: true
          }
        },
        {
          type: "itemWeapon", uuid: "Actor.a.Item.c", name: "Club", system: {
            isActive: false
          }
        },
        {
          type: "itemGear", uuid: "Actor.a.Item.g", name: "Rope", system: {
            isActive: true
          }
        },
      ]
    }
    expect(weaponBreakChoices(actor)).toEqual([{
      uuid: "Actor.a.Item.k", name: "Katana"
    }])
    const hbs = readFileSync(new URL('../templates/interface/chooseWeaponMaterial.hbs', import.meta.url), 'utf8')
    expect(hbs).toMatch(/selectOptions weaponList[^}]*valueAttr='uuid'[^}]*labelAttr='name'/)
  })

  it('does not crash when the DV reaches the Structure and no weapon resolves', async () => {
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }, messages: {
        get: () => undefined
      }
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
    globalThis.fromUuid = vi.fn(async () => null)
    const cardData = {
      previousMessage: {
        hits: 6
      }, roll: {
        hits: 1
      }, damage: {
        value: 6
      }, combat: {
        structure: 4
      }, target: {
        itemUuid: ""
      }, magic: {
        drain: {
          value: 0
        }
      }, chatCard: {
        buttons: {
        }
      },
    }
    await expect(resistanceResultInfo(cardData, "weaponResistance")).resolves.toBeUndefined()
    expect(cardData.chatCard.buttons.decreaseAccuracy).toBeUndefined()
  })

  it('ends the test without crashing when the Structure exceeds the DV', async () => {
    globalThis.fromUuid = vi.fn(async () => null)
    const cardData = {
      previousMessage: {
        hits: 3
      }, roll: {
        hits: 0
      }, damage: {
        value: 3
      }, combat: {
        structure: 6
      }, target: {
        itemUuid: "Actor.a.Item.k"
      }, magic: {
        drain: {
          value: 0
        }
      }, chatCard: {
        buttons: {
        }
      },
    }
    await resistanceResultInfo(cardData, "weaponResistance")
    expect(Object.keys(cardData.chatCard.buttons)).toEqual(["actionEnd"])
  })
})
