import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Rigging R3: a rigger is ejected from the vehicle he is jumped into when it is destroyed or bricked, or when the
// commlink or RCC he uses is bricked: dumpshock, then the vehicle is out of control until the start of the next
// Combat Turn, when its autopilot takes over (SR5 p. 268, 271).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
    emitForPlayer: vi.fn(),
  },
}))
const {
  SR5_SocketHandler
} = await import('../modules/socket.js')

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  _test, dronesJumpedInBy
} = await import('../modules/system/rigger-ejection.js')
const {
  monitorFull, ejectionOver
} = await import('../modules/system/rigging-rules.js')

function monitor(max, damage = 0) {
  return {
    value: max, base: max, modifiers: [], actual: {
      value: damage, base: damage, modifiers: []
    }
  }
}

function rigger(userMode = 'hotsim') {
  return {
    id: 'r1', type: 'actorPc', name: 'Rigger',
    system: {
      activeSpecialAttribute: 'magic', matrix: {
        userMode
      }
    },
    rollTest: vi.fn(),
  }
}

function drone({
  controlMode = 'rigging', pilot = 3, damage = 0, effects = []
} = {
}) {
  const actor = {
    id: 'd1', uuid: 'Actor.d1', type: 'actorDrone', name: 'Drone', effects,
    system: {
      type: 'drone', controlMode, vehicleOwner: {
        id: 'r1'
      },
      attributes: {
        pilot: {
          augmented: {
            value: pilot
          }
        }
      },
      conditionMonitors: {
        condition: monitor(8, damage), matrix: monitor(9),
      },
    },
    toObject: () => JSON.parse(JSON.stringify({
      type: 'actorDrone', system: actor.system
    })),
    update: vi.fn(async () => {}),
    createEmbeddedDocuments: vi.fn(async () => {}),
    deleteEmbeddedDocuments: vi.fn(async () => {}),
  }
  return actor
}

function hit(value) {
  return {
    damage: {
      value, type: 'physical', matrix: {
        value: 0
      }
    },
    combat: {
      ammo: {
      }
    },
    threshold: {
    },
    owner: {
      messageId: 'm1'
    },
  }
}

const dumpshockCards = r => r.rollTest.mock.calls.filter(([type, , data]) => type === 'resistanceCard' && data.damage.resistanceType === 'dumpshock')

let actors
beforeEach(() => {
  vi.restoreAllMocks()
  actors = {
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
  vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    damage: {
    }, owner: {
    }
  }))
  globalThis.ChatMessage = {
    create: vi.fn(async () => {}), getSpeaker: () => ({
    })
  }
  game.user = {
    id: 'gm', isGM: true
  }
  game.users = {
    activeGM: {
      id: 'gm'
    }
  }
  game.combat = {
    id: 'c1', round: 2, started: true
  }
  game.scenes = []
})

describe('the rules', () => {
  it('a monitor is full once its boxes reach its size, never without a size', () => {
    expect(monitorFull(monitor(8, 8))).toBe(true)
    expect(monitorFull(monitor(8, 7))).toBe(false)
    expect(monitorFull(monitor(0, 0))).toBe(false)
  })

  it('the autopilot takes over at the next Combat Turn of the same encounter, if the vehicle has one', () => {
    const mark = {
      combatId: 'c1', round: 2
    }
    expect(ejectionOver(mark, {
      id: 'c1', round: 2
    }, 3)).toBe(false)
    expect(ejectionOver(mark, {
      id: 'c1', round: 3
    }, 3)).toBe(true)
    expect(ejectionOver(mark, {
      id: 'c2', round: 5
    }, 3)).toBe(false)
    expect(ejectionOver(mark, {
      id: 'c1', round: 3
    }, 0)).toBe(false)
  })
})

