import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import fs from 'node:fs'

// B13, lot 7 (PLAN-AUTOMATISATION-LEGERE.md, family 5 "matrix"): each site keeps its test, only its exit goes through
// refuseByRule (or capByRule). Book: refused as before. Lifted: the action goes on, and the gamemaster hears of it.
// The crown greys out the entries the marks forbid: lifted, they are enabled again, and the roll tells the gamemaster

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})
const emits = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async (type, data) => {
      emits.push([type, data])
    }
  },
}))

const {
  default: matrixAction, checkTargetMarks
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_PrepareRollHelper
} = await import('../modules/rolls/roll-prepare-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  actionState, menuEntries
} = await import('../modules/canvas/pan-crown/pan-actions.js')
const {
  ActorSheetSR5
} = await import('../modules/entities/actors/baseSheet.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  default: SR5_RollDialog
} = await import('../modules/rolls/roll-dialog.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5SharedVision
} = await import('../modules/interface/shared-vision.js')
const {
  isViewerStillValid, isViewerRequestAllowed
} = await import('../modules/system/shared-vision.js')
const {
  presetLocks, resetWhispers
} = await import('../modules/system/rule-locks.js')

let settings
// Waits for the dynamic imports the code under test starts (not a fixed delay, which a loaded machine can outlast)
const flush = async () => {
  await vi.dynamicImportSettled()
  await new Promise(resolve => setTimeout(resolve, 0))
}
const lift = () => {
  settings.sr5RuleLocks = {
    ...presetLocks('book'), matrix: false
  }
}
const matrixKeys = () => emits.filter(([type, d]) => type === 'ruleLockWhisper' && d.family === 'matrix').map(([, d]) => d.key)

const HACKER = 'hacker'
const sheetAction = neededMarks => ({
  neededMarks, actionType: 'complex', test: {
    modifiers: []
  }, limit: {
    modifiers: [], linkedAttribute: 'sleaze'
  }
})
const hacker = (resonance = 0) => ({
  id: HACKER, name: 'Hackeuse', type: 'actorPc', items: [],
  system: {
    specialAttributes: {
      resonance: {
        augmented: {
          value: resonance
        }
      }
    },
    matrix: {
      userGrid: 'local', noise: {
        value: 0
      }, attributes: {
        attack: {
          value: 4
        }
      },
      actions: {
        eraseMatrixSignature: sheetAction(1), hackOnTheFly: sheetAction(0), formatDevice: sheetAction(3),
      },
    },
  },
})
const rollData = (target = {
}) => ({
  test: {
  }, combat: {
    actions: []
  }, dialogSwitch: {
  }, dicePool: {
  }, limit: {
  }, threshold: {
  }, matrix: {
  }, damage: {
    matrix: {
    }
  }, owner: {
    speakerId: HACKER
  }, target,
})
// An icon whose device carries the hacker's marks
const icon = (marks = 0, extra = {
}) => ({
  id: 'target', name: 'Cible', type: 'actorPc', items: [{
    system: {
      marks: marks ? [{
        ownerId: HACKER, value: marks
      }] : []
    }
  }], system: {
    creatorId: '', matrix: {
      userGrid: 'local'
    }
  }, ...extra,
})
const drone = on => ({
  id: 'drone', name: 'Drone', type: 'actorDrone', items: [], system: {
    wirelessTurnedOn: on, matrix: {
      userGrid: 'local'
    }
  }
})

beforeEach(() => {
  resetWhispers()
  emits.length = 0
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'),
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse', targets: new Set()
  }
  globalThis.game.users = {
    activeGM: {
      id: 'gm'
    }
  }
  globalThis.game.actors = new Map()
  globalThis.game.combat = null
  // The roll of a matrix action, as far as the scene noise, where the tests stop it
  vi.spyOn(SR5_PrepareRollHelper, 'getBaseDicepool').mockReturnValue(0)
  vi.spyOn(SR5_PrepareRollHelper, 'getDicepoolModifiers').mockReturnValue([])
  vi.spyOn(SR5_PrepareRollHelper, 'getBaseLimit').mockReturnValue(0)
  vi.spyOn(SR5_PrepareRollHelper, 'getLimitModifiers').mockReturnValue([])
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.users
})

