import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Séance G, lot sécurité et CI (M5 D1). The GM applies a Mana Flux / Mana Ebb from the ritual resistance card read again
// from the chat log: a card a GM or an owner of its roller wrote, of a ritual item named so; the GM confirms the Force
// and the hours (Shadow Spells p. 25). Nothing is read on the button's data

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  applyManaShift
} = await import('../modules/system/mana-shift.js')

let scene, confirm
const ritual = {
  name: 'Flux mana'
}

function card({
  type = 'ritualResistance', force = 4
} = {
}) {
  return {
    id: 'res', byGM: true, data: {
      test: {
        type
      }, magic: {
        force
      }, owner: {
        itemUuid: 'Actor.lead.Item.rit'
      }
    },
  }
}

// What a player can write on the button: a Force of her choosing, another scene
const forged = {
  magic: {
    manaShift: {
      kind: 'flux', force: 9999, name: 'Flux mana'
    }
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    id: 'gm', isGM: true
  }
  game.time = {
    worldTime: 1000
  }
  scene = {
    name: 'Ruelle', flags: {
      sr5: {
        backgroundCountValue: -3
      }
    },
    update: vi.fn(async () => {}),
  }
  game.scenes = {
    get: id => (id === 'scene1' ? scene : undefined)
  }
  game.messages = {
    get: id => (id === 'res' ? {
      speaker: {
        scene: 'scene1'
      }
    } : undefined)
  }
  globalThis.fromUuid = vi.fn(async uuid => (uuid === 'Actor.lead.Item.rit' ? ritual : null))
  ui.notifications.warn = vi.fn()
  ui.notifications.info = vi.fn()
  confirm = vi.fn(async () => true)
  foundry.applications.api.DialogV2 = {
    confirm
  }
  foundry.utils.randomID = () => 'id1'
})

describe('Mana Flux / Mana Ebb applied by the GM (M5 D1)', () => {
  it('refuses a card no GM nor owner of its roller wrote', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(null)
    expect(await applyManaShift(forged, 'res')).toBe(false)
    expect(scene.update).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.ManaShiftCardRefused')
  })

  it('refuses a trusted card that is not a ritual resistance, or whose Force is not a whole number above 0', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(card({
      type: 'drain'
    }))
    expect(await applyManaShift(forged, 'res')).toBe(false)
    for (const force of [0, -2, 2.5, 'x']) {
      SR5_MiscellaneousHelpers.cardOf.mockReturnValue(card({
        force
      }))
      expect(await applyManaShift(forged, 'res'), String(force)).toBe(false)
    }
    expect(scene.update).not.toHaveBeenCalled()
  })

  it('refuses a card whose ritual item is not a Mana Flux nor a Mana Ebb', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(card())
    ritual.name = 'Cercle de garde'
    expect(await applyManaShift(forged, 'res')).toBe(false)
    ritual.name = 'Flux mana'
  })

  it('applies the Force of the trusted card, never the button\'s, once the GM confirms', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(card())
    expect(await applyManaShift(forged, 'res')).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    const sources = scene.update.mock.calls[0][0]['flags.sr5.backgroundCountSources']
    expect(sources).toEqual([{
      id: 'id1', kind: 'flux', name: 'Flux mana', force: 4, expires: 1000 + 4 * 3600
    }])
  })

  it('writes nothing when the GM declines', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(card())
    confirm.mockResolvedValue(false)
    expect(await applyManaShift(forged, 'res')).toBe(false)
    expect(scene.update).not.toHaveBeenCalled()
  })
})
