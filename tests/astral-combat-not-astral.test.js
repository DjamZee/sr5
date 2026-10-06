import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

globalThis.CONFIG ??= {
}
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_PrepareRollHelper
} = await import('../modules/rolls/roll-prepare-helpers.js')
const SR5_GetRollData = await import('../modules/rolls/roll-prepare-case/index.js')

// M5 M1 (mesuré par Elsa, 06/10) : combat astral sans vision astrale : la notification partait, puis
// « Cannot read properties of undefined (reading 'target') » dans roll-prepare.js.

const actor = {
  type: 'actorPc', name: 'Mage', items: [], system: {
  }
}

beforeEach(() => {
  globalThis.game ??= {
  }
  game.user = {
    targets: new Set()
  }
  game.i18n = {
    localize: k => k, format: k => k
  }
  game.settings = {
    get: () => false
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(actor)
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
    systemRules: {
    }
  })
})

describe('M5 M1 : combat astral hors de la vision astrale', () => {
  it("s'arrête sur la notification, sans erreur", async () => {
    // The skill case refuses (returns nothing), as it does out of astral perception
    const skill = vi.spyOn(SR5_GetRollData, 'skill').mockResolvedValue(undefined)
    await expect(SR5_PrepareRollTest.rollTest(actor, 'skill', 'astralCombat')).resolves.toBeUndefined()
    expect(skill).toHaveBeenCalled()
  })
})