describe('a Resonance action without Resonance (SR5 p. 240)', () => {
  const erase = () => {
    vi.spyOn(SR5_PrepareRollHelper, 'getSceneNoise').mockImplementation(() => {
      throw new Error('past the guard')
    })
    return matrixAction(rollData(), 'eraseMatrixSignature', hacker(0))
  }
  it('book: refused', async () => {
    expect(await erase()).toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NeedResonance')
  })
  it('lifted: the action goes, the gamemaster hears of it', async () => {
    lift()
    await expect(erase()).rejects.toThrow('past the guard')
    await flush()
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(matrixKeys()).toEqual(['SR5.WARN_NeedResonance'])
  })
})

describe('a drone with its wireless off (SR5 p. 424)', () => {
  const hack = () => {
    vi.spyOn(SR5_PrepareRollHelper, 'getSceneNoise').mockImplementation(() => {
      throw new Error('past the guard')
    })
    game.user.targets = new Set([{
      actor: drone(false)
    }])
    return matrixAction(rollData(), 'hackOnTheFly', hacker())
  }
  it('book: the matrix action is refused', async () => {
    expect(await hack()).toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetWirelessOff')
  })
  it('lifted: the matrix action reaches it', async () => {
    lift()
    await expect(hack()).rejects.toThrow('past the guard')
    await flush()
    expect(matrixKeys()).toEqual(['SR5.WARN_TargetWirelessOff'])
  })

  // roll-prepare.js: an IC attack aimed at it, and the drone's own defense
  const prepare = (rollType, roller, targets) => {
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
      systemRules: {
      }
    })
    vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(roller)
    vi.spyOn(SR5_PrepareRollHelper, 'getTargetData').mockRejectedValue(new Error('past the guard'))
    game.user.targets = new Set(targets.map(actor => ({
      actor
    })))
    return SR5_PrepareRollTest.rollTest(roller, rollType, null, {
      target: {
      }
    })
  }
  it('book: an IC attack on it and its defense are refused', async () => {
    await prepare('iceAttack', hacker(), [drone(false)])
    await prepare('matrixDefense', drone(false), [])
    expect(ui.notifications.warn).toHaveBeenCalledTimes(2)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetWirelessOff')
  })
  it('lifted: the IC attack goes, and the drone defends', async () => {
    lift()
    await expect(prepare('iceAttack', hacker(), [drone(false)])).rejects.toThrow('past the guard')
    await prepare('matrixDefense', drone(false), []).catch(() => {})
    await flush()
    expect(ui.notifications.warn).not.toHaveBeenCalledWith('SR5.WARN_TargetWirelessOff')
    expect(matrixKeys()).toContain('SR5.WARN_TargetWirelessOff')
  })
})

