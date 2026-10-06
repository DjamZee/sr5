import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Séance G, lot sécurité et CI (M2 S1, M2-1). The defense against an IC reads the attack card again from the chat log:
// a card a GM or an owner of the IC wrote, its hits counted again within the IC's pool and Attack when a player wrote
// it. And the DV starts at the IC's Attack (SR5 p. 250), read on its sheet

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  default: iceDefense, iceAttackHits
} = await import('../modules/rolls/roll-prepare-case/rollData-IceDefense.js')

const gm = {
  id: 'gm', isGM: true, name: 'MJ'
}
const player = {
  id: 'p1', isGM: false, name: 'Clo'
}

const ice = {
  id: 'ice', name: 'CI Blaster', system: {
    matrix: {
      deviceType: 'ice', deviceSubType: 'iceBlaster', deviceRating: 6,
      ice: {
        attackDicepool: 12, defenseFirstAttribute: 'logic', defenseSecondAttribute: 'firewall'
      },
      attributes: {
        attack: {
          value: 6
        }
      },
    },
  },
}

const defender = {
  id: 'ai', type: 'actorPc', items: [],
  system: {
    attributes: {
      logic: {
        augmented: {
          value: 5
        }
      }
    },
    matrix: {
      attributes: {
        firewall: {
          value: 0
        }
      }
    },
  },
}

// Dice as Foundry writes them on a card: `count` dice, all showing `face`
const dice = (count, face = 6) => JSON.stringify({
  terms: [{
    results: Array.from({
      length: count
    }, () => ({
      result: face, active: true
    }))
  }]
})

function attackCard({
  author = gm, hits = 3, type = 'iceAttack', roller = ice, r = dice(3, 5)
} = {
}) {
  return {
    id: 'attack', author, byGM: !!author.isGM, roller,
    data: {
      test: {
        type, typeSub: 'iceBlaster'
      }, roll: {
        hits, r
      }, owner: {
        actorId: 'ice'
      },
    },
  }
}

// The data of the clicked button: a player can write anything on it
const clicked = {
  owner: {
    messageId: 'attack', actorId: 'ice'
  }, roll: {
    hits: 30
  }, test: {
    typeSub: 'iceBlaster'
  },
  various: {
    defenseFirstAttribute: 'logic', defenseSecondAttribute: 'firewall'
  },
}

const rollData = () => ({
  test: {
  }, dicePool: {
  }, target: {
  }, previousMessage: {
  }, damage: {
    matrix: {
      value: 0
    }
  }
})

let confirm
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = gm
  ui.notifications.warn = vi.fn()
  game.i18n.format = vi.fn(k => k)
  confirm = vi.fn(async () => true)
  foundry.applications.api.DialogV2 = {
    confirm
  }
})

describe('iceAttackHits', () => {
  it('stands by a GM\'s card as written', () => {
    expect(iceAttackHits({
      byGM: true, written: 4
    })).toBe(4)
  })

  it('counts a player\'s card again within the IC\'s pool and its Attack limit', () => {
    // thirty dice all sixes written on the card: twelve count, six hits at most (limit Attack 6)
    expect(iceAttackHits({
      byGM: false, written: 30, rollJSON: dice(30), pool: 12, limit: 6
    })).toBe(6)
    expect(iceAttackHits({
      byGM: false, written: 30, rollJSON: dice(12, 5), pool: 12, limit: 20
    })).toBe(12)
    expect(iceAttackHits({
      byGM: false, written: 3, rollJSON: null, pool: 12, limit: 6
    })).toBeNull()
  })
})

describe('defense against an IC attack card', () => {
  it('refuses a card no GM nor owner of the IC wrote (S1)', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(null)
    const data = rollData()
    expect(await iceDefense(data, defender, clicked)).toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_IceAttackCardRefused')
  })

  it('refuses a trusted card that is not an IC attack, or not rolled by an IC', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(attackCard({
      type: 'matrixAction'
    }))
    expect(await iceDefense(rollData(), defender, clicked)).toBeUndefined()
    SR5_MiscellaneousHelpers.cardOf.mockReturnValue(attackCard({
      roller: defender
    }))
    expect(await iceDefense(rollData(), defender, clicked)).toBeUndefined()
  })

  it('takes the hits of the GM\'s card, never those of the button (S1)', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(attackCard())
    const data = await iceDefense(rollData(), defender, clicked)
    expect(data.previousMessage.hits).toBe(3)
    expect(data.previousMessage.messageId).toBe('attack')
    expect(data.dicePool.base).toBe(5)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('has the GM confirm the hits counted again on an IC owner\'s card, and stops if declined', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(attackCard({
      author: player, hits: 30, r: dice(30)
    }))
    const data = await iceDefense(rollData(), defender, clicked)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(data.previousMessage.hits).toBe(6)
    confirm.mockResolvedValue(false)
    expect(await iceDefense(rollData(), defender, clicked)).toBeUndefined()
  })

  it('starts the DV at the IC\'s Attack, read on its sheet (M2-1, SR5 p. 250)', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(attackCard())
    const data = await iceDefense(rollData(), defender, clicked)
    expect(data.damage.matrix.base).toBe(6)
  })
})
