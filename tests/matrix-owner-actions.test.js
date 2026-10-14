import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Lot 19: the owner's actions with no test (Change Icon, Invite Mark, Switch Interface Mode) take their line of the
// sheet, and the check of four marks (SR5 p. 238) is reached at last

vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
    hasActionsLeft: vi.fn(() => true), changeActionInCombat: vi.fn()
  }
}))
const {
  takeOwnerAction, ownerActionTarget
} = await import('../modules/system/matrix-owner-actions.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

const decker = {
  id: 'decker', name: 'Decker', type: 'actorPc', system: {
  }
}
const other = {
  id: 'other', name: 'Autre', type: 'actorPc', system: {
  }
}

describe('owner actions with no test', () => {
  beforeEach(() => {
    game.user = {
      targets: new Set()
    }
    game.combat = null
    ui.notifications.warn = vi.fn()
    ui.notifications.info = vi.fn()
    globalThis.ChatMessage = {
      create: vi.fn(), getSpeaker: () => ({
      })
    }
    SR5Combat.hasActionsLeft.mockClear()
  })

  it('aims at the actor itself with no target, at nothing with two', () => {
    expect(ownerActionTarget(decker, [])).toBe(decker)
    expect(ownerActionTarget(decker, [{
      actor: other
    }])).toBe(other)
    expect(ownerActionTarget(decker, [{
      actor: other
    }, {
      actor: decker
    }])).toBeNull()
  })

  it('changes her own icon, and tells the table', async () => {
    expect(await takeOwnerAction(decker, 'changeIcon')).toBe(true)
    expect(ChatMessage.create).toHaveBeenCalledTimes(1)
    expect(SR5Combat.hasActionsLeft).toHaveBeenCalledWith(decker, [{
      type: 'simple', value: 1, source: 'changeIcon'
    }])
  })

  it('is refused on someone else\'s icon', async () => {
    game.user.targets = new Set([{
      actor: other
    }])
    expect(await takeOwnerAction(decker, 'switchInterfaceMode')).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1)
    expect(ChatMessage.create).not.toHaveBeenCalled()
  })

  it('goes on a device with no master, the gamemaster told', async () => {
    game.user.isGM = true
    game.user.targets = new Set([{
      actor: {
        id: 'cam', name: 'Caméra', type: 'actorDevice', system: {
          matrix: {
            deviceType: 'device'
          }
        }
      }
    }])
    expect(await takeOwnerAction(decker, 'inviteMark')).toBe(true)
    expect(ui.notifications.info).toHaveBeenCalledTimes(1)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('takes no other action', async () => {
    expect(await takeOwnerAction(decker, 'dataSpike')).toBe(false)
  })
})