describe('an action at 3 marks with no mark (SR5 p. 238)', () => {
  const formatDevice = {
    neededMarks: 3
  }
  // From the sheet: the token the user targets
  const fromSheet = () => {
    game.user.targets = new Set([{
      actor: icon(0)
    }])
    return checkTargetMarks(rollData(), formatDevice, hacker())
  }
  // From the crown: the icon a uuid names, with no token (rollMatrixActionOn, A1)
  const fromCrown = () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(icon(0))
    return checkTargetMarks(rollData({
      panActorOnly: true, actorId: 'target'
    }), formatDevice, hacker())
  }
  // A file aimed at counts its own marks (SR5 p. 233)
  const onFile = () => {
    globalThis.fromUuidSync = () => ({
      type: 'itemFile', system: {
        marks: []
      }
    })
    game.user.targets = new Set([{
      actor: icon(3)
    }])
    return checkTargetMarks(rollData({
      itemUuid: 'Actor.target.Item.file'
    }), formatDevice, hacker())
  }
  afterEach(() => {
    delete globalThis.fromUuidSync
  })

  // A file names its own marks: those on its host do not count (SR5 p. 240)
  for (const [where, roll, key] of [['the sheet', fromSheet, 'SR5.NotEnoughMarksOnTarget'], ['the crown', fromCrown, 'SR5.NotEnoughMarksOnTarget'],
    ['a file', onFile, 'SR5.NotEnoughMarksOnFile']]) {
    it(`book: refused from ${where}`, async () => {
      expect(await roll()).toBe(false)
      expect(ui.notifications.info).toHaveBeenCalledWith(key)
    })
    it(`lifted: goes from ${where}, the gamemaster hears of it`, async () => {
      lift()
      expect(await roll()).toBe(true)
      await flush()
      expect(ui.notifications.info).not.toHaveBeenCalled()
      expect(matrixKeys()).toEqual([key])
    })
  }
  it('with the marks, nothing to tell', async () => {
    lift()
    game.user.targets = new Set([{
      actor: icon(3)
    }])
    expect(await checkTargetMarks(rollData(), formatDevice, hacker())).toBe(true)
    await flush()
    expect(emits).toEqual([])
  })
})

