import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//The matrix card as a GM wrote it: its reading again is tested in matrix-card.test.js
vi.mock('../modules/rolls/roll-helpers/matrix-card.js', () => ({
  trustedMatrixAction: async chatData => ({
    hits: chatData?.roll?.hits, actionType: chatData?.matrix?.actionType
  }),
  cardStandsFor: async () => true,
  trustedDefenderDamage: async (id, claimed) => claimed,
  damageReachable: () => true,
}))
import fs from 'node:fs'

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

// N91: no wireless matrix action reaches a drone with its wireless off (SR5 p. 424), an IC attack,
// a complex form or a resonance action included. Only a direct connection does (p. 234).
const SOURCE = fs.readFileSync('modules/rolls/roll-prepare-case/rollData-MatrixAction.js', 'utf8')

const ROLLER = {
  type: 'actorPc', system: {
  }
}
const drone = on => ({
  type: 'actorDrone', system: {
    wirelessTurnedOn: on
  }
})

function roll(rollType, targets, chatData){
  game.user.targets = new Set(targets.map(actor => ({
    actor
  })))
  return SR5_PrepareRollTest.rollTest(ROLLER, rollType, null, chatData)
}

beforeEach(() => {
  globalThis.game ??= {
  }
  game.user = {
  }
  game.i18n = {
    localize: k => k
  }
  game.actors = new Map()
  game.scenes = []
  game.settings = {
    get: () => false
  }
  globalThis.canvas = {
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn()
    }
  }
  vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(ROLLER)
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
    systemRules: {
    }
  })
})

describe('other matrix rolls refuse a switched-off drone (N91)', () => {
  for (const rollType of ['iceAttack', 'complexForm', 'resonanceAction']) {
    it(`refuses ${rollType} on a drone with its wireless off`, async () => {
      await roll(rollType, [drone(false)])
      expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetWirelessOff')
    })

    it(`lets ${rollType} through on a drone with its wireless on`, async () => {
      // The roll goes on past the guard: stop it at its first step
      vi.spyOn(SR5_PrepareRollHelper, 'getTargetData').mockRejectedValue(new Error('past the guard'))
      await expect(roll(rollType, [drone(true)])).rejects.toThrow('past the guard')
      expect(ui.notifications.warn).not.toHaveBeenCalled()
    })
  }

  it('refuses an IC attack relaunched from a card whose target is a switched-off drone', async () => {
    game.actors.set('d1', drone(false))
    await roll('iceAttack', [], {
      target: {
        actorId: 'd1'
      }
    })
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetWirelessOff')
  })

  // l. 847: an attack launched with no target selected is defended from its card by the drone itself
  for (const rollType of ['matrixDefense', 'iceDefense', 'complexFormDefense', 'matrixResistance']) {
    it(`refuses ${rollType} rolled by a drone with its wireless off`, async () => {
      SR5_PrepareRollHelper.getRollingActor.mockReturnValue(drone(false))
      await roll(rollType, [], {
        target: {
        }
      })
      expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetWirelessOff')
    })
  }

  it('lets a drone with its wireless on defend', async () => {
    SR5_PrepareRollHelper.getRollingActor.mockReturnValue(drone(true))
    await roll('matrixDefense', [], null).catch(() => {})
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('says in the matrix action guard that it refuses any wireless matrix action', () => {
    expect(SOURCE).toMatch(/no wireless matrix\s*\/\/action reaches it, hacking or not/)
  })
})
