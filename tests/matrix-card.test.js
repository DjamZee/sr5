import {
  describe, it, expect, vi
} from 'vitest'

// Security lot "VD des cartes", part 2 (matrix): the GM reads again the matrix cards a player wrote.
// Hyacinthe's review (06/10): the Rule of Six only for a push the GM grants, the test's limit otherwise (D1); a drone's
// owner on its sheet is no proof (D2); the attack must be the action the defense answers, dice that cannot be counted
// are no 0 hits (D3)

const {
  cardHits, defenderNetHits, sameActor, standsFor, trustedHits, trustedMatrixAction, trustedDefenderDamage, cardStandsFor,
  trustedComplexForm, complexFormSubType, rolledPool, sheetValue,
} = await import('../modules/rolls/roll-helpers/matrix-card.js')

const dice = (kept, rerolls = []) => ({
  terms: [{
    results: [...kept.map(result => ({
      result, active: true
    })), ...rerolls.map(result => ({
      result, active: true, ruleOfSix: true
    }))]
  }]
})

const owns = ids => user => ids.includes(user?.name)
function actor(uuid, type, system, owners = []) {
  const ok = owns(owners)
  return {
    id: uuid.split('.').pop(), uuid, type, name: uuid, system, testUserPermission: user => ok(user)
  }
}
const hacker = actor('Actor.h', 'actorPc', {
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
        value: 0
      }
    }
  },
  matrix: {
    actions: {
      dataSpike: {
        limit: {
          linkedAttribute: 'attack', value: 4
        }, test: {
          dicePool: 6
        }, defense: {
          dicePool: 5
        }
      }
    }
  },
}, ['Clo'])
const npc = actor('Actor.n', 'actorGrunt', {
  matrix: {
    actions: {
      dataSpike: {
        limit: {
          value: 5
        }, test: {
          dicePool: 6
        }
      }
    }
  },
}, [])

function helpers(cards, extra = {
}) {
  return {
    cardOf: id => cards[id] ?? null,
    actorOf: id => ({
      h: hacker, n: npc
    })[id] ?? null,
    ...extra,
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
  it('knows the rigger of a drone, but only for an author who owns the rigger (D2)', () => {
    const drone = actor('Actor.d', 'actorDrone', {
      vehicleOwner: {
        id: 'n'
      }
    }, ['Clo'])
    expect(sameActor(drone, npc)).toBe(true)
    //The drone's owner rewritten to the GM's actor: the card's author does not own it
    expect(standsFor({
      roller: drone, byGM: false, author: {
        name: 'Clo'
      }
    }, npc)).toBe(false)
    const rigger = actor('Actor.r', 'actorPc', {
    }, ['Clo'])
    expect(standsFor({
      roller: actor('Actor.d2', 'actorDrone', {
        vehicleOwner: {
          id: 'r'
        }
      }, ['Clo']), byGM: false, author: {
        name: 'Clo'
      }
    }, rigger)).toBe(true)
  })
})

describe('trustedHits (D1, SR5 p. 58)', () => {
  const card = (roll, push = false) => ({
    roller: hacker, byGM: false, author: {
      name: 'Clo'
    }, data: {
      roll: {
        r: roll
      }, edge: {
        hasUsedPushTheLimit: push
      }
    }
  })
  it('counts no reroll and keeps the limit without a push', async () => {
    const r = await trustedHits({
      card: card(dice([6, 6, 6, 6, 6, 6], new Array(30).fill(6))), claimed: 40, pool: 6, limit: 4
    })
    expect(r.hits).toBe(4)
  })
  it('counts a push only when the GM grants it, within the pool plus Edge and as many rerolls as dice', async () => {
    const forged = card(dice(new Array(8).fill(6), new Array(30).fill(6)), true)
    const refused = await trustedHits({
      card: forged, claimed: 40, pool: 6, limit: 4, helpers: {
        grantPush: vi.fn(async () => false)
      }
    })
    expect(refused.hits).toBe(4)
    const grantPush = vi.fn(async () => true)
    const granted = await trustedHits({
      card: forged, claimed: 40, pool: 6, limit: 4, helpers: {
        grantPush
      }
    })
    //8 dice (6 + Edge 2), 8 rerolls at most
    expect(granted.hits).toBe(16)
    expect(grantPush).toHaveBeenCalledWith(forged, expect.objectContaining({
      withPush: 16, without: 4
    }))
  })
  it('asks nothing when the push changes nothing', async () => {
    const grantPush = vi.fn(async () => true)
    await trustedHits({
      card: card(dice([5, 1, 1]), true), claimed: 1, pool: 6, limit: 4, helpers: {
        grantPush
      }
    })
    expect(grantPush).not.toHaveBeenCalled()
  })
})

