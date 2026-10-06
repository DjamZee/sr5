import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const emitForGM = vi.fn()
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: (...args) => emitForGM(...args),
  },
}))

const {
  firstAidPatient, patientMonitors, hasSingleMonitor
} = await import('../modules/rolls/roll-helpers/cardRoller.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  skillInfo
} = await import('../modules/rolls/roll-test-case/index.js')

// Prepared monitors: Physical and Stun, or the single condition monitor (grunt, AI core, homunculus, watcher)
const TWO_MONITORS = ['physical', 'stun', 'condition']
const SINGLE_MONITOR = ['condition']

/** An actor that can be healed or damaged, owned by the active user unless told otherwise */
function makeActor(id, type, monitors, owned = true) {
  return {
    id, type, isToken: false,
    system: {
      conditionMonitors: Object.fromEntries(monitors.map(m => [m, {
        actual: {
          value: 0
        }
      }]))
    },
    testUserPermission: () => owned,
    takeDamage: vi.fn(),
  }
}

const healer = makeActor('healer', 'actorPc', TWO_MONITORS)
const pcPatient = makeActor('pcPatient', 'actorPc', TWO_MONITORS)
const npcPatient = makeActor('npcPatient', 'actorGrunt', SINGLE_MONITOR, false)
const selected = makeActor('selected', 'actorPc', TWO_MONITORS)
const spiritPatient = makeActor('spiritPatient', 'actorSpirit', ['physical', 'stun'], false)
const aiPatient = makeActor('aiPatient', 'actorPc', SINGLE_MONITOR, false)
const watcherPatient = makeActor('watcherPatient', 'actorSpirit', SINGLE_MONITOR, false)
// N42: a device has only a Matrix monitor, a drone a condition monitor that is its structure
const devicePatient = makeActor('devicePatient', 'actorDevice', ['matrix'], false)
const dronePatient = makeActor('dronePatient', 'actorDrone', ['condition', 'matrix'], false)
const actors = {
  healer, pcPatient, npcPatient, selected, spiritPatient, aiPatient, watcherPatient, devicePatient, dronePatient
}

let card, speakerToken
function clickButton(action, type) {
  game.messages = new Map([['m1', {
    flags: {
      sr5data: card
    }
  }]])
  const button = {
    dataset: {
      action, type
    },
    closest: () => ({
      dataset: {
        messageId: 'm1'
      }
    }),
  }
  return SR5_RollMessage.chatButtonAction({
    preventDefault: () => {}, currentTarget: button
  })
}

function firstAidCard(targetId) {
  return {
    owner: {
      speakerId: 'healer', actorId: 'healer'
    },
    previousMessage: {
    },
    target: targetId ? {
      hasTarget: true, actorId: targetId
    } : {
      hasTarget: false
    },
    test: {
      typeSub: 'firstAid'
    },
    roll: {
      netHits: 2
    },
    damage: {
      value: 2, type: 'physical'
    },
  }
}

let heal
beforeEach(() => {
  vi.restoreAllMocks()
  emitForGM.mockClear()
  for (const a of Object.values(actors)) a.takeDamage.mockClear()
  game.user = {
    isGM: false
  }
  //A GM is connected to relay what the player does not own
  game.users = [{
    isGM: true, active: true
  }]
  speakerToken = 'selected'
  globalThis.ChatMessage = {
    getSpeaker: () => ({
      token: speakerToken
    })
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn()
    }
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
  vi.spyOn(SR5_CombatHelpers, 'chooseDamageType').mockResolvedValue('physical')
  vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockResolvedValue()
  heal = vi.spyOn(SR5_ActorHelper, 'heal').mockResolvedValue()
})

describe('firstAidPatient (SR5 p. 207)', () => {
  it('is the target when the test had one, the selected token otherwise', () => {
    expect(firstAidPatient(true, 'target', 'selected')).toBe('target')
    expect(firstAidPatient(false, undefined, 'selected')).toBe('selected')
  })

  it('never falls back to the selected token when the target is gone', () => {
    expect(firstAidPatient(true, undefined, 'selected')).toBeUndefined()
  })
})

