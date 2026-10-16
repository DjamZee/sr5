import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import fs from 'node:fs'
import {
  actionsForNode, actionState, aimedItemUuid, marksFor, marksNeeded, menuEntries, modeSwitchCost, modeUpdate, ownModeOf,
  PAN_DEVICE_ACTIONS
} from '../modules/canvas/pan-crown/pan-actions.js'

// The radial menu of a crown (couronne du PAN, lot 4): the actions on a device, greyed out when marks are missing
// (SR5 p. 238-245), and the target chosen by the attacker that reaches the card (Q6 of DjamZ, 07/10)

// The matrix action test, stopped at its first step: what it receives is what the card will carry
const received = []
vi.mock('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js', () => ({
  default: async rollData => {
    received.push(rollData)
    throw new Error('stopped')
  },
  canTryMatrixAction: () => true,
  targetsWirelessOffDrone: () => false,
  isWirelessOffDrone: () => false,
  checksTargetMarks: () => true,
}))
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_PrepareRollHelper
} = await import('../modules/rolls/roll-prepare-helpers.js')

const graph = (extra = {
}) => ({
  master: 'commlink', viewer: {
    ids: ['decker'], hasAntenna: true
  }, nodes: [], ...extra
})
const gun = (extra = {
}) => ({
  uuid: 'Actor.guard.Item.gun', kind: 'slave', itemType: 'itemWeapon', ownerIds: ['guard'], mode: 'active',
  silentFrom: null, viewerMarks: 0, ...extra
})
const decker = (actions = {
}) => ({
  actor: {
    system: {
      matrix: {
        actions
      }
    }
  }
})
const SHEET = {
  hackOnTheFly: {
    neededMarks: 0
  },
  formatDevice: {
    neededMarks: 3
  },
  spoofCommand: {
    neededMarks: 1
  },
  controlDevice: {
    neededMarks: 'S'
  },
  jackOut: {
    neededMarks: 4
  },
}

describe('actions offered on a device (SR5 p. 238-245)', () => {
  it('offers the device actions on a slave, and no persona action', () => {
    const keys = actionsForNode(gun(), graph())
    expect(keys).toEqual(PAN_DEVICE_ACTIONS)
    expect(keys).not.toContain('haywire')
  })

  it('adds Jump into Rigged Device on a drone', () => {
    expect(actionsForNode(gun({
      kind: 'drone', itemType: 'itemVehicle'
    }), graph())).toContain('jumpIntoRiggedDevice')
  })

  it('adds the persona actions on the master (Haywire aims at a persona, KC p. 43)', () => {
    expect(actionsForNode(gun({
      uuid: 'commlink', kind: 'master'
    }), graph())).toEqual(expect.arrayContaining(['traceIcon', 'crashProgram', 'haywire']))
  })
})

describe('greyed out or not', () => {
  it('reads the marks the sheet asks for, "S" being variable', () => {
    expect(marksNeeded(3)).toBe(3)
    expect(marksNeeded('3')).toBe(3)
    expect(marksNeeded('S')).toBeNull()
    expect(marksNeeded(undefined)).toBe(0)
  })

  it('lets Hack on the Fly through with no mark', () => {
    expect(actionState({
      neededMarks: 0, marks: 0
    })).toMatchObject({
      enabled: true, reason: null
    })
  })

  it('greys out Format Device under three marks, with the count', () => {
    expect(actionState({
      neededMarks: 3, marks: 2
    })).toEqual({
      enabled: false, reason: 'marks', needed: 3, marks: 2
    })
    expect(actionState({
      neededMarks: 3, marks: 3
    }).enabled).toBe(true)
  })

  it('greys out an owner action: four marks, more than anyone can place (SR5 p. 238)', () => {
    expect(actionState({
      neededMarks: 4, marks: 3
    }).reason).toBe('owner')
  })

  it('leaves Control Device open, its marks being those of the action taken (SR5 p. 239)', () => {
    expect(actionState({
      neededMarks: 'S', marks: 0
    })).toMatchObject({
      enabled: true, reason: 'varies'
    })
  })

  it('greys everything out without a device switched on (Q2), or without the action on the sheet', () => {
    expect(actionState({
      neededMarks: 0, hasAntenna: false
    }).reason).toBe('noAntenna')
    expect(actionState({
      neededMarks: 0, known: false
    }).reason).toBe('unknown')
  })

  it('counts for Spoof Command the marks on the owner\'s icon, not on the target (SR5 p. 241)', () => {
    const g = graph({
      nodes: [{
        uuid: 'commlink', viewerMarks: 1
      }]
    })
    expect(marksFor('spoofCommand', gun(), g)).toBe(1)
    expect(marksFor('formatDevice', gun(), g)).toBe(0)
  })

  it('builds the menu of a hacker: Format Device greyed, Hack on the Fly open', () => {
    const entries = menuEntries(gun({
      viewerMarks: 1
    }), graph(), decker(SHEET))
    expect(entries.owner).toBe(false)
    const byKey = Object.fromEntries(entries.actions.map(a => [a.key, a]))
    expect(byKey.hackOnTheFly.enabled).toBe(true)
    expect(byKey.formatDevice).toMatchObject({
      enabled: false, reason: 'marks', needed: 3, marks: 1
    })
    expect(byKey.bruteForce.reason).toBe('unknown')
  })
})