describe('the radial menu of the crown', () => {
  const sheet = {
    actor: {
      system: {
        matrix: {
          actions: {
            formatDevice: {
              neededMarks: 3
            }, jackOut: {
              neededMarks: 4
            }
          }
        }
      }
    }
  }
  const gun = {
    uuid: 'Actor.guard.Item.gun', kind: 'slave', itemType: 'itemWeapon', ownerIds: ['guard'], mode: 'active', viewerMarks: 0
  }
  const graph = {
    master: 'commlink', viewer: {
      ids: [HACKER], hasAntenna: true
    }, nodes: []
  }
  it('book: an action at 3 marks is greyed out with no mark', () => {
    const entry = menuEntries(gun, graph, sheet).actions.find(a => a.key === 'formatDevice')
    expect(entry).toMatchObject({
      enabled: false, reason: 'marks', needed: 3, marks: 0
    })
  })
  it('lifted: it is enabled again, its reason kept as a hint', () => {
    const entry = menuEntries(gun, graph, sheet, {
      ruleLocked: false
    }).actions.find(a => a.key === 'formatDevice')
    expect(entry).toMatchObject({
      enabled: true, reason: 'marks', needed: 3, marks: 0
    })
  })
  it('lifted: the owner\'s actions and Resonance too, never a device switched off or an action the sheet lacks', () => {
    expect(actionState({
      neededMarks: 4, marks: 0, ruleLocked: false
    }).enabled).toBe(true)
    expect(actionState({
      neededMarks: 0, canTry: false, ruleLocked: false
    }).enabled).toBe(true)
    expect(actionState({
      neededMarks: 0, hasAntenna: false, ruleLocked: false
    }).enabled).toBe(false)
    expect(actionState({
      neededMarks: 0, known: false, ruleLocked: false
    }).enabled).toBe(false)
  })
  it('the menu reads the family of the world (the gamemaster spared by the world: idea 11, ruleLockBinds)', () => {
    const source = fs.readFileSync('modules/canvas/pan-crown/pan-radial-menu.js', 'utf8')
    // (lot 19: the node is given with the spider's four marks, withAdministratorMarks)
    expect(source).toMatch(/menuEntries\(withAdministratorMarks\(node, viewer\?\.actor\), graph, viewer, \{[\s\S]{0,300}ruleLocked: ruleLockBinds\("matrix"\)/)
  })
})

describe('a reboot under link-lock (SR5 p. 231, 244)', () => {
  const reboot = () => {
    const actor = {
      id: 'a1', type: 'actorPc', name: 'Hackeuse', items: [{
        type: 'itemDevice', system: {
          isActive: true
        }
      }],
      system: {
        matrix: {
          isLinkLocked: true
        }
      },
      rebootDeck: vi.fn(async () => {}),
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      get: () => actor
    })
    return ActorSheetSR5.prototype._onRebootDeck.call(sheet, {
      preventDefault(){}
    }).then(() => actor)
  }
  it('book: refused', async () => {
    const actor = await reboot()
    expect(actor.rebootDeck).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_RebootLinkLocked')
  })
  it('lifted: the device reboots, the gamemaster hears of it', async () => {
    lift()
    const actor = await reboot()
    expect(actor.rebootDeck).toHaveBeenCalled()
    await flush()
    expect(matrixKeys()).toEqual(['SR5.WARN_RebootLinkLocked'])
  })
})

describe('a full PAN, Device Rating x 3 (SR5 p. 233)', () => {
  const fullActor = () => ({
    id: 'pc', name: 'Hackeuse', isToken: false, system: {
      matrix: {
        pan: {
          current: 3, max: 3
        }, potentialPanObject: {
        }
      }
    }
  })
  const fromSheet = () => {
    globalThis.foundry.applications.handlebars = {
      renderTemplate: vi.fn(async () => {
        throw new Error('past the guard')
      })
    }
    const actor = fullActor()
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      get: () => actor
    })
    game.actors = []
    return ActorSheetSR5.prototype._onAddItemToPan.call(sheet, {
    })
  }
  it('book: the sheet refuses a fourth device', async () => {
    await fromSheet()
    expect(foundry.applications.handlebars.renderTemplate).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.INFO_PanFullOf')
  })
  it('lifted: the sheet offers it, the gamemaster hears of it', async () => {
    lift()
    await expect(fromSheet()).rejects.toThrow('past the guard')
    await flush()
    expect(matrixKeys()).toEqual(['SR5.INFO_PanFullOf'])
  })

  // The player's request, checked again by the active gamemaster (entityActor-helpers.js)
  const request = () => {
    const users = {
      gm: {
        id: 'gm', isGM: true
      }, owner: {
        id: 'owner', isGM: false
      }
    }
    game.user = users.gm
    game.users = {
      get: id => users[id], activeGM: users.gm
    }
    const master = {
      ...fullActor(), type: 'actorPc', hasPlayerOwner: true, testUserPermission: u => !!u && (u.isGM || u.id === 'owner'),
    }
    master.system.matrix.potentialPanObject = {
      gears: {
        'Actor.pc.Item.g4': 'Lunettes'
      }
    }
    const gear = {
      uuid: 'Actor.pc.Item.g4', documentName: 'Item', parent: master
    }
    globalThis.fromUuid = async uuid => (uuid === gear.uuid ? gear : null)
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(master)
    const add = vi.spyOn(SR5_ActorHelper, 'addItemtoPan').mockResolvedValue()
    return SR5_ActorHelper._socketAddItemToPan({
      data: {
        targetItem: gear.uuid, actorId: 'pc'
      }
    }, 'owner').then(() => add)
  }
  afterEach(() => {
    delete globalThis.fromUuid
  })
  it('book: the gamemaster refuses the request of a full PAN', async () => {
    expect(await request()).not.toHaveBeenCalled()
  })
  it('lifted: the gamemaster slaves it', async () => {
    lift()
    expect(await request()).toHaveBeenCalledWith('Actor.pc.Item.g4', 'pc')
  })
  it('the crown goes through the same family', () => {
    const source = fs.readFileSync('modules/canvas/pan-crown/pan-radial-menu.js', 'utf8')
    expect(source).toMatch(/Number\(pan\.max\) && refuseByRule\("matrix", "SR5\.INFO_PanFullOf"/)
  })
})

