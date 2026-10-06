import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

// stepTurn wrote the combatants' flags in the combat's own update ({turn, combatants}): Foundry does not write an
// embedded collection that way, so hasPlayed stayed false even when the GM stepped himself (Jakob, Thomas pointe 3)
function fakeCombat(){
  const combatants = [
    {
      id: 'a', flags: {
        sr5: {
          hasPlayed: false, delayedAction: false
        }
      }
    },
    {
      id: 'b', flags: {
        sr5: {
          hasPlayed: false, delayedAction: true
        }
      }
    },
    {
      id: 'c', flags: {
        sr5: {
          hasPlayed: false, delayedAction: false
        }
      }
    },
  ]
  return {
    combatants, current: {
      combatantId: 'a'
    }, combatant: combatants[2],
    update: vi.fn(async () => {}),
    updateEmbeddedDocuments: vi.fn(async () => []),
  }
}

describe('stepTurn', () => {
  it('writes hasPlayed and the spent delayed action on the combatants themselves, then the turn', async () => {
    vi.spyOn(SR5Combat, 'endOwnerPassEffects').mockResolvedValue()
    const combat = fakeCombat()
    await SR5Combat.prototype.stepTurn.call(combat, 2)
    expect(combat.updateEmbeddedDocuments).toHaveBeenCalledWith('Combatant', [
      {
        _id: 'a', 'flags.sr5.hasPlayed': true
      },
      {
        _id: 'b', 'flags.sr5.delayedAction': false
      },
    ])
    expect(combat.update).toHaveBeenCalledWith({
      turn: 2
    })
    expect(combat.updateEmbeddedDocuments.mock.invocationCallOrder[0]).toBeLessThan(combat.update.mock.invocationCallOrder[0])
  })
})
