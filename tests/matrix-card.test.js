import {
  describe, it, expect
} from 'vitest'

// Security lot "VD des cartes", part 2 (matrix): the GM reads again the matrix cards a player wrote

const {
  cardHits, defenderNetHits, sameActor, trustedMatrixAction, trustedDefenderDamage, cardStandsFor,
} = await import('../modules/rolls/roll-helpers/matrix-card.js')

const hacker = {
  uuid: 'Actor.h', type: 'actorPc', name: 'Hackeuse', system: {
    matrix: {
      actions: {
        dataSpike: {
          limit: {
            linkedAttribute: 'attack'
          }
        }
      }
    }
  }
}
const npc = {
  uuid: 'Actor.n', type: 'actorGrunt', name: 'PNJ', system: {
  }
}

function helpers(cards, hits = {
}) {
  return {
    cardOf: id => cards[id] ?? null,
    hitsOf: (card, path) => hits[`${card.id}|${path}`] ?? null,
    actorOf: id => ({
      h: hacker, n: npc
    })[id] ?? null,
  }
}

describe('rules', () => {
  it('counts a player card again, never above its claim', () => {
    expect(cardHits(true, 9, 2)).toBe(9)
    expect(cardHits(false, 9, 4)).toBe(4)
    expect(cardHits(false, 2, 4)).toBe(2)
    expect(cardHits(false, 9, null)).toBe(0)
  })
  it('deals back the net hits of the defense (SR5 p. 232)', () => {
    expect(defenderNetHits({
      claimed: 50, defenseHits: 6, attackHits: 2
    })).toBe(4)
    expect(defenderNetHits({
      claimed: 1, defenseHits: 6, attackHits: 2
    })).toBe(1)
    expect(defenderNetHits({
      claimed: 50, defenseHits: 1, attackHits: 2
    })).toBe(0)
  })
  it('knows the rigger of a drone', () => {
    const rigger = {
      id: 'r', uuid: 'Actor.r'
    }
    expect(sameActor({
      type: 'actorDrone', uuid: 'Actor.d', system: {
        vehicleOwner: {
          id: 'r'
        }
      }
    }, rigger)).toBe(true)
    expect(sameActor(hacker, npc)).toBe(false)
  })
})

describe('trustedMatrixAction', () => {
  const attack = {
    id: 'a', roller: hacker, byGM: false, author: {
      name: 'Clo'
    }, data: {
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }
    }
  }
  it('refuses a card no GM nor owner wrote', async () => {
    expect(await trustedMatrixAction({
      owner: {
        messageId: 'x'
      }
    }, helpers({
    }))).toBe(null)
  })
  it('counts the hits again and reads the action type on the sheet', async () => {
    const r = await trustedMatrixAction({
      owner: {
        messageId: 'a'
      }, roll: {
        hits: 30
      }, matrix: {
        actionType: 'sleaze'
      }
    }, helpers({
      a: attack
    }, {
      'a|matrix.actions.dataSpike.test.dicePool': 5
    }))
    expect(r.hits).toBe(5)
    expect(r.actionType).toBe('attack')
  })
  it('refuses a card that is no matrix action of its roller', async () => {
    expect(await trustedMatrixAction({
      owner: {
        messageId: 'a'
      }
    }, helpers({
      a: {
        ...attack, data: {
          test: {
            type: 'matrixAction', typeSub: 'unknown'
          }
        }
      }
    }))).toBe(null)
  })
})

describe('trustedDefenderDamage', () => {
  const attack = {
    id: 'a', roller: npc, byGM: true, data: {
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }
    }
  }
  const defense = {
    id: 'd', roller: hacker, byGM: false, data: {
      test: {
        type: 'matrixDefense', typeSub: 'dataSpike'
      }, previousMessage: {
        actorId: 'n', messageId: 'a'
      }
    }
  }
  const counted = {
    'a|matrix.actions.dataSpike.test.dicePool': 2, 'd|matrix.actions.dataSpike.defense.dicePool': 5
  }
  it('bounds a forged return of damage by the net hits counted again', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: attack, d: defense
    }, counted))).toBe(3)
  })
  it('gives nothing when the attack card is not the attacker\'s', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: {
        ...attack, roller: hacker
      }, d: defense
    }, counted))).toBe(0)
  })
  it('refuses a card that is no matrix defense', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      d: {
        ...defense, data: {
          ...defense.data, test: {
            type: 'attack'
          }
        }
      }
    }))).toBe(null)
  })
  it('takes a GM card as written', async () => {
    expect(await trustedDefenderDamage('d', 7, helpers({
      d: {
        ...defense, byGM: true
      }
    }))).toBe(7)
  })
})

describe('cardStandsFor', () => {
  it('lets only the actor a card was rolled for take its damage', async () => {
    const card = {
      id: 'r', roller: hacker, byGM: false, data: {
      }
    }
    expect(await cardStandsFor('r', hacker, helpers({
      r: card
    }))).toBe(true)
    expect(await cardStandsFor('r', npc, helpers({
      r: card
    }))).toBe(false)
    expect(await cardStandsFor('r', npc, helpers({
      r: {
        ...card, byGM: true
      }
    }))).toBe(true)
    expect(await cardStandsFor('x', npc, helpers({
    }))).toBe(false)
  })
})
