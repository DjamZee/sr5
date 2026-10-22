import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// API pour NETWORKS (landing-metroplexes-sr5): the marks of a persona on a host (game.sr5.matrix.marksOn, markedHosts)
// and the information broker's window (game.sr5.infoBroker.open), instead of importing the system's files by path.

const openSpy = vi.fn(async options => options)
vi.mock('../modules/interface/info-broker.js', () => ({
  SR5InfoBrokerApp: {
    open: openSpy
  }
}))

const {
  actorOfSync, worldHosts, marksOn, markedHosts, SR5MatrixApi
} = await import('../modules/system/matrix-api.js')
const {
  infoBrokerApi, brokerBuyer
} = await import('../modules/interface/info-broker-api.js')

const host = (id, marks = [], {
  isToken = false
} = {
}) => ({
  documentName: 'Actor', id, uuid: isToken ? `Scene.s.Token.t${id}.Actor.${id}` : `Actor.${id}`, name: `Hôte ${id}`,
  type: 'actorDevice', isToken, token: isToken ? {
    id: `t${id}`
  } : null, items: [{
    type: 'itemDevice', uuid: `Actor.${id}.Item.d`, system: {
      marks
    }
  }], system: {
    matrix: {
      deviceType: 'host'
    }
  }
})
const decker = {
  documentName: 'Actor', id: 'dek', uuid: 'Actor.dek', name: 'Decker', type: 'actorPc', isToken: false, isOwner: true,
  items: [], system: {
    matrix: {
    }
  }
}
const stranger = {
  ...decker, id: 'oth', uuid: 'Actor.oth', isOwner: false
}

let all
beforeEach(() => {
  openSpy.mockClear()
  const a = host('a', [{
    ownerId: 'dek', value: 1
  }])
  const b = host('b', [{
    ownerId: 'dek', value: 3
  }])
  const c = host('c', [])
  all = {
    a, b, c, [decker.uuid]: decker, [stranger.uuid]: stranger
  }
  for (const h of [a, b, c]) all[h.uuid] = h
  globalThis.fromUuidSync = uuid => all[uuid] ?? null
  globalThis.fromUuid = async uuid => all[uuid] ?? null
})

describe('game.sr5.matrix.marksOn (NETWORKS)', () => {
  it('reads the marks of a persona on a host at once, from actors, tokens or uuids', () => {
    expect(marksOn(decker, all.b)).toBe(3)
    expect(marksOn('Actor.dek', 'Actor.a')).toBe(1)
    expect(marksOn({
      documentName: 'Token', actor: decker
    }, all.b)).toBe(3)
    expect(SR5MatrixApi.marksOn(decker, all.c)).toBe(0)
  })
  it('answers 0 for what is not a host or cannot be found, without throwing', () => {
    expect(marksOn(decker, decker)).toBe(0)
    expect(marksOn('Actor.none', all.a)).toBe(0)
    expect(marksOn(null, null)).toBe(0)
    globalThis.fromUuidSync = () => {
      throw new Error('compendium')
    }
    expect(actorOfSync('Compendium.x.y')).toBe(null)
  })
})

describe('game.sr5.matrix.markedHosts (NETWORKS)', () => {
  it('lists the hosts a persona has marks on, the most marks first', () => {
    const list = markedHosts(decker, [all.a, all.b, all.c])
    expect(list.map(h => [h.uuid, h.marks])).toEqual([['Actor.b', 3], ['Actor.a', 1]])
    expect(list[0].host).toBe(all.b)
    expect(markedHosts(stranger, [all.a, all.b])).toEqual([])
    expect(markedHosts(null, [all.a])).toEqual([])
  })
  it('finds the hosts of the world: actors, and unlinked tokens on scenes, never twice', () => {
    const unlinked = host('u', [], {
      isToken: true
    })
    const scenes = [{
      tokens: [{
        actorLink: false, actor: unlinked
      }, {
        actorLink: true, actor: all.a
      }, {
        actorLink: false, actor: decker
      }]
    }]
    expect(worldHosts([all.a, decker, all.b], scenes).map(h => h.uuid)).toEqual(['Actor.a', 'Actor.b', unlinked.uuid])
  })
})

describe('game.sr5.infoBroker.open (NETWORKS)', () => {
  it('opens the window at a vendor\'s, for a buyer the user owns, from actors or uuids', async () => {
    globalThis.game = {
      user: {
        isGM: false
      }
    }
    const api = infoBrokerApi()
    await api.open({
      vendor: 'Actor.a', buyer: 'Actor.dek', tab: 'sell'
    })
    expect(openSpy).toHaveBeenLastCalledWith({
      vendor: all.a, buyer: decker, tab: 'sell'
    })
  })
  it('drops a buyer a player does not own, and a tab it does not know; the gamemaster opens for anyone', async () => {
    expect(brokerBuyer(stranger, {
      isGM: false
    })).toBe(null)
    expect(brokerBuyer(stranger, {
      isGM: true
    })).toBe(stranger)
    globalThis.game = {
      user: {
        isGM: false
      }
    }
    await infoBrokerApi().open({
      buyer: stranger, tab: 'nowhere'
    })
    expect(openSpy).toHaveBeenLastCalledWith({
      vendor: null, buyer: null, tab: null
    })
    await infoBrokerApi().open()
    expect(openSpy).toHaveBeenCalledTimes(2)
  })
  it('is frozen: a module cannot replace it', () => {
    const api = infoBrokerApi()
    expect(Object.isFrozen(api)).toBe(true)
    expect(api.tabs).toEqual(['buy', 'sell', 'requests'])
  })
})
