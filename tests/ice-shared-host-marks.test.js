import {
  describe, it, expect, afterEach
} from 'vitest'

// D2 (vérification en jeu du 16/10), SR5 p. 249 : « Les CI dans un serveur et le serveur lui-même partagent leurs
// marks ». A mark of the host, or of another IC of the host, counts for the IC (Crash, Scramble, Track, Flicker...)

globalThis.CONFIG ??= {
}
const {
  sharedIceMarks, SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')

const H = 'Scene.s1.Token.th.Actor.h'
const host = {
  id: 'h', uuid: H, isToken: true, token: {
    id: 'th'
  }, type: 'actorDevice', system: {
    matrix: {
      deviceType: 'host'
    }
  }
}
const ice = (isToken = true) => ({
  id: 'crash', isToken, system: {
    matrix: {
      deviceType: 'ice', hostUuid: H
    }
  }
})

afterEach(() => {
  delete globalThis.fromUuidSync
})

describe('the marks an IC shares with its host', () => {
  it('counts its own marks, those of the host and of the host\'s other ICs, at most 3', () => {
    const marks = [{
      ownerId: 'crash', value: 1, hostUuid: H
    }, {
      ownerId: 'th', value: 1
    }, {
      ownerId: 'probe', value: 1, hostUuid: H
    }, {
      ownerId: 'hacker2', value: 3
    }]
    expect(sharedIceMarks(marks, {
      iceId: 'crash', ownHost: H, hostUuid: H, hostIds: ['th']
    })).toBe(3)
    expect(sharedIceMarks(marks.slice(1, 2), {
      iceId: 'crash', ownHost: H, hostUuid: H, hostIds: ['th']
    })).toBe(1)
  })
  it('never counts the marks of the same IC launched in another host, nor of another instance of the host', () => {
    const marks = [{
      ownerId: 'crash', value: 2, hostUuid: 'Scene.s2.Token.t2.Actor.h'
    }, {
      ownerId: 'h', value: 2
    }]
    expect(sharedIceMarks(marks, {
      iceId: 'crash', ownHost: H, hostUuid: H, hostIds: ['th']
    })).toBe(0)
  })
  it('an IC tied to no host counts its own marks only, as before', () => {
    expect(sharedIceMarks([{
      ownerId: 'crash', value: 2
    }, {
      ownerId: 'th', value: 1
    }], {
      iceId: 'crash'
    })).toBe(2)
  })
  it('reads the host of the IC: a mark the host placed on the deck lets Crash crash a program', () => {
    globalThis.fromUuidSync = uuid => uuid === H ? host : null
    expect(SR5_MarkHelpers.iceMarkValue({
      marks: [{
        ownerId: 'th', value: 1
      }]
    }, ice())).toBe(1)
    // A linked IC keeps its own marks, which carry no host, and shares the host's
    expect(SR5_MarkHelpers.iceMarkValue({
      marks: [{
        ownerId: 'crash', value: 1
      }, {
        ownerId: 'th', value: 1
      }]
    }, ice(false))).toBe(2)
  })
})
