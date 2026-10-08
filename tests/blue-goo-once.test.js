import {
  describe, it, expect
} from 'vitest'
import {
  blueGooToExplode
} from '../modules/system/blue-goo.js'

// Kill Code p. 74: Blue Goo explodes once. Its resistance card and the defense of the avatar that hurt it each offer the
// explosion: the second button used made it explode again (Bérénice's review 126)

const ice = (subType, statuses = []) => ({
  system: {
    matrix: {
      deviceSubType: subType
    }
  }, statuses: new Set(statuses), effects: []
})
const decker = {
  system: {
    matrix: {
    }
  }, statuses: new Set()
}

describe('Blue Goo explodes once', () => {
  it('finds it on its resistance card, or as the attacker of a defense card', () => {
    const goo = ice('iceBlueGoo')
    expect(blueGooToExplode(goo, decker).goo).toBe(goo)
    expect(blueGooToExplode(decker, goo).goo).toBe(goo)
  })

  it('makes a downed Blue Goo explode no more, from either button', () => {
    const down = ice('iceBlueGoo', ['dead'])
    expect(blueGooToExplode(down, decker)).toEqual({
      goo: null, down: true
    })
    expect(blueGooToExplode(decker, down)).toEqual({
      goo: null, down: true
    })
  })

  it('reads the dead status on its effects too', () => {
    const goo = ice('iceBlueGoo')
    goo.statuses = undefined
    goo.effects = [{
      statuses: new Set(['dead'])
    }]
    expect(blueGooToExplode(goo, decker).down).toBe(true)
  })

  it('leaves any other IC alone', () => {
    expect(blueGooToExplode(ice('iceKiller'), decker)).toEqual({
      goo: null, down: false
    })
  })
})
