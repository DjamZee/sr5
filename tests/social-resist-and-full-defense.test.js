import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  default: skill
} = await import('../modules/rolls/roll-prepare-case/rollData-Skill.js')
const {
  skillInfo
} = await import('../modules/rolls/roll-test-case/index.js')
const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

const mod = (source, type, value) => ({
  source, type, value
})
// A skill as the sheet prepares it, with its own limit
const skillOf = (attribute, rating, limitType, limitValue) => ({
  linkedAttribute: 'charisma',
  rating: {
    value: rating
  },
  test: {
    modifiers: [mod('Attr', 'linkedAttribute', attribute), mod('Skill', 'skillRating', rating)]
  },
  limit: {
    value: limitValue, base: limitType, modifiers: []
  },
})
const target = {
  id: 'target', type: 'actorPc', name: 'Cible', effects: [],
  system: {
    attributes: {
      charisma: {
        augmented: {
          value: 4
        }
      },
      willpower: {
        augmented: {
          value: 3
        }
      },
    },
    limits: {
      socialLimit: {
        value: 5
      }
    },
    skills: {
      con: skillOf(4, 2, 'socialLimit', 5),
      negotiation: skillOf(4, 2, 'socialLimit', 5),
      leadership: skillOf(3, 2, 'socialLimit', 5),
      perception: skillOf(4, 2, 'mentalLimit', 6),
      intimidation: skillOf(4, 2, 'socialLimit', 5),
      performance: skillOf(4, 2, 'socialLimit', 5),
    },
  },
}
const rollData = () => ({
  test: {
  },
  dicePool: {
    composition: [], modifiers: []
  },
  limit: {
    modifiers: {
    }
  },
  threshold: {
    value: 0, type: null
  },
  combat: {
    actions: []
  },
  dialogSwitch: {
  },
  target: {
  },
  magic: {
  },
})
const resist = (typeSub, rollKey) => skill(rollData(), 'skillDicePool', rollKey, target, {
  test: {
    isOpposed: true, typeSub
  },
  roll: {
    hits: 2
  },
})

describe('Resisting a social test keeps its limit (SR5 p. 141-143)', () => {
  it.each([
    ['con', 'con'],
    ['negotiation', 'negotiation'],
    ['leadership', 'leadership'],
  ])('%s: Social limit', async (typeSub, rollKey) => {
    const data = await resist(typeSub, rollKey)
    expect(data.limit.base).toBe(5)
  })

  it('impersonation: Perception + Intuition [Mental]', async () => {
    const data = await resist('impersonation', 'perception')
    expect(data.limit.base).toBe(6)
  })

  it('etiquette: Perception + Charisma [Social]', async () => {
    const data = await resist('etiquette', 'perception')
    expect(data.limit.base).toBe(5)
    expect(data.limit.type).toBe('socialLimit')
  })

  it.each(['intimidation', 'performance'])('%s: Charisma + Willpower, no limit', async typeSub => {
    const data = await resist(typeSub, typeSub)
    expect(data.limit.base).toBe(0)
  })
})

describe('The resistance card ends the opposed test', () => {
  beforeEach(() => {
    SR5_EntityHelpers.getRealActorFromID = () => target
  })
  const card = (typeSub, hits, data) => ({
    owner: {
      actorId: 'target'
    },
    target: {
    },
    test: {
      typeSub, ...data.test
    },
    threshold: data.threshold,
    roll: {
      hits
    },
    chatCard: {
      buttons: {
      }
    },
  })

  it.each([
    ['leadership', 'leadership'],
    ['intimidation', 'intimidation'],
    ['performance', 'performance'],
    ['con', 'con'],
    ['negotiation', 'negotiation'],
    ['etiquette', 'perception'],
  ])('%s: a resistance with hits never offers "Resist" again', async (typeSub, rollKey) => {
    const data = await resist(typeSub, rollKey)
    for (const hits of [1, 2, 3]){
      const cardData = card(typeSub, hits, data)
      await skillInfo(cardData)
      expect(cardData.chatCard.buttons.con).toBeUndefined()
      expect(cardData.chatCard.buttons.actionEnd?.label).toBe(hits >= 2 ? 'SR5.SuccessfulDefense' : 'SR5.FailedDefense')
    }
  })

  it('the actor\'s own roll still offers "Resist"', async () => {
    const cardData = card('leadership', 2, {
      test: {
      }, threshold: {
        value: 0, type: null
      }
    })
    await skillInfo(cardData)
    expect(cardData.chatCard.buttons.con).toBeDefined()
    expect(cardData.chatCard.buttons.actionEnd).toBeUndefined()
  })
})

describe('Full defense costs 10 initiative (SR5 p. 170, 189)', () => {
  let effect, init
  beforeEach(() => {
    vi.restoreAllMocks()
    effect =vi.spyOn(SR5_CombatHelpers, 'applyFullDefenseEffect').mockImplementation(() => {})
    init = vi.spyOn(SR5Combat, 'changeInitInCombatHelper').mockImplementation(() => {})
  })
  const dialog = (modifiers, activeDefenseSelected = 'none') => ({
    dicePool: {
      modifiers
    },
    combat: {
      activeDefenseSelected
    },
  })
  const fullDefense = mod(undefined, undefined, 3)
  fullDefense.type = 'fullDefense'

  it('the checked box (an array entry) applies the effect and -10', () => {
    SR5_RollTest.applyDefenseStance(dialog([fullDefense]), target)
    expect(effect).toHaveBeenCalledWith(target)
    expect(init).toHaveBeenCalledWith('target', -10)
  })

  it('full defense and a dodge: -15', () => {
    SR5_RollTest.applyDefenseStance(dialog([fullDefense], 'dodge'), target)
    expect(init).toHaveBeenCalledWith('target', -15)
  })

  it('already in full defense: nothing more to pay', () => {
    const inDefense = {
      ...target, effects: [{
        origin: 'fullDefense'
      }]
    }
    SR5_RollTest.applyDefenseStance(dialog([fullDefense]), inDefense)
    expect(effect).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
  })

  it('the dialog checks the combined cost: 12 refuses full defense + parry, 20 allows it', async () => {
    const {
      default: SR5_RollDialog
    } = await import('../modules/rolls/roll-dialog.js')
    globalThis.ui.notifications = {
      warn: vi.fn()
    }
    globalThis.game.combat = {
    }
    let initiative = 12
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockImplementation(() => ({
      initiative
    }))
    const cost = SR5_RollDialog.defenseStanceCost(target, true, 'parryClubs')
    expect(cost).toBe(15)
    expect(SR5_RollDialog.hasInitiativeForInterruption(target, cost)).toBe(false)
    expect(SR5_RollDialog.hasInitiativeForInterruption(target, SR5_RollDialog.defenseStanceCost(target, false, 'parryClubs'))).toBe(true)
    initiative = 20
    expect(SR5_RollDialog.hasInitiativeForInterruption(target, cost)).toBe(true)
    // Already in full defense: only the parry is paid
    expect(SR5_RollDialog.defenseStanceCost({
      effects: [{
        origin: 'fullDefense'
      }]
    }, true, 'parryClubs')).toBe(5)
    delete globalThis.game.combat
  })

  it('no box, no active defense: nothing', () => {
    SR5_RollTest.applyDefenseStance(dialog([mod('Wounds', 'condition', -1)]), target)
    expect(effect).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
  })
})
