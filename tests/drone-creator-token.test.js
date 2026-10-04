import {
  describe, it, expect, beforeEach, vi
} from 'vitest'

// N51: a drone created from an unlinked token records the token id as creatorId, and the linked
// sheet of the same character was not recognised as owner (SR5 p. 238).

globalThis.CONFIG ??= {
}
const {
  checkTargetMarks
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

const BASE = 'rigger'
const TOKEN = 'tokenOfRigger'

function check(creatorId, speakerId){
  game.user.targets = new Set([{
    actor: {
      id: 'drone', items: [], system: {
        creatorId, matrix: {
          userGrid: 'local'
        }
      }
    }
  }])
  return checkTargetMarks({
    owner: {
      speakerId
    }, target: {
    }
  }, {
    neededMarks: 4
  }, {
    id: BASE
  })
}

describe('Owner of a drone created from a token (SR5 p. 238)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    game.user = {
    }
    ui.notifications.info = vi.fn()
    ui.notifications.warn = vi.fn()
    // The token resolves to a synthetic actor that carries the id of its base actor
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === TOKEN ? {
      id: BASE
    } : undefined)
  })

  it('recognises the linked sheet as owner of a drone made by its token', async () => {
    expect(await check(TOKEN, BASE)).toBe(true)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('still recognises the token itself', async () => {
    expect(await check(TOKEN, TOKEN)).toBe(true)
  })

  it('does not recognise another character', async () => {
    expect(await check('someoneElse', BASE)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalled()
  })
})
