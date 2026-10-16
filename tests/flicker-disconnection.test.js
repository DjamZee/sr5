import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Kill Code p. 74: the Flicker disconnects at two marks, and it is no reboot. Élise's ruling of 16/10: dumpshock at
// once, the avatar inert for [Device Rating] combat turns with its marks and its Overwatch Score, then the full reboot

const dumpshock = vi.fn()
vi.mock('../modules/entities/actors/entityActor-helpers.js', () => ({
  SR5_ActorHelper: {
    dumpshockIfInVR: (...args) => dumpshock(...args),
  },
}))

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}

const {
  FLICKER_DISCONNECTION, flickerTurns, isFlickerDisconnected, flickerEffectData, disconnectByFlicker, endFlickerDisconnection
} = await import('../modules/system/flicker-disconnection.js')

function characterWith(items = [], effects = []) {
  const actor = {
    name: 'Deckeuse', isToken: false, items: [...items], effects: [...effects],
    createEmbeddedDocuments: vi.fn(async (kind, list) => {
      if (kind === 'Item') actor.items.push(...list.map(d => ({
        type: d.type, system: {
          type: d['system.type'], durationType: d['system.durationType'], duration: d['system.duration']
        }
      })))
    }),
    deleteEmbeddedDocuments: vi.fn(async (kind, ids) => {
      if (kind === 'Item') actor.items = actor.items.filter(i => !ids.includes(i.id))
    }),
    rebootDeck: vi.fn(async () => {
    }),
  }
  return actor
}

const lock = {
  id: 'lock', type: 'itemEffect', system: {
    customEffects: {
      0: {
        target: 'system.matrix.isLinkLocked'
      }
    }
  }
}

describe('the disconnection of the Flicker', () => {
  beforeEach(() => dumpshock.mockClear())
  it('lasts the Device Rating of the device in combat turns, 1 at least', () => {
    expect(flickerTurns({
      system: {
        deviceRating: 4
      }
    })).toBe(4)
    expect(flickerTurns(null)).toBe(1)
  })
  it('is an effect counted in combat turns, owned by the IC', () => {
    expect(flickerEffectData({
      ice: {
        id: 'ice', name: 'Clignoteuse'
      }, turns: 3, name: 'Déconnecté', target: 't'
    })).toEqual(expect.objectContaining({
      'system.type': FLICKER_DISCONNECTION, 'system.durationType': 'round', 'system.duration': 3, 'system.ownerID': 'ice'
    }))
  })
  it('deals the dumpshock at once, takes the link lock away, and is no reboot', async () => {
    const target = characterWith([lock], [{
      id: 'st', statuses: new Set(['linkLock'])
    }])
    expect(await disconnectByFlicker({
      id: 'ice', name: 'Clignoteuse'
    }, target, {
      system: {
        deviceRating: 3
      }
    })).toBe(true)
    expect(dumpshock).toHaveBeenCalledWith(target)
    expect(target.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['lock'])
    expect(target.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['st'])
    expect(isFlickerDisconnected(target)).toBe(true)
    expect(target.items.find(i => i.system.type === FLICKER_DISCONNECTION).system.duration).toBe(3)
    expect(target.rebootDeck).not.toHaveBeenCalled()
  })
  it('a second disconnection does nothing more', async () => {
    const target = characterWith()
    await disconnectByFlicker({
      id: 'ice'
    }, target, null)
    dumpshock.mockClear()
    expect(await disconnectByFlicker({
      id: 'ice'
    }, target, null)).toBe(false)
    expect(dumpshock).not.toHaveBeenCalled()
  })
  it('ends with the full reboot, without a second dumpshock', async () => {
    const target = characterWith()
    await endFlickerDisconnection(target)
    expect(target.rebootDeck).toHaveBeenCalledWith(null, {
      dumpshock: false
    })
  })
})
