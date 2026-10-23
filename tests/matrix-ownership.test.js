import {
  describe, it, expect, afterEach
} from 'vitest'
import {
  matrixOwnership, ownerOf, administratorByHook, administersIcon, sheetMatrixActions, OWNER, NOT_OWNER, UNKNOWN_OWNER
} from '../modules/system/matrix-ownership.js'
import {
  foundryHooks
} from './fixtures/foundry-hooks.js'

// Lot 19: who owns an icon (SR5 p. 238), and the spiders of a host (KC p. 51)

const pc = (id, extra = {
}) => ({
  id, type: 'actorPc', system: {
  }, ...extra
})
const host = {
  id: 'host', uuid: 'Actor.host', type: 'actorDevice', system: {
    matrix: {
      deviceType: 'host'
    }
  }
}
const camera = (panMaster) => ({
  id: 'camera', type: 'actorDevice', system: {
    matrix: {
      deviceType: 'device', panMaster
    }
  }
})
const ice = {
  id: 'ice', type: 'actorDevice', system: {
    matrix: {
      deviceType: 'ice', hostUuid: 'Actor.host'
    }
  }
}
const resolve = uuid => ({
  'Actor.host': host,
  'Actor.decker.Item.commlink': {
    parent: pc('decker')
  },
})[uuid] ?? null
const hostOf = actor => actor === ice ? host : null
const options = (isAdministrator = () => null) => ({
  resolve, hostOf, isAdministrator
})

describe('the owner of an icon (SR5 p. 238)', () => {
  it('a character owns herself', () => {
    expect(matrixOwnership(pc('a'), pc('a'), options())).toBe(OWNER)
  })
  it('another character is no owner', () => {
    expect(matrixOwnership(pc('b'), pc('a'), options())).toBe(NOT_OWNER)
  })
  it('two unlinked tokens of one actor are two icons', () => {
    const token = tokenId => pc('grunt', {
      isToken: true, token: {
        id: tokenId
      }
    })
    expect(matrixOwnership(token('t1'), token('t2'), options())).toBe(NOT_OWNER)
  })
  it('the creator owns her drone; anyone else does not', () => {
    const drone = {
      id: 'drone', type: 'actorDrone', system: {
        creatorId: 'rigger'
      }
    }
    expect(matrixOwnership(pc('rigger'), drone, options())).toBe(OWNER)
    expect(matrixOwnership(pc('other'), drone, options())).toBe(NOT_OWNER)
  })
  it('a drone with no creator: unknown, never refused', () => {
    expect(matrixOwnership(pc('a'), {
      id: 'd', type: 'actorDrone', system: {
      }
    }, options())).toBe(UNKNOWN_OWNER)
  })
  it('a device slaved to a character is hers', () => {
    expect(matrixOwnership(pc('decker'), camera('Actor.decker.Item.commlink'), options())).toBe(OWNER)
    expect(matrixOwnership(pc('other'), camera('Actor.decker.Item.commlink'), options())).toBe(NOT_OWNER)
  })
  it('a device with no master: unknown', () => {
    expect(ownerOf(camera(''), {
      resolve
    }).ids).toBeNull()
    expect(matrixOwnership(pc('a'), camera(''), options())).toBe(UNKNOWN_OWNER)
  })
})

