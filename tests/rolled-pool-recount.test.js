import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// The sheet may drop between a player's roll and the GM's reading of her card (a deck switched off, silent mode, a
// wound): the pool the card was rolled with counts when larger (Laurine, 08/10, measured in game for trustedHits).
// Here the readings that capped by the sheet alone: the marks (attack, defense, erasing), defenseCap (file, perception,
// Overwatch), hitsOf, the grapple's escape and Jack Out. Dice past the pool the card was rolled with still do not count.

const {
  cardPoolCap, rolledPool
} = await import('../modules/rolls/roll-helpers/socket-guard.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_GrappleHelpers
} = await import('../modules/rolls/roll-helpers/grapple.js')

const results = values => values.map(result => ({
  result, active: true
}))
//Rolled with 12 dice, 7 hits; the sheet now shows a pool of 0 everywhere
const HONEST = [5, 5, 5, 5, 5, 5, 5, 1, 2, 3, 4, 2]
const roller = {
  id: 'h', uuid: 'Actor.h', name: 'Decker', system: {
    specialAttributes: {
      edge: {
        augmented: {
          value: 2
        }
      }
    },
    attributes: {
      strength: {
        augmented: {
          value: 3
        }
      }, agility: {
        augmented: {
          value: 3
        }
      }
    },
    skills: {
      unarmedCombat: {
        test: {
          dicePool: 0
        }
      }
    },
    matrix: {
      actions: {
        hackOnTheFly: {
          limit: {
            linkedAttribute: 'sleaze'
          }, test: {
            dicePool: 0
          }, defense: {
            dicePool: 0
          }
        },
        eraseMark: {
          test: {
            dicePool: 0
          }
        },
        jackOut: {
          limit: {
            value: 0
          }, test: {
            dicePool: 0
          }
        },
      }
    },
  }
}
const card = (id, test, kept, value = 12, extra = {
}) => ({
  id, byGM: false, gm: false, roller, author: {
    name: 'Clo'
  }, data: {
    test, dicePool: {
      value, modifiers: []
    }, roll: {
      hits: kept.filter(d => d >= 5).length, r: {
        terms: [{
          results: results(kept)
        }]
      }
    }, ...extra,
  }
})
const gmCard = (id, test, hits, extra = {
}) => ({
  id, byGM: true, gm: true, roller: {
    id: 'n', system: {
    }
  }, data: {
    test, roll: {
      hits
    }, ...extra
  }
})

beforeEach(() => {
  globalThis.fromUuid = vi.fn(async () => null)
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'h' ? roller : null)
})
afterEach(() => vi.restoreAllMocks())

describe('cardPoolCap', () => {
  it('takes the pool the card was rolled with, plus Chance, when the sheet dropped', () => {
    expect(cardPoolCap(card('a', {
    }, HONEST), 2)).toBe(14)
    //The sheet larger: the sheet's
    expect(cardPoolCap(card('a', {
    }, HONEST), 20)).toBe(20)
    //A card without its pool: the sheet's, as before
    expect(cardPoolCap({
      roller, data: {
      }
    }, 2)).toBe(2)
    expect(rolledPool({
      dicePool: {
        value: 12
      }
    })).toBe(12)
  })
})

describe('the readings capped by the sheet alone', () => {
  it('hitsOf: 7 hits, not 0; dice inflated past the pool rolled with stay cut', () => {
    expect(SR5_MiscellaneousHelpers.hitsOf(card('a', {
    }, HONEST), 'matrix.actions.hackOnTheFly.test.dicePool')).toBe(7)
    expect(SR5_MiscellaneousHelpers.hitsOf(card('a', {
    }, [...HONEST, ...new Array(18).fill(6)]), 'matrix.actions.hackOnTheFly.test.dicePool')).toBe(9)
  })
  it('defenseCap (file, perception, Overwatch, marks): the pool the defense card was rolled with', async () => {
    expect(await SR5_MarkHelpers.defenseCap(card('d', {
      type: 'matrixDefense', typeSub: 'hackOnTheFly'
    }, HONEST))).toBe(14)
  })
  it('markCards: the attacker\'s card counted within the pool it was rolled with', async () => {
    const attack = card('a', {
      type: 'matrixAction', typeSub: 'hackOnTheFly'
    }, HONEST, 12, {
      matrix: {
        mark: 1
      }
    })
    const defense = gmCard('d', {
      type: 'matrixDefense', typeSub: 'hackOnTheFly'
    }, 2, {
      previousMessage: {
        messageId: 'a', actorId: 'h'
      }
    })
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => ({
      a: attack, d: defense
    })[id] ?? null)
    const cards = await SR5_MarkHelpers.markCards('d')
    expect(cards.outcome.winner).toBe('attacker')
    expect(cards.hits).toBe(7)
  })
  it('eraseUse: the eraser\'s card counted within the pool it was rolled with', async () => {
    const action = card('a', {
      type: 'matrixAction', typeSub: 'eraseMark'
    }, HONEST)
    const defense = gmCard('d', {
      type: 'eraseMark'
    }, 5, {
      previousMessage: {
        messageId: 'a', itemUuid: 'Item.x'
      }
    })
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => ({
      a: action, d: defense
    })[id] ?? null)
    //7 hits beat 5: the erasing goes on to read the item (none here); counted on the sheet, 0 hits stopped it before
    expect(await SR5_MarkHelpers.eraseUse('d')).toBe(null)
    expect(globalThis.fromUuid).toHaveBeenCalled()
  })
  it('jackOutHits: within the pool rolled with, and Chance for a push', () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(card('j', {
      type: 'matrixAction', typeSub: 'jackOut'
    }, HONEST))
    const r = SR5_MatrixHelpers.jackOutHits({
      owner: {
        messageId: 'j'
      }
    })
    expect(r.capped).toBe(7)
    expect(r.pushed).toBe(7)
  })
  it('matrixDamageOf: the damage a winning defender deals back, both cards within the pools rolled with (review 137)', () => {
    const attack = card('a', {
      type: 'matrixAction', typeSub: 'hackOnTheFly'
    }, [5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const defense = {
      ...card('d', {
        type: 'matrixDefense', typeSub: 'hackOnTheFly'
      }, HONEST, 12, {
        previousMessage: {
          messageId: 'a', actorId: 'h'
        }, damage: {
          matrix: {
            value: 6
          }
        }
      }), roller: {
        id: 'x', system: roller.system
      }
    }
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => id === 'a' ? attack : null)
    //7 hits against 1, the sheets at 0 since: 6 boxes, not 0
    expect(SR5_MiscellaneousHelpers.matrixDamageOf(defense, {
      parent: roller
    })).toBe(6)
  })
  it('the grapple\'s escape: within the pool rolled with', () => {
    const escape = card('e', {
      type: 'grappleEscape'
    }, HONEST)
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(escape)
    vi.spyOn(SR5_GrappleHelpers, 'partnerOf').mockReturnValue(null)
    vi.spyOn(SR5_GrappleHelpers, 'holdBetween').mockReturnValue({
      held: roller, holder: {
        effects: []
      }, data: {
        hold: 5
      }
    })
    game.messages = new Map([['e', {
      timestamp: 1
    }]])
    const freed = SR5_GrappleHelpers.escapeOf('e')
    expect(freed?.hits).toBe(7)
  })
})
