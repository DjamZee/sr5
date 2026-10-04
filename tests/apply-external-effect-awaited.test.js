import {
  describe, it, expect, vi
} from 'vitest'

// N64, measured in game: a token's spell effect is checked again as soon as the next move or template comes, and
// that check must find the effect just created. SR5Actor.applyExternalEffect returned before its helper had
// created it, so two templates drawn at once gave two copies.
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

describe('SR5Actor.applyExternalEffect', () => {
  it('resolves only once the effect is created', async () => {
    let created = false
    vi.spyOn(SR5_ActorHelper, 'applyExternalEffect').mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5))
      created = true
    })
    await SR5Actor.prototype.applyExternalEffect.call({
      isToken: false, id: 'victim'
    }, {
    }, 'customEffects')
    expect(created).toBe(true)
  })
})
