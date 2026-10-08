import {
  describe, it, expect
} from 'vitest'
import {
  sleutherMarksOn, isLegitimateUser, sleutherDice, spiderByHook
} from '../modules/system/ice-sleuther.js'

// Kill Code p. 74: each Sleuther mark gives the legitimate user +2 dice on Matrix Search and Matrix Perception about the
// marked icon. Legitimate user: the host, its IC, its spider (arbitrage de DjamZ, 08/10)

const ice = (id, subType, hostUuid = 'Actor.host') => ({
  id, type: 'actorDevice', system: {
    matrix: {
      deviceType: 'ice', deviceSubType: subType, hostUuid
    }
  }
})
const sleuther = ice('sleuther', 'iceSleuther')
const otherSleuther = ice('sleuther2', 'iceSleuther')
const probe = ice('probe', 'iceProbe')
const killer = ice('killer', 'iceKiller')
const foreignIce = ice('foreign', 'iceKiller', 'Actor.otherHost')
const spider = {
  id: 'spider', type: 'actorPc', items: [], system: {
    matrix: {
    }
  }
}
const stranger = {
  id: 'stranger', type: 'actorPc', items: [], system: {
    matrix: {
    }
  }
}
const host = {
  id: 'host', uuid: 'Actor.host', type: 'actorDevice', items: [{
    type: 'itemDevice', system: {
      isActive: true, marks: [{
        ownerId: 'spider', value: 3
      }]
    }
  }], system: {
    matrix: {
      deviceType: 'host'
    }
  }
}
const decker = (marks) => ({
  id: 'decker', type: 'actorPc', items: [{
    type: 'itemDevice', system: {
      isActive: true, marks
    }
  }], system: {
    matrix: {
      // The prepared persona copies the marks of the active device
      marks
    }
  }
})
const actors = {
  sleuther, sleuther2: otherSleuther, probe, killer, foreign: foreignIce, spider, stranger, host
}
const resolve = id => actors[id]
const hostOf = i => i.system.matrix.hostUuid === host.uuid ? host : null

describe('Sleuther IC (Kill Code p. 74)', () => {
  it('counts only the marks a Sleuther placed', () => {
    const target = decker([{
      ownerId: 'sleuther', value: 2
    }, {
      ownerId: 'probe', value: 3
    }])
    expect(sleutherMarksOn(target, resolve)).toEqual([{
      ice: sleuther, ices: [sleuther], value: 2
    }])
  })

  it('gives +2 dice per mark to the host, its IC and the Sleuther itself', () => {
    const target = decker([{
      ownerId: 'sleuther', value: 2
    }])
    for (const roller of [host, killer, sleuther]) expect(sleutherDice(roller, target, resolve, hostOf)).toBe(4)
  })

  // Arbitrage de DjamZ, 08/10: the spider of the host, named by a module; a persona with only marks on the host has nothing
  it('gives them to the spider a module names, never to a persona that only holds marks on the host', () => {
    const target = decker([{
      ownerId: 'sleuther', value: 1
    }])
    const namesSpider = ({
      roller, host: h
    }) => roller === spider && h === host
    expect(sleutherDice(spider, target, resolve, hostOf, namesSpider)).toBe(2)
    expect(sleutherDice(spider, target, resolve, hostOf, () => false)).toBe(0)
    expect(sleutherDice(stranger, target, resolve, hostOf, namesSpider)).toBe(0)
    expect(sleutherDice(foreignIce, target, resolve, hostOf, namesSpider)).toBe(0)
  })

  it('asks the modules through the hook sr5.iceLegitimateUser', () => {
    const calls = []
    const saved = globalThis.Hooks
    globalThis.Hooks = {
      callAll: (name, verdict) => {
        calls.push(name)
        if (verdict.roller === spider) verdict.legitimate = true
      }
    }
    expect(spiderByHook({
      roller: spider, ice: sleuther, host
    })).toBe(true)
    expect(spiderByHook({
      roller: stranger, ice: sleuther, host
    })).toBe(false)
    expect(calls).toEqual(['sr5.iceLegitimateUser', 'sr5.iceLegitimateUser'])
    globalThis.Hooks = saved
  })

  it('adds the marks of every Sleuther of the host, never the marked icon about itself', () => {
    const target = decker([{
      ownerId: 'sleuther', value: 1
    }, {
      ownerId: 'sleuther2', value: 2
    }])
    expect(sleutherDice(killer, target, resolve, hostOf)).toBe(6)
    expect(sleutherDice(target, target, resolve, hostOf)).toBe(0)
  })

  it('a Sleuther tied to no host serves itself alone', () => {
    const lone = ice('lone', 'iceSleuther', '')
    const target = decker([{
      ownerId: 'lone', value: 3
    }])
    const r = id => id === 'lone' ? lone : resolve(id)
    expect(sleutherDice(lone, target, r, hostOf)).toBe(6)
    expect(sleutherDice(killer, target, r, hostOf)).toBe(0)
    expect(isLegitimateUser(spider, lone, null)).toBe(false)
  })

  // Bérénice's review 126, measured 08/10: an unlinked token marks under its world actor's id, its host set on the token
  it('reads the host of an unlinked Sleuther token, its world actor tied to none', () => {
    const base = ice('sleutherTok', 'iceSleuther', '')
    const token = ice('sleutherTok', 'iceSleuther')
    const target = decker([{
      ownerId: 'sleutherTok', value: 2
    }])
    const r = id => id === 'sleutherTok' ? [base, token] : resolve(id)
    expect(sleutherDice(killer, target, r, hostOf)).toBe(4)
    expect(sleutherDice(host, target, r, hostOf)).toBe(4)
    expect(sleutherDice(killer, target, id => id === 'sleutherTok' ? base : resolve(id), hostOf)).toBe(0)
  })

  it('reads the marks on the persona of an AI outside any device', () => {
    const ai = {
      id: 'ai', items: [], system: {
        matrix: {
          marks: [{
            ownerId: 'sleuther', value: 3
          }]
        }
      }
    }
    expect(sleutherDice(host, ai, resolve, hostOf)).toBe(6)
  })
})