describe('trustedMatrixAction', () => {
  const attack = (roll = dice([5, 5, 5, 5, 5, 5])) => ({
    id: 'a', roller: hacker, byGM: false, author: {
      name: 'Clo'
    }, data: {
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }, roll: {
        r: roll
      }
    }
  })
  it('refuses a card no GM nor owner wrote', async () => {
    expect(await trustedMatrixAction({
      owner: {
        messageId: 'x'
      }
    }, helpers({
    }))).toBe(null)
  })
  it('counts the hits again within the limit, and reads the action type on the sheet', async () => {
    const r = await trustedMatrixAction({
      owner: {
        messageId: 'a'
      }, roll: {
        hits: 30
      }, matrix: {
        actionType: 'sleaze'
      }
    }, helpers({
      a: attack()
    }))
    //6 hits on 6 dice, Attack limit 4
    expect(r.hits).toBe(4)
    expect(r.actionType).toBe('attack')
  })
  it('refuses a card that is no matrix action of its roller', async () => {
    expect(await trustedMatrixAction({
      owner: {
        messageId: 'a'
      }
    }, helpers({
      a: {
        ...attack(), data: {
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
      }, roll: {
        hits: 2
      }
    }
  }
  const defense = {
    id: 'd', roller: hacker, byGM: false, author: {
      name: 'Clo'
    }, data: {
      test: {
        type: 'matrixDefense', typeSub: 'dataSpike'
      }, previousMessage: {
        actorId: 'n', messageId: 'a'
      }, roll: {
        hits: 30, r: dice([5, 5, 5, 5, 5], new Array(10).fill(6))
      }
    }
  }
  it('bounds a forged return of damage by the net hits counted again', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: attack, d: defense
    }))).toBe(3)
  })
  it('refuses when the attack card is not the attacker\'s', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: {
        ...attack, roller: hacker
      }, d: defense
    }))).toBe(null)
  })
  it('refuses an attack that is no matrix action, or another action than the defense (D3)', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: {
        ...attack, data: {
          ...attack.data, test: {
            type: 'attack', typeSub: 'dataSpike'
          }
        }
      }, d: defense
    }))).toBe(null)
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: {
        ...attack, data: {
          ...attack.data, test: {
            type: 'matrixAction', typeSub: 'bruteForce'
          }
        }
      }, d: defense
    }))).toBe(null)
  })
  it('does not read a player\'s attack card without dice as 0 hits (D3)', async () => {
    expect(await trustedDefenderDamage('d', 50, helpers({
      a: {
        ...attack, byGM: false, roller: npc, author: {
          name: 'Clo'
        }
      }, d: defense
    }))).toBe(null)
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

// SR5 p. 249: a failed IC attack damages the IC. The button of a defense against an IC was refused, even to the GM
// (false alarm in honest play, measured 08/10): the defense card is now read as trustedIceAttack reads the IC's
describe('trustedDefenderDamage against an IC', () => {
  const ice = actor('Actor.ice', 'actorDevice', {
    matrix: {
      deviceType: 'ice', deviceSubType: 'iceBlueGoo', attributes: {
        attack: {
          value: 4
        }
      }, ice: {
        attackDicepool: 8, defenseFirstAttribute: 'logic', defenseSecondAttribute: 'firewall'
      }
    }
  })
  const decker = actor('Actor.dk', 'actorPc', {
    attributes: {
      logic: {
        augmented: {
          value: 5
        }
      }
    }, matrix: {
      attributes: {
        firewall: {
          value: 2
        }
      }
    }, specialAttributes: {
      edge: {
        augmented: {
          value: 0
        }
      }
    }
  }, ['Clo'])
  const attack = {
    id: 'ia', roller: ice, byGM: true, data: {
      test: {
        type: 'iceAttack', typeSub: 'iceBlueGoo'
      }, roll: {
        hits: 2
      }
    }
  }
  const defense = {
    id: 'id', roller: decker, byGM: false, author: {
      name: 'Clo'
    }, data: {
      test: {
        type: 'iceDefense', typeSub: 'iceBlueGoo'
      }, previousMessage: {
        actorId: 'ice', messageId: 'ia'
      }, roll: {
        // Thirty hits claimed on eleven dice: seven fit the pool of 7 (Logic 5 + Firewall 2), five of them hits
        hits: 30, r: dice([5, 5, 5, 5, 5, 1, 1, 6, 6, 6, 6])
      }
    }
  }
  it('takes the GM\'s defense card as written', async () => {
    expect(await trustedDefenderDamage('id', 5, helpers({
      id: {
        ...defense, byGM: true
      }
    }))).toBe(5)
  })
  it('counts a player\'s defense again within its pool, against the IC attack card read again', async () => {
    expect(await trustedDefenderDamage('id', 50, helpers({
      ia: attack, id: defense
    }))).toBe(3)
  })
  it('refuses a player\'s defense whose attack card is no IC attack', async () => {
    expect(await trustedDefenderDamage('id', 50, helpers({
      id: defense
    }))).toBe(null)
    expect(await trustedDefenderDamage('id', 50, helpers({
      ia: {
        ...attack, roller: decker
      }, id: defense
    }))).toBe(null)
  })
})

describe('trustedComplexForm (lot 3)', () => {
  const spike = {
    id: 'cf', type: 'itemComplexForm', uuid: 'Actor.h.Item.cf', system: {
      systemEffects: [], defenseAttribute: 'willpower', defenseMatrixAttribute: 'firewall'
    }
  }
  const techno = {
    ...hacker, system: {
      ...hacker.system, matrix: {
        resonanceActions: {
          threadComplexForm: {
            test: {
              dicePool: 4
            }
          }
        }
      }
    }, items: {
      get: id => (id === 'cf' ? spike : null)
    }
  }
  const card = {
    id: 'c', roller: techno, byGM: false, author: {
      name: 'Clo'
    }, data: {
      test: {
        type: 'complexForm'
      }, owner: {
        itemId: 'cf'
      }, roll: {
        r: dice([6, 6, 6, 6, 6, 6], new Array(20).fill(6))
      }
    }
  }
  it('counts the hits again, no reroll without a push, and reads the sub type and defense on the form', async () => {
    const r = await trustedComplexForm({
      owner: {
        messageId: 'c'
      }, roll: {
        hits: 40
      }, test: {
        typeSub: 'resonanceSpike'
      }, various: {
        defenseFirstAttribute: 'body'
      }
    }, helpers({
      c: card
    }))
    expect(r.hits).toBe(4)
    expect(r.typeSub).toBe('')
    expect(r.defenseFirstAttribute).toBe('willpower')
  })
  it('keeps the sub type the form really has', () => {
    expect(complexFormSubType({
      system: {
        systemEffects: [{
          value: 'sre_Derezz'
        }]
      }
    })).toBe('derezz')
  })
  it('refuses a form that is not on its technomancer', async () => {
    expect(await trustedComplexForm({
      owner: {
        messageId: 'c'
      }
    }, helpers({
      c: {
        ...card, data: {
          ...card.data, owner: {
            itemId: 'other'
          }
        }
      }
    }))).toBe(null)
  })
})

describe('cardStandsFor', () => {
  it('lets only the actor a card was rolled for take its damage, from an author who owns it', async () => {
    const card = {
      id: 'r', roller: hacker, byGM: false, author: {
        name: 'Clo'
      }, data: {
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

describe('the sheet dropped between the roll and the defense (Laurine, 08/10)', () => {
  //Rolled with 12 dice, 7 hits; the deck switched off since: the sheet shows a pool of 0
  const offline = actor('Actor.o', 'actorPc', {
    ...hacker.system, matrix: {
      actions: {
        dataSpike: {
          limit: {
            linkedAttribute: 'attack', value: 0
          }, test: {
            dicePool: 0
          }
        }
      }
    }
  }, ['Clo'])
  const card = (kept, value, modifiers = []) => ({
    id: 'a', roller: offline, byGM: false, author: {
      name: 'Clo'
    }, data: {
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }, dicePool: {
        value, modifiers
      }, roll: {
        r: dice(kept)
      }
    }
  })
  const read = (c, hits) => trustedMatrixAction({
    owner: {
      messageId: 'a'
    }, roll: {
      hits
    }
  }, {
    ...helpers({
      a: c
    }), poolCap: (roller, path) => sheetValue(roller, path) + 2,
  })
  const honest = [5, 5, 5, 5, 5, 5, 5, 1, 2, 3, 4, 2]
  it('counts the honest card within the pool it was rolled with: no cut, no alert', async () => {
    const r = await read(card(honest, 12), 7)
    expect(r.hits).toBe(7)
    expect(r.overPool).toBe(null)
  })
  it('still tells and cuts dice past the pool the card was rolled with', async () => {
    const r = await read(card([...honest, ...new Array(18).fill(5)], 12), 25)
    expect(r.hits).toBe(7)
    expect(r.overPool).toEqual({
      dice: 30, cap: 14
    })
  })
  it('leaves out of that pool the Edge of a push the GM did not grant', async () => {
    expect(rolledPool({
      dicePool: {
        value: 14, modifiers: [{
          type: 'edge', value: 2
        }]
      }
    })).toBe(12)
    expect(rolledPool({
      dicePool: {
        value: 14, modifiers: [{
          type: 'pushTheLimit', value: 2
        }, {
          type: 'misc', value: 3
        }]
      }
    })).toBe(12)
    expect(rolledPool(undefined)).toBe(0)
  })
})
