import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const {
  limbEnhancementHolders, showCyberlimbNotice, CYBERLIMB_NOTICE
} = await import('../modules/system/cyberlimb-notice.js')

// Decision of DjamZ (2026-10-07): the enhancements of a cyberlimb raise the limb only, and the weapons already on the
// sheets fire with the body; the active GM is told once per world which characters to check

const items = list => Object.assign([...list], {
  get: id => list.find(i => i.id === id)
})
const enhancement = (id, attribute = 'strength') => ({
  id, _id: id, name: `Amélioration ${id}`, type: 'itemAugmentation', system: {
    isActive: true, itemRating: 2, customEffects: {
      0: {
        target: `system.attributes.${attribute}.augmented`, type: 'rating', multiplier: null
      }
    }
  }
})
const arm = (id, plugged = []) => ({
  id, name: `Bras ${id}`, type: 'itemAugmentation', system: {
    category: 'cyberlimbs', isActive: true, accessory: plugged.map(p => ({
      _id: p.id, name: p.name, type: p.type, system: p.system
    }))
  }
})
const weapon = (name, heldByLimb = '') => ({
  name, type: 'itemWeapon', system: {
    heldByLimb
  }
})

let store
beforeEach(() => {
  store = {
  }
  game.settings = {
    get: (s, k) => store[k],
    set: async (s, k, v) => {
      store[k] = JSON.parse(JSON.stringify(v))
    },
  }
  const gm = {
    id: 'gm', isGM: true, isSelf: true
  }
  game.users = Object.assign([gm, {
    id: 'p1', isGM: false
  }], {
    activeGM: gm
  })
  globalThis.ChatMessage = {
    create: vi.fn(async () => {})
  }
})

const sam = () => {
  const str = enhancement('e1')
  return {
    name: 'Sam', items: items([arm('a1', [str]), str, weapon('Ares Predator'), weapon('Matraque', 'a1')])
  }
}

describe('who is told', () => {
  it('a character with an enhancement plugged in a limb, and his weapons that fire with the body', () => {
    const plain = {
      name: 'Zoé', items: items([arm('a2'), weapon('Couteau')])
    }
    expect(limbEnhancementHolders([sam(), plain])).toEqual([{
      name: 'Sam', limbs: ['Bras a1'], weapons: ['Ares Predator']
    }])
  })
})

describe('the message', () => {
  it('whispered to the gamemasters, once per world', async () => {
    expect(await showCyberlimbNotice([sam()])).toBe(true)
    const [data] = ChatMessage.create.mock.calls[0]
    expect(data.whisper).toEqual(['gm'])
    expect(data.content).toContain('Sam')
    expect(store[CYBERLIMB_NOTICE].shown).toBeTruthy()
    expect(await showCyberlimbNotice([sam()])).toBe(false)
    expect(ChatMessage.create).toHaveBeenCalledTimes(1)
  })

  it('nothing on a player\'s client, nor for a world without such a character', async () => {
    game.users.activeGM = {
      id: 'gm2', isSelf: false
    }
    expect(await showCyberlimbNotice([sam()])).toBe(false)
    expect(store[CYBERLIMB_NOTICE]).toBeUndefined()
    game.users.activeGM = game.users[0]
    expect(await showCyberlimbNotice([])).toBe(false)
    expect(ChatMessage.create).not.toHaveBeenCalled()
  })
})
