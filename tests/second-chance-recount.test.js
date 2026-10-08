import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Second Chance (SR5 p. 58) rerolls the failed dice; its dice are kept apart on the roll (roll.r.secondChance), and
// the GM's reading again of a card counts them, one per failure at most, when the sheet shows Edge spent.
// Before, an honest card lost them: 4 hits counted again for 9 announced (Laurine, 08/10, measured in game)

const {
  recountHits, chanceHits, chanceSpent, hitsUnderPush
} = await import('../modules/rolls/roll-helpers/socket-guard.js')
const {
  trustedHits
} = await import('../modules/rolls/roll-helpers/matrix-card.js')
const {
  countHits
} = await import('../modules/rolls/roll-helpers/illusion.js')
const {
  effectCardVerdict
} = await import('../modules/rolls/roll-helpers/effect-card.js')
const spiritBonds = await import('../modules/entities/items/spirit-bonds.js')
const {
  toxinCardVerdict
} = await import('../modules/rolls/roll-helpers/toxin-card.js')

const results = values => values.map(result => ({
  result, active: true
}))
//12 dice, 4 hits, 8 failures; Second Chance rerolled the 8 failures: 5 hits
const roll = (chance = [5, 6, 5, 6, 5, 1, 2, 3]) => ({
  terms: [{
    results: results([1, 5, 1, 2, 3, 5, 5, 6, 2, 4, 3, 4])
  }],
  ...(chance ? {
    secondChance: {
      terms: [{
        results: results(chance)
      }]
    }
  } : {
  })
})
const roller = spent => ({
  system: {
    specialAttributes: {
      edge: {
        augmented: {
          value: 2
        }
      }
    },
    conditionMonitors: {
      edge: {
        actual: {
          value: spent
        }
      }
    },
  }
})
const data = (used = true) => ({
  edge: {
    hasUsedSecondChance: used
  }
})

describe('recountHits and Second Chance', () => {
  it('leaves the rerolled dice out unless asked', () => {
    expect(recountHits(roll(), 12)).toBe(4)
    expect(recountHits(roll(), 12, {
      secondChance: true
    })).toBe(9)
  })
  it('counts one rerolled die per failure among the dice counted, never more', () => {
    //Twenty sixes written as rerolls: only 8 failures to reroll
    expect(recountHits(roll(new Array(20).fill(6)), 12, {
      secondChance: true
    })).toBe(12)
    //Within a pool of 6: 2 hits and 4 failures, 4 rerolled dice at most
    expect(recountHits(roll(new Array(20).fill(6)), 6, {
      secondChance: true
    })).toBe(6)
  })
  it('reads a roll written as a string, and a roll without Second Chance', () => {
    expect(recountHits(JSON.stringify(roll()), 12, {
      secondChance: true
    })).toBe(9)
    expect(recountHits(roll(null), 12, {
      secondChance: true
    })).toBe(4)
    expect(chanceHits(roll(null), [])).toBe(0)
  })
  it('stays within the limit of the test (SR5 p. 58: Second Chance does not lift it)', () => {
    expect(hitsUnderPush({
      rollJSON: roll(), pool: 12, limit: 6, secondChance: true
    })).toBe(6)
  })
})

describe('chanceSpent', () => {
  it('needs the card to say it and the sheet to show Edge spent', () => {
    expect(chanceSpent(data(), roller(1))).toBe(true)
    expect(chanceSpent(data(), roller(0))).toBe(false)
    expect(chanceSpent(data(false), roller(1))).toBe(false)
    expect(chanceSpent(null, roller(1))).toBe(false)
  })
})

describe('the readings again keep the hits of an honest Second Chance', () => {
  it('a matrix action (trustedHits): 9 hits, not 4', async () => {
    const card = (spent, chance) => ({
      roller: roller(spent), byGM: false, author: {
        name: 'Clo'
      }, data: {
        roll: {
          r: roll(chance)
        }, edge: {
          hasUsedSecondChance: true
        }
      }
    })
    expect((await trustedHits({
      card: card(1), claimed: 9, pool: 12
    })).hits).toBe(9)
    //The sheet shows no Edge spent: the rerolled dice do not count, the card stays told to the GM
    expect((await trustedHits({
      card: card(0), claimed: 9, pool: 12
    })).hits).toBe(4)
    //A card that claims more than its dice show is still cut to what they show
    expect((await trustedHits({
      card: card(1, [1, 1, 1, 1, 1, 1, 1, 1]), claimed: 9, pool: 12
    })).hits).toBe(4)
  })
  it('an effect card, an illusion, a spirit card, a toxin', () => {
    expect(effectCardVerdict({
      authorOwnsCaster: true, itemOnCaster: true, rollJSON: roll(), pool: 12, force: 12, magic: 6,
      claimedHits: 9, claimedNetHits: 9, secondChance: true,
    }).mismatch).toBe(false)
    expect(countHits(roll(), 0, true)).toBe(9)
    expect(countHits(roll(), 0)).toBe(4)
    expect(spiritBonds.recountHits(roll(), 12, 0, 0, true)).toBe(9)
    expect(toxinCardVerdict({
      authorOwnsTarget: true, sourceFound: true, power: 6, rollJSON: roll(), pool: 12, claimedHits: 9, secondChance: true,
    }).hits).toBe(9)
  })
  it('Erase Mark: the owner of the mark keeps the hits of his Second Chance (Bérénice\'s review 135)', async () => {
    const {
      SR5_MiscellaneousHelpers
    } = await import('../modules/rolls/roll-helpers/miscellaneous.js')
    const {
      SR5_MarkHelpers
    } = await import('../modules/rolls/roll-helpers/mark.js')
    const card = (type, typeSub, r, spent) => ({
      id: type, byGM: false, roller: {
        system: {
          ...roller(spent).system, matrix: {
            actions: {
              eraseMark: {
                test: {
                  dicePool: 12
                }
              }
            }
          }
        }
      }, data: {
        test: {
          type, typeSub
        }, roll: {
          r
        }, edge: {
          hasUsedSecondChance: true
        }, previousMessage: {
          messageId: 'action', itemUuid: 'Item.x'
        }
      }
    })
    //The eraser: 6 hits. The owner of the mark: 4 hits, 9 with his Second Chance
    const action = card('matrixAction', 'eraseMark', roll(null), 0)
    action.data.roll.r.terms[0].results = results([5, 5, 5, 5, 5, 5])
    globalThis.fromUuid = vi.fn(async () => null)
    for (const [spent, reached] of [[1, false], [0, true]]) {
      const defense = card('eraseMark', '', roll(), spent)
      vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => id === 'action' ? action : defense)
      globalThis.fromUuid.mockClear()
      expect(await SR5_MarkHelpers.eraseUse('defense')).toBe(null)
      //Edge spent on the sheet: 9 hits, the erasing fails before the item is read; without it, 4 hits, it goes on
      expect(globalThis.fromUuid.mock.calls.length > 0).toBe(reached)
    }
    vi.restoreAllMocks()
  })
})
