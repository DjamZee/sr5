import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// An AI outside any device has nothing to reboot: it must load onto a device and reboot that one
// to reset its Overwatch Score (Data Trails p. 157). The sheet offered the button all the same, and
// a click reset the score and announced " has rebooted." with no device name.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  ActorSheetSR5
} = await import('../modules/entities/actors/baseSheet.js')

function sheetOf(items) {
  const actor = {
    type: 'actorPc', name: 'IA', items,
    system: {
      activeSpecialAttribute: 'depth',
      matrix: {
        isLinkLocked: false
      },
      specialProperties: {
        actions: {
          simple: {
            current: 2
          }, complex: {
            current: 1
          }
        }
      },
    },
    rebootDeck: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
  }
  return {
    actor, sheet: Object.assign(Object.create(ActorSheetSR5.prototype), {
      document: actor
    })
  }
}

beforeEach(() => {
  ui.notifications = {
    warn: vi.fn(), info: vi.fn()
  }
  game.i18n.format = vi.fn(k => k)
  game.settings.get = vi.fn(() => false)
  game.combat = null
})

describe('Reboot button of an AI (Data Trails p. 157)', () => {
  it('refuses to reboot an AI without a device, and spends nothing', async () => {
    const {
      actor, sheet
    } = sheetOf([])
    Object.defineProperty(sheet, 'actor', {
      get: () => actor
    })
    await ActorSheetSR5.prototype._onRebootDeck.call(sheet, {
      preventDefault(){}
    })
    expect(actor.rebootDeck).not.toHaveBeenCalled()
    expect(actor.update).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_RebootNoDevice')
  })

  it('still reboots the device an AI is loaded on', async () => {
    const {
      actor, sheet
    } = sheetOf([{
      type: 'itemDevice', system: {
        isActive: true
      }
    }])
    Object.defineProperty(sheet, 'actor', {
      get: () => actor
    })
    await ActorSheetSR5.prototype._onRebootDeck.call(sheet, {
      preventDefault(){}
    })
    expect(actor.rebootDeck).toHaveBeenCalled()
  })
})