describe('patientMonitors', () => {
  it('reads the monitors the patient has, whatever its actor type', () => {
    expect(patientMonitors(pcPatient)).toEqual(['physical', 'stun'])
    expect(patientMonitors(spiritPatient)).toEqual(['physical', 'stun'])
    expect(patientMonitors(npcPatient)).toEqual(['condition'])
    expect(patientMonitors(aiPatient)).toEqual(['condition'])
    expect(patientMonitors(undefined)).toEqual([])
    expect(hasSingleMonitor(aiPatient)).toBe(true)
    expect(hasSingleMonitor(spiritPatient)).toBe(false)
  })
})

describe('First aid "Heal" button', () => {
  it('asks Physical or Stun for a targeted spirit with both monitors', async () => {
    card = firstAidCard('spiritPatient')
    await clickButton('nonOpposedTest', 'firstAid')
    expect(SR5_CombatHelpers.chooseDamageType).toHaveBeenCalledTimes(1)
    expect(emitForGM.mock.calls[0][1].targetActor).toBe('spiritPatient')
    expect(emitForGM.mock.calls[0][1].healData.test.typeSub).toBe('physical')
  })

  it('heals the single condition monitor of an AI or a watcher without asking', async () => {
    for (const id of ['aiPatient', 'watcherPatient']) {
      emitForGM.mockClear()
      card = firstAidCard(id)
      await clickButton('nonOpposedTest', 'firstAid')
      expect(emitForGM.mock.calls[0][1].targetActor).toBe(id)
      expect(emitForGM.mock.calls[0][1].healData.test.typeSub).toBe('condition')
    }
    expect(SR5_CombatHelpers.chooseDamageType).not.toHaveBeenCalled()
  })

  it('heals the targeted PC, not the healer who owns the card', async () => {
    card = firstAidCard('pcPatient')
    await clickButton('nonOpposedTest', 'firstAid')
    expect(heal).toHaveBeenCalledTimes(1)
    expect(heal.mock.calls[0][0]).toBe('pcPatient')
    expect(heal.mock.calls[0][1].test.typeSub).toBe('physical')
  })

  it('heals the targeted NPC on its condition monitor, through the GM when the player does not own it', async () => {
    card = firstAidCard('npcPatient')
    await clickButton('nonOpposedTest', 'firstAid')
    expect(SR5_CombatHelpers.chooseDamageType).not.toHaveBeenCalled()
    expect(heal).not.toHaveBeenCalled()
    expect(emitForGM).toHaveBeenCalledWith('heal', {
      targetActor: 'npcPatient',
      healData: {
        test: {
          typeSub: 'condition'
        }, roll: {
          netHits: 2
        }
      },
      // The GM reads the card again from the chat log (security pass, Olympe)
      messageId: 'm1',
    })
  })

  it('heals the selected token when the test had no target', async () => {
    card = firstAidCard()
    await clickButton('opposedTest', 'firstAid')
    expect(heal.mock.calls[0][0]).toBe('selected')
  })

  it('heals nothing when the damage type dialog is cancelled', async () => {
    SR5_CombatHelpers.chooseDamageType.mockResolvedValue(undefined)
    card = firstAidCard('pcPatient')
    await clickButton('nonOpposedTest', 'firstAid')
    expect(heal).not.toHaveBeenCalled()
    expect(SR5_RollMessage.updateChatButtonHelper).not.toHaveBeenCalled()
  })
})

