import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  alreadyOpposed
} = await import('../modules/system/chase-roll.js')

// Lancelot (relecture groupée, F2): the "opposes" button stayed after the opposition and let a second one be rolled
describe('one opposition per chase card (SR5 p. 205)', () => {
  const card = (mode, originId, targetId) => ({
    flags: {
      sr5data: {
        chase: {
          mode, originId, targetId
        }
      }
    }
  })

  it('sees the opposition of this vehicle to this card', () => {
    expect(alreadyOpposed([card('oppose', 'm1', 'v2')], 'm1', 'v2')).toBe(true)
  })

  it('not another card, another vehicle, nor a follow-up test', () => {
    expect(alreadyOpposed([card('oppose', 'm0', 'v2'), card('oppose', 'm1', 'v3'), card('followUp', 'm1', 'v2')], 'm1', 'v2')).toBe(false)
    expect(alreadyOpposed([{
    }, null], 'm1', 'v2')).toBe(false)
    expect(alreadyOpposed(undefined, 'm1', 'v2')).toBe(false)
  })
})
