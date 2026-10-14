import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import fs from 'fs'

// Lot 19: an action a module offers after another (the chained action of the module Matrice, house rule MREV) is
// rolled through the system's own test, and spends no action

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const prepareCases = await import('../modules/rolls/roll-prepare-case/index.js')

const decker = {
  id: 'd1', type: 'actorPc', name: 'Decker', isOwner: true, items: [],
  system: {
    matrix: {
      noise: {
        value: 0
      },
      attributes: {
        sleaze: {
          value: 4
        }
      },
      actions: {
        snoop: {
          source: 'core', actionType: 'complex', increaseOverwatchScore: true, neededMarks: 1,
          test: {
            modifiers: []
          }, limit: {
            linkedAttribute: 'sleaze', value: 4, modifiers: []
          }
        }
      }
    },
  },
}

const rollData = offered => ({
  test: {
  }, dicePool: {
    modifiers: []
  }, limit: {
  }, matrix: offered ? {
    offeredAction: true
  } : {
  }, dialogSwitch: {
  }, combat: {
    actions: []
  }, target: {
  }, threshold: {
  }, owner: {
  }
})

beforeEach(() => {
  game.user = {
    isGM: true, targets: new Set()
  }
  game.settings.get = vi.fn(() => null)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('an offered Matrix action', () => {
  it('spends the complex action of the book when it is not offered', async () => {
    const data = rollData(false)
    await prepareCases.matrixAction(data, 'snoop', decker)
    expect(data.combat.actions.length).toBe(1)
  })

  it('spends none when a module offers it, and says so in its title', async () => {
    const data = rollData(true)
    const result = await prepareCases.matrixAction(data, 'snoop', decker)
    expect(result).toBe(data)
    expect(data.combat.actions).toEqual([])
    expect(data.test.title).toContain('SR5.MatrixOfferedAction')
  })

  it('the crown passes the option through, and the preparation reads it', () => {
    const menu = fs.readFileSync('modules/canvas/pan-crown/pan-radial-menu.js', 'utf8')
    expect(menu).toMatch(/offered === true \? \{\s*offeredAction: true/)
    const prepare = fs.readFileSync('modules/rolls/roll-prepare.js', 'utf8')
    expect(prepare).toMatch(/chatData\?\.offeredAction === true\) rollData\.matrix\.offeredAction = true/)
  })
})