describe('a drone destroyed under its jumped in rigger (SR5 p. 268, 271)', () => {
  it('sends the dumpshock card to the rigger and leaves the drone out of control, on autopilot', async () => {
    const r = rigger(), d = drone({
      damage: 5
    })
    actors = {
      r1: r, d1: d
    }
    game.actors = [d, r]
    await SR5_ActorHelper.takeDamage('d1', hit(4))
    expect(dumpshockCards(r)).toHaveLength(1)
    expect(d.update).toHaveBeenCalledWith({
      'system.controlMode': 'autopilot'
    }, {
      sr5Ejection: true
    })
    const [effect] = d.createEmbeddedDocuments.mock.calls[0][1]
    expect(effect.statuses).toContain('noAction')
    expect(effect.flags.sr5.ejection).toEqual({
      combatId: 'c1', round: 2
    })
  })

  it('a rigger whose sheet says AR is shocked all the same: a jumped in rigger is in VR', async () => {
    const r = rigger('ar'), d = drone({
      damage: 7
    })
    actors = {
      r1: r, d1: d
    }
    await SR5_ActorHelper.takeDamage('d1', hit(2))
    expect(dumpshockCards(r)).toHaveLength(1)
  })

  it('the dumpshock is rolled by the player of the rigger, not on the GM\'s screen', async () => {
    const r = rigger(), d = drone({
      damage: 7
    })
    r.hasPlayerOwner = true
    actors = {
      r1: r, d1: d
    }
    const player = {
      id: 'p1', isGM: false
    }
    vi.spyOn(SR5_EntityHelpers, 'getUserOwner').mockReturnValue(player)
    SR5_SocketHandler.emitForPlayer.mockClear()
    await SR5_ActorHelper.takeDamage('d1', hit(4))
    const sent = SR5_SocketHandler.emitForPlayer.mock.calls.find(([type, data]) => type === 'actorRoll' && data.chatData.damage.resistanceType === 'dumpshock')
    expect(sent?.[1].actorId).toBe('r1')
    expect(sent?.[2]).toBe('p1')
    expect(dumpshockCards(r)).toHaveLength(0)
  })

  it('a drone damaged but not destroyed keeps its rigger', async () => {
    const r = rigger(), d = drone()
    actors = {
      r1: r, d1: d
    }
    await SR5_ActorHelper.takeDamage('d1', hit(2))
    expect(dumpshockCards(r)).toHaveLength(0)
    expect(d.createEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it('nothing when the rigger is not jumped in (remote control)', async () => {
    const r = rigger(), d = drone({
      controlMode: 'remote', damage: 7
    })
    actors = {
      r1: r, d1: d
    }
    await SR5_ActorHelper.takeDamage('d1', hit(4))
    expect(dumpshockCards(r)).toHaveLength(0)
    expect(d.update.mock.calls.some(([data]) => 'system.controlMode' in data)).toBe(false)
  })

  it('out of combat, the autopilot takes over at once: no out of control status', async () => {
    game.combat = null
    const r = rigger(), d = drone({
      damage: 7
    })
    actors = {
      r1: r, d1: d
    }
    await SR5_ActorHelper.takeDamage('d1', hit(4))
    expect(dumpshockCards(r)).toHaveLength(1)
    expect(d.createEmbeddedDocuments).not.toHaveBeenCalled()
  })
})

describe('the next Combat Turn', () => {
  const ejected = (pilot = 3) => drone({
    controlMode: 'autopilot', pilot, effects: [{
      id: 'e1', flags: {
        sr5: {
          ejection: {
            combatId: 'c1', round: 2
          }
        }
      }
    }]
  })

  it('gives the drone back to its autopilot', async () => {
    const d = ejected()
    game.actors = [d]
    await _test.onCombatRound({
      id: 'c1', round: 3
    }, {
      round: 3
    })
    expect(d.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['e1'])
  })

  it('not before: a new initiative pass of the same turn changes nothing', async () => {
    const d = ejected()
    game.actors = [d]
    await _test.onCombatRound({
      id: 'c1', round: 2
    }, {
      turn: 1
    })
    expect(d.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it('a vehicle without a Pilot rating stays out of control', async () => {
    const d = ejected(0)
    game.actors = [d]
    await _test.onCombatRound({
      id: 'c1', round: 3
    }, {
      round: 3
    })
    expect(d.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it('someone else taking the vehicle ends the status; the ejection itself does not', async () => {
    const d = ejected(0)
    await _test.onDroneUpdated(d, {
      system: {
        controlMode: 'autopilot'
      }
    }, {
      sr5Ejection: true
    })
    expect(d.deleteEmbeddedDocuments).not.toHaveBeenCalled()
    await _test.onDroneUpdated(d, {
      system: {
        controlMode: 'remote'
      }
    }, {
    })
    expect(d.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['e1'])
  })
})

describe('the commlink or RCC of the rigger is bricked (SR5 p. 271)', () => {
  const rcc = (parent, damage = 9) => ({
    type: 'itemDevice', parent, system: {
      conditionMonitors: {
        matrix: monitor(9, damage)
      }
    }
  })
  const bricked = {
    system: {
      isActive: false, conditionMonitors: {
        matrix: {
          actual: {
            base: 9
          }
        }
      }
    }
  }

  it('the drones he is jumped into are lost; the brick already dealt the dumpshock', async () => {
    const r = rigger(), d = drone()
    game.actors = [d, r]
    await _test.onDeviceUpdated(rcc(r), bricked)
    expect(d.update).toHaveBeenCalledWith({
      'system.controlMode': 'autopilot'
    }, {
      sr5Ejection: true
    })
    expect(dumpshockCards(r)).toHaveLength(0)
  })

  it('a rigger whose sheet says AR gets the dumpshock the brick skipped', async () => {
    const r = rigger('ar'), d = drone()
    game.actors = [d, r]
    await _test.onDeviceUpdated(rcc(r), bricked)
    expect(dumpshockCards(r)).toHaveLength(1)
    expect(dumpshockCards(r)[0][2].damage.bricked).toBe(true)
  })

  it('nothing for a rigger who is not jumped in, nor for a device that was not switched off by the brick', async () => {
    const r = rigger(), d = drone({
      controlMode: 'remote'
    })
    game.actors = [d, r]
    await _test.onDeviceUpdated(rcc(r), bricked)
    expect(d.update).not.toHaveBeenCalled()
    const d2 = drone()
    game.actors = [d2, r]
    await _test.onDeviceUpdated(rcc(r, 3), {
      system: {
        isActive: false
      }
    })
    expect(d2.update).not.toHaveBeenCalled()
  })

  it('finds the drones by the rigger actor or by his token', () => {
    const d = drone()
    d.system.vehicleOwner.id = 't1'
    expect(dronesJumpedInBy({
      id: 'r1', token: {
        id: 't1'
      }
    }, [d])).toEqual([d])
    expect(dronesJumpedInBy({
      id: 'r2'
    }, [d])).toEqual([])
  })
})