describe('the spiders of a host (KC p. 51)', () => {
  it('a device slaved to the host, its IC and the host itself go up to the host', () => {
    expect(ownerOf(camera('Actor.host'), {
      resolve
    }).host).toBe(host)
    expect(ownerOf(ice, {
      hostOf
    }).host).toBe(host)
    expect(ownerOf(host).host).toBe(host)
  })
  it('a spider named by a module owns them', () => {
    const isAdministrator = ({
      actor
    }) => actor.id === 'spider'
    expect(matrixOwnership(pc('spider'), camera('Actor.host'), options(isAdministrator))).toBe(OWNER)
    expect(matrixOwnership(pc('decker'), ice, options(isAdministrator))).toBe(NOT_OWNER)
  })
  it('the crown counts four marks for the spider on a device of its host, none elsewhere', () => {
    const isAdministrator = ({
      actor
    }) => actor.id === 'spider'
    expect(administersIcon(pc('spider'), camera('Actor.host'), options(isAdministrator))).toBe(true)
    expect(administersIcon(pc('spider'), camera('Actor.decker.Item.commlink'), options(isAdministrator))).toBe(false)
    expect(administersIcon(pc('decker'), camera('Actor.host'), options(isAdministrator))).toBe(false)
  })
  it('no module answering: the owner of a host is unknown', () => {
    expect(matrixOwnership(pc('decker'), host, options())).toBe(UNKNOWN_OWNER)
  })
})

describe('the hook sr5.matrixAdministrator', () => {
  afterEach(() => {
    delete globalThis.Hooks
  })
  it('reads what a module answers, and null when nobody does', () => {
    globalThis.Hooks = foundryHooks()
    expect(administratorByHook({
      actor: pc('a'), target: host, host
    })).toBeNull()
    globalThis.Hooks = foundryHooks({
      'sr5.matrixAdministrator': verdict => {
        verdict.administrator = verdict.actor.id === 'spider'
      }
    })
    expect(administratorByHook({
      actor: pc('spider'), target: host, host
    })).toBe(true)
    expect(administratorByHook({
      actor: pc('a'), target: host, host
    })).toBe(false)
  })
})

// The Matrix actions the sheet of a character or a grunt lists (one rule for both sheets)
describe('sheetMatrixActions', () => {
  const action = (source, linkedAttribute, dicePool) => ({
    source, limit: {
      linkedAttribute
    }, test: {
      dicePool
    }
  })
  const system = ({
    attack = 0, sleaze = 0, depth = false
  } = {
  }) => ({
    activeSpecialAttribute: depth ? 'depth' : '', matrix: {
      attributes: {
        attack: {
          value: attack
        }, sleaze: {
          value: sleaze
        }
      },
      actions: {
        dataSpike: action('core', 'attack', 0),
        hackOnTheFly: action('core', 'sleaze', 0),
        matrixPerception: action('core', 'dataProcessing', 4),
        editFile: action('core', 'dataProcessing', 0),
        tamper: action('killCode', 'dataProcessing', 3),
        calibration: action('rigger5', 'dataProcessing', 3),
        depthAction: action('dataTrails', 'dataProcessing', 3),
        gridHop: {
        },
      }
    }
  })
  const keys = (s, options) => Object.keys(sheetMatrixActions(s, options)).sort()

  it('lists the rollable core actions, Attack and Sleaze ones only with those attributes', () => {
    expect(keys(system())).toEqual(['matrixPerception'])
    expect(keys(system({
      attack: 4, sleaze: 3
    }))).toEqual(['dataSpike', 'hackOnTheFly', 'matrixPerception'])
  })
  it('adds the actions of the optional rules turned on, and Depth actions to an AI using Depth', () => {
    expect(keys(system(), {
      killCodeRules: true, rigger5Actions: true
    })).toEqual(['calibration', 'matrixPerception', 'tamper'])
    expect(keys(system({
      depth: true
    }))).toEqual(['depthAction', 'matrixPerception'])
  })
  it('an AI without a device emulates Attack and Sleaze, without its Depth actions (Data Trails p. 159)', () => {
    expect(keys(system({
      depth: true
    }), {
      emulates: true
    })).toEqual(['dataSpike', 'hackOnTheFly', 'matrixPerception'])
  })
  it('unfolded, every action of the rules on, and the actions with no test the sheet takes', () => {
    expect(keys(system(), {
      showAll: true
    })).toEqual(['dataSpike', 'editFile', 'gridHop', 'hackOnTheFly', 'matrixPerception'])
  })
})
