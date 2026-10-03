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
  firstAidPatient
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

/** An actor that can be healed or damaged, owned by the active user unless told otherwise */
function makeActor(id, type, owned = true) {
  return {
    id, type, isToken: false,
    testUserPermission: () => owned,
    takeDamage: vi.fn(),
  }
}

const healer = makeActor('healer', 'actorPc')
const pcPatient = makeActor('pcPatient', 'actorPc')
const npcPatient = makeActor('npcPatient', 'actorGrunt', false)
const selected = makeActor('selected', 'actorPc')
const actors = {
  healer, pcPatient, npcPatient, selected
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

describe('First aid "Heal" button', () => {
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