describe('First aid critical glitch "Apply" button', () => {
  it('does not ask a damage type again for a patient with a single condition monitor', async () => {
    card = firstAidCard('aiPatient')
    card.damage.type = undefined
    await clickButton('nonOpposedTest', 'damage')
    expect(SR5_CombatHelpers.chooseDamageType).not.toHaveBeenCalled()
    expect(aiPatient.takeDamage).toHaveBeenCalledTimes(1)
    expect(card.damage.type).toBe('condition')
  })

  it('still asks it for a patient with Physical and Stun', async () => {
    card = firstAidCard('spiritPatient')
    card.damage.type = undefined
    await clickButton('nonOpposedTest', 'damage')
    expect(SR5_CombatHelpers.chooseDamageType).toHaveBeenCalledTimes(1)
    expect(spiritPatient.takeDamage).toHaveBeenCalledTimes(1)
  })

  it('damages the targeted patient, not the healer', async () => {
    card = firstAidCard('npcPatient')
    await clickButton('nonOpposedTest', 'damage')
    expect(npcPatient.takeDamage).toHaveBeenCalledTimes(1)
    expect(healer.takeDamage).not.toHaveBeenCalled()
  })

  it('damages the selected token when the test had no target, without crashing', async () => {
    card = firstAidCard()
    await clickButton('opposedTest', 'damage')
    expect(selected.takeDamage).toHaveBeenCalledTimes(1)
    expect(SR5_RollMessage.updateChatButtonHelper).toHaveBeenCalledWith('m1', 'damage', 'physical')
  })
})

describe('First aid critical glitch card', () => {
  /** A critical glitch card on the given target, its 1D3 rolling a 2 */
  async function criticalCard(targetId) {
    globalThis.Roll = class {
      async evaluate() {
        this.total = 2
        return this
      }
    }
    const card = {
      chatCard: {
        buttons: {
        }
      },
      owner: {
        actorId: 'healer'
      },
      target: targetId ? {
        hasTarget: true, actorId: targetId
      } : {
        hasTarget: false
      },
      test: {
        typeSub: 'firstAid'
      },
      damage: {
      },
      roll: {
        hits: 0, criticalGlitchRoll: true
      },
    }
    await skillInfo(card)
    return card
  }

  it('asks no damage type when the targeted patient has a single condition monitor', async () => {
    const card = await criticalCard('aiPatient')
    expect(SR5_CombatHelpers.chooseDamageType).not.toHaveBeenCalled()
    expect(card.damage.type).toBe('condition')
  })

  it('still asks it for a target with Physical and Stun, or without a target', async () => {
    await criticalCard('spiritPatient')
    await criticalCard()
    expect(SR5_CombatHelpers.chooseDamageType).toHaveBeenCalledTimes(2)
  })

  it('offers no 1D3 on a targeted device or drone (SR5 p. 150)', async () => {
    for (const id of ['devicePatient', 'dronePatient']) {
      const card = await criticalCard(id)
      expect(card.chatCard.buttons.damage).toBeUndefined()
      expect(card.chatCard.buttons.actionEnd).toBeDefined()
    }
    expect(SR5_CombatHelpers.chooseDamageType).not.toHaveBeenCalled()
  })
})

describe('First aid on a device (N42)', () => {
  it('a device or a drone is no patient', () => {
    expect(patientMonitors(devicePatient)).toEqual([])
    expect(patientMonitors(dronePatient)).toEqual([])
  })

  it('the 1D3 button damages neither, and asks no damage type', async () => {
    for (const id of ['devicePatient', 'dronePatient']) {
      card = {
        ...firstAidCard(id), damage: {
          value: 2
        }
      }
      await clickButton('nonOpposedTest', 'damage')
    }
    expect(devicePatient.takeDamage).not.toHaveBeenCalled()
    expect(dronePatient.takeDamage).not.toHaveBeenCalled()
    expect(SR5_CombatHelpers.chooseDamageType).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledTimes(2)
  })

  it('heals neither', async () => {
    card = firstAidCard('dronePatient')
    await clickButton('nonOpposedTest', 'firstAid')
    expect(heal).not.toHaveBeenCalled()
    expect(emitForGM).not.toHaveBeenCalled()
  })
})
