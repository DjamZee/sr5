import {
  describe, it, expect
} from 'vitest'
import {
  sleutherMarksOn, isLegitimateUser, sleutherDice
} from '../modules/system/ice-sleuther.js'

// Kill Code p. 74: each Sleuther mark gives the legitimate user +2 dice on Matrix Search and Matrix Perception about the
// marked icon. Legitimate user read in SR5 p. 249-250: the host, its IC, a persona with a mark on the host

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
      ice: sleuther, value: 2
    }])
  })

  it('gives +2 dice per mark to the host, its IC and the Sleuther itself', () => {
    const target = decker([{
      ownerId: 'sleuther', value: 2
    }])
    for (const roller of [host, killer, sleuther]) expect(sleutherDice(roller, target, resolve, hostOf)).toBe(4)
  })

  it('gives them to a persona holding a mark on the host (SR5 p. 250), and to nobody else', () => {
    const target = decker([{
      ownerId: 'sleuther', value: 1
    }])
    expect(sleutherDice(spider, target, resolve, hostOf)).toBe(2)
    expect(sleutherDice(stranger, target, resolve, hostOf)).toBe(0)
    expect(sleutherDice(foreignIce, target, resolve, hostOf)).toBe(0)
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