describe('Emulate past Depth (Data Trails p. 159)', () => {
  const emulate = value => {
    const input = {
      value: 0
    }
    const dialogData = {
      matrix: {
        emulateMax: 3, emulateRequired: false, emulateAttributeValue: 0
      }, dicePool: {
        modifiers: []
      }, limit: {
        modifiers: {
        }
      }
    }
    const dialog = {
      limitModifier: {
      }, updateDicePoolValue(){}, updateLimitValue(){}
    }
    const html = {
      querySelector: () => input
    }
    SR5_RollDialog.prototype._applyEmulateRating.call(dialog, html, dialogData, value, hacker())
    return dialogData
  }
  it('book: the rating is brought back to Depth', () => {
    expect(emulate(5).matrix.emulateRating).toBe(3)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_EmulateMaxDepth')
  })
  it('lifted: the rating entered is kept, the dice follow it', async () => {
    lift()
    const data = emulate(5)
    expect(data.matrix.emulateRating).toBe(5)
    expect(data.dicePool.modifiers.find(m => m.type === 'emulate').value).toBe(-3)
    await flush()
    expect(matrixKeys()).toEqual(['SR5.WARN_EmulateMaxDepth'])
  })
})

describe('I Am the Firewall and Intervene (Kill Code p. 43-44)', () => {
  const allies = () => [{
    name: 'Alliée 1'
  }, {
    name: 'Alliée 2'
  }]
  const support = method => {
    game.user.targets = new Set(allies().map(actor => ({
      actor
    })))
    vi.spyOn(SR5_MatrixHelpers, '_defenseBonusEffect').mockReturnValue({
    })
    const onAlly = vi.spyOn(SR5_MatrixHelpers, '_createEffectOnAlly').mockResolvedValue()
    onAlly.mockClear()
    const source = {
      id: 'a1', name: 'Hackeuse', system: {
        matrix: {
          attributes: {
            dataProcessing: {
              value: 1
            }
          }
        }
      }
    }
    return SR5_MatrixHelpers[method]({
      roll: {
        hits: 2
      }, owner: {
      }
    }, {
    }, source).then(() => onAlly)
  }
  it('book: past Data Processing, and on two allies, nobody gets the dice', async () => {
    expect(await support('applyIAmTheFirewallEffect')).not.toHaveBeenCalled()
    expect(await support('applyInterveneEffect')).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_IAmTheFirewallTooManyTargets')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_InterveneSingleTarget')
  })
  it('lifted: every ally gets them, the gamemaster hears of it', async () => {
    lift()
    expect(await support('applyIAmTheFirewallEffect')).toHaveBeenCalledTimes(2)
    expect(await support('applyInterveneEffect')).toHaveBeenCalledTimes(2)
    await flush()
    expect(matrixKeys()).toEqual(['SR5.WARN_IAmTheFirewallTooManyTargets', 'SR5.WARN_InterveneSingleTarget'])
  })
})

describe('a Snoop without mark (SR5 p. 241)', () => {
  const camera = () => ({
    id: 'cam', name: 'Caméra', type: 'actorDevice', system: {
    }, statuses: new Set(), items: [{
      type: 'itemDevice', system: {
        isActive: true, marks: []
      }
    }],
  })
  const snoop = () => {
    const cam = camera()
    const tokenDocument = {
      uuid: 'Scene.s.Token.cam', actor: cam
    }
    cam.isToken = true
    cam.token = tokenDocument
    const set = vi.spyOn(SR5SharedVision, 'setViewer').mockResolvedValue()
    return SR5SharedVision.startSnoop(cam, HACKER).then(started => ({
      started, set
    }))
  }
  const entry = {
    userId: 'p1', source: 'snoop', markOwnerId: HACKER
  }
  it('book: no mark, no picture', async () => {
    const {
      started, set
    } = await snoop()
    expect(started).toBe(false)
    expect(set).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.SharedVisionNoMark')
    expect(isViewerStillValid(entry, camera())).toBe(false)
  })
  it('lifted: the Snoop starts and lasts, the gamemaster hears of it', async () => {
    lift()
    const {
      started, set
    } = await snoop()
    expect(started).toBe(true)
    expect(set).toHaveBeenCalled()
    expect(isViewerStillValid(entry, camera())).toBe(true)
    expect(isViewerRequestAllowed({
      actor: camera(), entry, senderId: 'p1', senderOwns: () => true, getActor: () => hacker()
    })).toBe(true)
    await flush()
    expect(matrixKeys()).toEqual(['SR5.SharedVisionNoMark'])
  })
})
