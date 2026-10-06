import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes CONFIG.statusEffects while it is being imported
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
const {
  SR5_Toxins
} = await import('../modules/entities/items/toxins.js')

// G2 (decision of DjamZ, 06/10): under Blight "les sorts ne peuvent être lancés" (Better Than Bad p. 141).
// Magic already drops to 0; before this the spell still rolled on the skill alone.
const blight = {
  type: 'itemEffect', system: {
    type: 'toxinEffectManasphereCut'
  }
}
const other = {
  type: 'itemEffect', system: {
    type: 'toxinEffectArcaneInhibitor'
  }
}
const mage = items => ({
  type: 'actorPc', items, system: {
  }
})

beforeEach(() => {
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
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
    systemRules: {
    }
  })
})

describe('Blight blocks spellcasting (G2, BTB p. 141)', () => {
  it('reads the Blight effect on the actor', () => {
    expect(SR5_Toxins.isCutFromManasphere(mage([blight]))).toBe(true)
    expect(SR5_Toxins.isCutFromManasphere(mage([other]))).toBe(false)
    expect(SR5_Toxins.isCutFromManasphere(mage([]))).toBe(false)
    expect(SR5_Toxins.isCutFromManasphere(null)).toBe(false)
  })

  it('refuses to cast a spell under Blight', async () => {
    const actor = mage([blight])
    vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(actor)
    await SR5_PrepareRollTest.rollTest(actor, 'spell', null)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BlightNoSpell')
  })

  it('lets a spell through without Blight', async () => {
    const actor = mage([other])
    vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(actor)
    // Past the guard the roll goes on: stop it at its first step
    game.user.targets = new Set([{
      actor: {
      }
    }])
    vi.spyOn(SR5_PrepareRollHelper, 'getTargetData').mockRejectedValue(new Error('past the guard'))
    await expect(SR5_PrepareRollTest.rollTest(actor, 'spell', null)).rejects.toThrow('past the guard')
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })
})
