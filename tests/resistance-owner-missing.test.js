import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_ThirdPartyHelpers, resistanceOwnerMissingWarning
} = await import('../modules/rolls/roll-helpers/thirdparty.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

describe('Resistance whose owner was deleted', () => {
  it('names the ritual leader, and the author for any other resistance', () => {
    expect(resistanceOwnerMissingWarning("ritual")).toBe("SR5.WARN_RitualLeaderMissing")
    expect(resistanceOwnerMissingWarning("summoning")).toBe("SR5.WARN_ResistanceOwnerMissing")
    expect(resistanceOwnerMissingWarning("resonanceAction")).toBe("SR5.WARN_ResistanceOwnerMissing")
  })

  it.each([
    ["summoning", "summoning"], ["resonanceAction", "compileSprite"]
  ])('warns instead of stopping silently (%s / %s)', async (type, typeSub) => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(undefined)
    const warn = vi.fn()
    globalThis.ui = {
      notifications: {
        warn
      }
    }
    await SR5_ThirdPartyHelpers.createItemResistance({
      owner: {
        actorId: 'gone'
      }, test: {
        type, typeSub
      }, roll: {
        hits: 3
      }
    }, 'm1')
    expect(warn).toHaveBeenCalledOnce()
  })
})
