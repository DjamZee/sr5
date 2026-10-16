import {
  describe, it, expect
} from 'vitest'

// Lot 19: the copies of one IC launched in two hosts share an id; the mark keeps the host of the copy that placed it

globalThis.CONFIG ??= {
}
const {
  iceMarkHost, sameIceHost
} = await import('../modules/rolls/roll-helpers/mark.js')

const iceToken = hostUuid => ({
  isToken: true, system: {
    matrix: {
      deviceType: 'ice', hostUuid
    }
  }
})

describe('the host of an IC mark', () => {
  it('an unlinked IC token marks for its own host', () => {
    expect(iceMarkHost(iceToken('Actor.h1'))).toBe('Actor.h1')
    expect(iceMarkHost(iceToken(''))).toBeNull()
  })
  it('anyone else marks with no host, as before', () => {
    expect(iceMarkHost({
      isToken: false, system: {
        matrix: {
          deviceType: 'ice', hostUuid: 'Actor.h1'
        }
      }
    })).toBeNull()
    expect(iceMarkHost({
      isToken: true, system: {
        matrix: {
        }
      }
    })).toBeNull()
  })
  it('a mark is added to only by the copy of the same host', () => {
    expect(sameIceHost({
      hostUuid: 'Actor.h1'
    }, 'Actor.h1')).toBe(true)
    expect(sameIceHost({
      hostUuid: 'Actor.h1'
    }, 'Actor.h2')).toBe(false)
    expect(sameIceHost({
    }, null)).toBe(true)
    expect(sameIceHost({
    }, 'Actor.h1')).toBe(false)
  })
})
