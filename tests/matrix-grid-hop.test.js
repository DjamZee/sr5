import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Lot 19: Grid Hop (SR5 p. 244), a complex action with no test, to a grid one has access to, never from a host

vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
    hasActionsLeft: vi.fn(() => true), changeActionInCombat: vi.fn()
  }
}))
const {
  gridHopCheck, takeGridHop
} = await import('../modules/system/matrix-grid-hop.js')

describe('what a grid hop asks', () => {
  it('a grid one has access to', () => {
    expect(gridHopCheck('public', 'global', true)).toBe('ok')
  })
  it('no access: illegal, Brute Force or Hack on the Fly against the grid', () => {
    expect(gridHopCheck('public', 'local', false)).toBe('illegal')
  })
  it('not from a host, nor to the grid one is on, nor to a host', () => {
    expect(gridHopCheck('host', 'public', true)).toBe('inHost')
    expect(gridHopCheck('local', 'local', true)).toBe('same')
    expect(gridHopCheck('local', 'host', true)).toBe('unknown')
  })
})

describe('the hop from the sheet', () => {
  const actor = grid => ({
    id: 'd1', name: 'Decker', system: {
      matrix: {
        userGrid: grid
      }
    }, update: vi.fn()
  })
  beforeEach(() => {
    game.user = {
      isGM: false
    }
    game.combat = null
    ui.notifications.warn = vi.fn()
    ui.notifications.info = vi.fn()
    globalThis.ChatMessage = {
      create: vi.fn(), getSpeaker: () => ({
      })
    }
    globalThis.foundry.applications ??= {
    }
    globalThis.foundry.applications.api = {
      DialogV2: {
        wait: vi.fn(async () => ({
          grid: 'global', access: true
        }))
      }
    }
  })

  it('writes the new grid and tells the table', async () => {
    const decker = actor('public')
    expect(await takeGridHop(decker)).toBe(true)
    expect(decker.update).toHaveBeenCalledWith({
      'system.matrix.userGrid': 'global'
    })
    expect(ChatMessage.create).toHaveBeenCalledTimes(1)
  })

  it('refuses it from inside a host, by the book', async () => {
    const decker = actor('host')
    expect(await takeGridHop(decker)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_GridHopInHost')
    expect(decker.update).not.toHaveBeenCalled()
  })

  it('changes nothing for an illegal hop', async () => {
    foundry.applications.api.DialogV2.wait = vi.fn(async () => ({
      grid: 'local', access: false
    }))
    const decker = actor('public')
    expect(await takeGridHop(decker)).toBe(false)
    expect(decker.update).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.GridHopIllegal')
  })
})
