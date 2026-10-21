import {
  describe, it, expect, vi, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  turnOrderShift
} = await import('../modules/system/turn-order-shift.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

//A combatant as sortByRERIC reads it: score, sort key, seizure, Edge / Reaction / Intuition
function fighter(id, initiative, {
  base, seize = false, edge = 3, reaction = 3, intuition = 3
} = {
}){
  return {
    id, initiative, parent: {
      round: 1
    },
    flags: {
      sr5: {
        baseCombatantInitiative: base ?? initiative, seizeInitiative: seize, hasPlayed: false
      }
    },
    actor: {
      system: {
        specialAttributes: {
          edge: {
            augmented: {
              value: edge
            }
          }
        },
        attributes: {
          reaction: {
            augmented: {
              value: reaction
            }
          }, intuition: {
            augmented: {
              value: intuition
            }
          }
        },
      }
    },
  }
}

const sorted = list => list.slice().sort(SR5Combat.sortByRERIC)
const entries = list => list.map(c => ({
  id: c.id, key: Number(c.flags.sr5.baseCombatantInitiative ?? c.initiative ?? NaN), seize: c.flags.sr5.seizeInitiative
}))

//Writes the new keys and sorts again, as Foundry does after the update of the combatants
function applyMove(list, index, direction){
  const move = turnOrderShift(entries(list), index, direction)
  if (!move) return null
  for (const c of list) if (c.id in move.keys) c.flags.sr5.baseCombatantInitiative = move.keys[c.id]
  return {
    move, order: sorted(list).map(c => c.id)
  }
}

describe('moving a combatant one place in the order of the pass', () => {
  it('swaps two neighbours of different scores, and the sort finds the new order', () => {
    const list = sorted([fighter('a', 20), fighter('b', 15), fighter('c', 9)])
    const {
      move, order
    } = applyMove(list, 1, 1)
    expect(order).toEqual(['a', 'c', 'b'])
    expect(move.order).toEqual(['a', 'c', 'b'])
    expect(move.keys).toEqual({
      c: 15, b: 9
    })
  })

  it('never touches the scores: they decide the passes (-10 each)', () => {
    const list = sorted([fighter('a', 20), fighter('b', 12)])
    applyMove(list, 0, 1)
    expect(list.map(c => c.initiative)).toEqual([20, 12])
    expect(sorted(list).map(c => c.id)).toEqual(['b', 'a'])
  })

  //Edge, Reaction, Intuition, coin: a tie decided by them is beaten by the move
  it('beats a tie decided by Edge', () => {
    const list = sorted([fighter('a', 12, {
      edge: 6
    }), fighter('b', 12, {
      edge: 1
    })])
    expect(list.map(c => c.id)).toEqual(['a', 'b'])
    expect(applyMove(list, 1, -1).order).toEqual(['b', 'a'])
  })

  //A swap of the keys alone would have tied the one moved down with the next one, and Edge put it below him
  it('does not let the one moved down pass under a third one of the same score', () => {
    const list = sorted([fighter('a', 15), fighter('b', 12, {
      edge: 1
    }), fighter('c', 12, {
      edge: 6
    })])
    expect(list.map(c => c.id)).toEqual(['a', 'c', 'b'])
    expect(applyMove(list, 0, 1).order).toEqual(['c', 'a', 'b'])
  })

  it('moves one place only among many ties, and can be done again', () => {
    const list = sorted(['a', 'b', 'c', 'd'].map(id => fighter(id, 10)))
    const before = list.map(c => c.id)
    let result = applyMove(list, 3, -1)
    expect(result.order).toEqual([before[0], before[1], before[3], before[2]])
    result = applyMove(sorted(list), 2, -1)
    expect(result.order).toEqual([before[0], before[3], before[1], before[2]])
  })

  it('refuses at the ends of the order, and with a direction other than one place', () => {
    const list = entries(sorted([fighter('a', 20), fighter('b', 10)]))
    expect(turnOrderShift(list, 0, -1)).toBeNull()
    expect(turnOrderShift(list, 1, 1)).toBeNull()
    expect(turnOrderShift(list, 0, 2)).toBeNull()
  })

  it('refuses a combatant without a score yet', () => {
    const list = [fighter('a', 20), fighter('b', null, {
      base: null
    })]
    expect(turnOrderShift(entries(list), 1, -1)).toBeNull()
  })

  //SR5 p. 168: who seized the initiative acts first, the key cannot change it
  it('refuses to pass over a combatant who seized the initiative', () => {
    const list = sorted([fighter('a', 5, {
      seize: true
    }), fighter('b', 20)])
    expect(list.map(c => c.id)).toEqual(['a', 'b'])
    expect(turnOrderShift(entries(list), 1, -1)).toBeNull()
  })
})

describe('SR5Combat.shiftTurnOrder', () => {
  afterEach(() => {
    delete globalThis.game
  })

  function fakeCombat(turn){
    const turns = sorted([fighter('a', 20), fighter('b', 15), fighter('c', 9)])
    const combat = {
      turns, turn,
      updateEmbeddedDocuments: vi.fn(async () => {
        //Foundry follows the active combatant to its new place
        combat.turn = 2
      }),
      update: vi.fn(async (data) => Object.assign(combat, data)),
    }
    for (const c of turns) c.combat = combat
    return combat
  }

  it('writes only the sort keys, then puts the turn back on its place: the one coming up acts now', async () => {
    globalThis.game = {
      user: {
        isGM: true
      }
    }
    const combat = fakeCombat(1)
    expect(await SR5Combat.shiftTurnOrder(combat.turns[1], 1)).toBe(true)
    expect(combat.updateEmbeddedDocuments).toHaveBeenCalledWith('Combatant', [
      {
        _id: 'c', 'flags.sr5.baseCombatantInitiative': 15
      },
      {
        _id: 'b', 'flags.sr5.baseCombatantInitiative': 9
      },
    ])
    expect(combat.update).toHaveBeenCalledWith({
      turn: 1
    })
  })

  it('is for the gamemaster only', async () => {
    globalThis.game = {
      user: {
        isGM: false
      }
    }
    const combat = fakeCombat(0)
    expect(await SR5Combat.shiftTurnOrder(combat.turns[1], 1)).toBe(false)
    expect(combat.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
