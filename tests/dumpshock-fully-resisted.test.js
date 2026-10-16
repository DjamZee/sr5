import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const dumpshockEffect = vi.fn()
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    updateChatButtonHelper: vi.fn(),
    generateChatButton: (...args) => args,
  },
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
    getRealActorFromID: () => ({
      system: {
      }
    }),
  },
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
    getCombatantFromActor: () => null
  },
}))
vi.mock('../modules/entities/actors/entityActor-helpers.js', () => ({
  SR5_ActorHelper: {
    dumpshockEffect: (...args) => dumpshockEffect(...args)
  },
}))
vi.mock('../modules/rolls/roll-helpers/combat.js', () => ({
  SR5_CombatHelpers: {
  },
}))

const {
  default: resistanceInfo
} = await import('../modules/rolls/roll-test-case/test-Resistance.js')

const card = (typeSub, hits) => ({
  previousMessage: {
  },
  test: {
    typeSub
  },
  damage: {
    base: 6, type: "physical", toxin: {
    }
  },
  roll: {
    hits
  },
  combat: {
    calledShot: {
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

// Noé, 16/10 (D3): SR5 p. 231, the character is "also disoriented" by dumpshock, whatever the damage. A dumpshock
// resisted down to nothing gave no disorientation: the "No damage" return came before it was set.
describe('dumpshock resisted in full (SR5 p. 231)', () => {
  beforeEach(() => {
    dumpshockEffect.mockClear()
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }, messages: {
        get: () => undefined
      }
    }
  })

  it('still disorients the character', async () => {
    const data = card("dumpshock", 6)
    await resistanceInfo(data, "actor")
    expect(data.chatCard.buttons.actionEnd).toBeDefined()
    expect(dumpshockEffect).toHaveBeenCalledOnce()
    expect(dumpshockEffect).toHaveBeenCalledWith("actor")
  })

  it('disorients once when damage is left', async () => {
    await resistanceInfo(card("dumpshock", 2), "actor")
    expect(dumpshockEffect).toHaveBeenCalledOnce()
  })

  it('gives no disorientation to another resistance resisted in full', async () => {
    await resistanceInfo(card("biofeedback", 6), "actor")
    expect(dumpshockEffect).not.toHaveBeenCalled()
  })
})
