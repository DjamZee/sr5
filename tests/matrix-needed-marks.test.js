import {
  describe, it, expect, beforeEach, vi
} from 'vitest'

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  checkTargetMarks
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')

const HACKER = 'hacker'

// A targeted token whose actor carries the given marks on its device
function target(marks, creatorId = '', type = 'actorDrone'){
  return {
    actor: {
      id: 'target',
      type,
      system: {
        creatorId,
        matrix: {
          userGrid: 'local'
        }
      },
      items: [{
        system: {
        }
      }, {
        system: {
          marks: marks
        }
      }],
    },
  }
}

function check(neededMarks, marks, creatorId, type){
  game.user.targets = new Set([target(marks, creatorId, type)])
  const rollData = {
    owner: {
      speakerId: HACKER
    },
    target: {
    },
  }
  return checkTargetMarks(rollData, {
    neededMarks
  }, {
    id: HACKER
  })
}

describe('Marks needed before a matrix action (SR5 p. 238-244)', () => {
  beforeEach(() => {
    game.user = {
    }
    ui.notifications.info = vi.fn()
    // No actor in the world: a creator id resolves to nobody
    game.actors = new Map()
    game.scenes = undefined
    ui.notifications.warn = vi.fn()
  })

  it('refuses Reboot Device (3 marks) with a single mark', async () => {
    expect(await check(3, [{
      ownerId: HACKER, value: 1
    }])).toBe(false)
    expect(ui.notifications.info).toHaveBeenCalled()
  })

  it('refuses Reboot Device (3 marks) with two marks', async () => {
    expect(await check(3, [{
      ownerId: HACKER, value: 2
    }])).toBe(false)
  })

  it('allows Reboot Device with three marks', async () => {
    expect(await check(3, [{
      ownerId: HACKER, value: 3
    }])).toBe(true)
  })

  it('refuses when the marks belong to someone else', async () => {
    expect(await check(1, [{
      ownerId: 'someone', value: 3
    }])).toBe(false)
  })

  it('allows Edit File (1 mark) with one mark', async () => {
    expect(await check(1, [{
      ownerId: HACKER, value: 1
    }])).toBe(true)
  })

  it('reads Erase Mark\'s "3" as three marks (SR5 p. 240)', async () => {
    expect(await check('3', [{
      ownerId: HACKER, value: 2
    }])).toBe(false)
  })

  it('asks for no mark on a special action', async () => {
    expect(await check('S', [])).toBe(true)
  })

  it('lets the creator of a drone through an owner-only action without any mark', async () => {
    expect(await check(4, [], HACKER)).toBe(true)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  // Lot 19: an owner's action is no longer taken with a single mark (SR5 p. 238)
  it('refuses an owner-only action to anyone else, even with three marks', async () => {
    expect(await check(4, [{
      ownerId: HACKER, value: 3
    }], 'someoneElse')).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1)
  })

  it('refuses it on a character, owner of her own icons', async () => {
    expect(await check(4, [{
      ownerId: HACKER, value: 1
    }], '', 'actorPc')).toBe(false)
  })

  it('lets it through on a drone whose owner is unknown, and refuses nothing', async () => {
    game.user.isGM = true
    expect(await check(4, [])).toBe(true)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledTimes(1)
  })
})
