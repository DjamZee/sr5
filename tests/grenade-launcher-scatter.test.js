import {
  describe, it, expect, vi
} from 'vitest'

// SR5 p. 182-183: a grenade, a grenade launcher or a missile launcher is a simple test (3) against a spot.
// Under 3 hits the projectile scatters; nobody rolls a defense. A launcher keeps typeSub "rangedWeapon"
// (range and every usual modifier apply), so the card must recognise it by combat.grenade.isGrenade.
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (type, action, label) => ({
      type, action, label
    }),
  },
}))

const {
  default: attackInfo
} = await import('../modules/rolls/roll-test-case/test-Attack.js')

const card = (typeSub, isGrenade, hits) => ({
  test: {
    typeSub, type: 'attack'
  },
  roll: {
    hits
  },
  damage: {
    base: 10, value: 10, type: 'physical', element: ''
  },
  combat: {
    choke: {
    }, armorPenetration: -2, grenade: {
      isGrenade
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

describe('grenade launcher card', () => {
  for (const hits of [0, 1, 2]) {
    it(`offers Scatter and no Defend at ${hits} hits`, async () => {
      const c = card('rangedWeapon', true, hits)
      await attackInfo(c)
      expect(c.chatCard.buttons.scatter).toBeDefined()
      expect(c.chatCard.buttons.defenseRangedWeapon).toBeUndefined()
      expect(c.chatCard.buttons.resistanceCard).toBeDefined()
    })
  }

  it('lands on the spot at 3 hits or more: no Scatter, no Defend', async () => {
    for (const hits of [3, 4]) {
      const c = card('rangedWeapon', true, hits)
      await attackInfo(c)
      expect(c.chatCard.buttons.scatter).toBeUndefined()
      expect(c.chatCard.buttons.defenseRangedWeapon).toBeUndefined()
    }
  })

  it('keeps the hand grenade as it was', async () => {
    const c = card('grenade', true, 1)
    await attackInfo(c)
    expect(c.chatCard.buttons.scatter).toBeDefined()
  })

  it('still offers Defend to an ordinary shot', async () => {
    const c = card('rangedWeapon', false, 2)
    await attackInfo(c)
    expect(c.chatCard.buttons.defenseRangedWeapon).toBeDefined()
    expect(c.chatCard.buttons.scatter).toBeUndefined()
  })
})