describe('the owner\'s menu', () => {
  it('gives the owner the modes and freeing a slave, no hacking action', () => {
    const entries = menuEntries(gun(), graph({
      viewer: {
        ids: ['guard'], hasAntenna: true
      }
    }), decker(SHEET))
    expect(entries.owner).toBe(true)
    expect(entries.actions).toEqual([])
    expect(entries.modes.map(m => m.mode)).toEqual(['active', 'silent', 'offline'])
    expect(entries.modes.find(m => m.current).mode).toBe('active')
    expect(entries.slave).toEqual({
      action: 'free'
    })
  })

  it('offers to slave a free device, and no offline switch on the master (the sheet throws a VR hacker out)', () => {
    const owner = graph({
      viewer: {
        ids: ['guard'], hasAntenna: true
      }
    })
    expect(menuEntries(gun({
      kind: 'device'
    }), owner).slave).toEqual({
      action: 'slave'
    })
    expect(menuEntries(gun({
      uuid: 'commlink', kind: 'master', itemType: 'itemDevice'
    }), owner).modes.map(m => m.mode)).toEqual(['active', 'silent'])
  })

  it('reads the device\'s own mode, not the silence passed on by its master (KC p. 39)', () => {
    expect(ownModeOf(gun({
      mode: 'silent', silentFrom: 'master'
    }))).toBe('active')
    expect(ownModeOf(gun({
      mode: 'silent', silentFrom: 'self'
    }))).toBe('silent')
    expect(ownModeOf(gun({
      mode: 'offline'
    }))).toBe('offline')
  })

  it('costs a simple action to run silent or leave it (SR5 p. 236, Q7)', () => {
    expect(modeSwitchCost('active', 'silent')).toEqual([{
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
    expect(modeSwitchCost('silent', 'active')).toEqual([{
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
    expect(modeSwitchCost('active', 'active')).toEqual([])
  })

  it('costs the wireless switch what the sheet costs, and no silent action when going offline', () => {
    const wireless = turningOn => turningOn ? 'simple' : 'free'
    expect(modeSwitchCost('silent', 'offline', wireless)).toEqual([{
      type: 'free', value: 1, source: 'turnOffWifi'
    }])
    expect(modeSwitchCost('offline', 'silent', wireless)).toEqual([
      {
        type: 'simple', value: 1, source: 'turnOnWifi'
      },
      {
        type: 'simple', value: 1, source: 'changeSilentMode'
      },
    ])
  })

  it('writes the mode on the item', () => {
    expect(modeUpdate('silent')).toEqual({
      'system.wirelessTurnedOn': true, 'system.isSilent': true
    })
    expect(modeUpdate('offline')).toEqual({
      'system.wirelessTurnedOn': false
    })
  })
})

describe('the device chosen by the attacker reaches the card (Q6)', () => {
  beforeEach(() => {
    received.length = 0
    globalThis.game ??= {
    }
    game.user = {
      targets: new Set()
    }
    game.i18n = {
      localize: k => k
    }
    game.settings = {
      get: () => false
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
    const guard = {
      isToken: true, token: {
        id: 'tokGuard'
      }, id: 'guardBase'
    }
    globalThis.canvas = {
      tokens: {
        get: id => id === 'tokGuard' ? {
          id, actor: guard
        } : undefined
      }
    }
    vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue({
      type: 'actorPc', system: {
      }
    })
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
      systemRules: {
      }, target: {
        hasTarget: false, actorId: null, itemUuid: null
      }
    })
  })

  it('names the device aimed at, none for the persona or a deployed drone', () => {
    expect(aimedItemUuid(gun(), graph())).toBe('Actor.guard.Item.gun')
    expect(aimedItemUuid(gun({
      uuid: 'commlink'
    }), graph())).toBeNull()
    expect(aimedItemUuid(gun({
      kind: 'drone'
    }), graph())).toBeNull()
  })

  it('puts the device in target.itemUuid and the token in target.actorId', async () => {
    await SR5_PrepareRollTest.rollTest({
    }, 'matrixAction', 'hackOnTheFly', {
      panTarget: {
        tokenId: 'tokGuard', itemUuid: 'Actor.guard.Item.gun'
      }
    }).catch(() => {})
    expect(received).toHaveLength(1)
    expect(received[0].target).toMatchObject({
      hasTarget: true, actorId: 'tokGuard', itemUuid: 'Actor.guard.Item.gun', panPicked: true
    })
  })

  it('keeps the sheet\'s path: no device chosen in advance', async () => {
    await SR5_PrepareRollTest.rollTest({
    }, 'matrixAction', 'hackOnTheFly', null).catch(() => {})
    expect(received[0].target.itemUuid).toBeNull()
    expect(received[0].target.panPicked).toBeUndefined()
  })

  it('does not ask the defender to choose a device the attacker chose (roll-message.js)', () => {
    const source = fs.readFileSync('modules/rolls/roll-message.js', 'utf8')
    const branch = source.slice(source.indexOf('case "matrixDefense":'), source.indexOf('SR5_MatrixHelpers.chooseMatrixDefender(messageData, actor)'))
    expect(branch).toContain('!messageData.target?.panPicked &&')
  })
})
