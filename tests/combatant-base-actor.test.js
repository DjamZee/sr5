import {
  describe, it, expect, vi, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

// Blandine: the sheet of an NPC opened from the actors list is its base actor. Its unlinked tokens carry
// the same actorId, so the base actor took the combatant of the first of them, and spent its actions
describe('the combatant of an actor (security pass, Petra)', () => {
  const combatant = (id, actorId, tokenId, actorLink) => ({
    id, actorId, tokenId, token: {
      actorLink
    }
  })
  const setCombat = combatants => {
    globalThis.game.combat = {
      combatants
    }
  }
  afterEach(() => {
    delete globalThis.game.combat
  })

  it('the base actor of unlinked tokens is none of their combatants', () => {
    setCombat([combatant('c1', 'grunt', 't1', false), combatant('c2', 'grunt', 't2', false)])
    expect(SR5Combat.getCombatantFromActor({
      isToken: false, id: 'grunt'
    })).toBeUndefined()
  })

  it('an unlinked token finds its own combatant', () => {
    setCombat([combatant('c1', 'grunt', 't1', false), combatant('c2', 'grunt', 't2', false)])
    expect(SR5Combat.getCombatantFromActor({
      isToken: true, id: 'grunt', token: {
        id: 't2'
      }
    })?.id).toBe('c2')
  })

  it('a linked actor finds the combatant of its token, from its sheet', () => {
    setCombat([combatant('c1', 'grunt', 't1', false), combatant('c2', 'pc', 't3', true)])
    expect(SR5Combat.getCombatantFromActor({
      isToken: false, id: 'pc'
    })?.id).toBe('c2')
  })
})
