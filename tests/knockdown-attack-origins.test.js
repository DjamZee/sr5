import {
  describe, it, expect, vi
} from 'vitest'

// SR5 p. 195: only an attack knocks down. Some attacks start their resistance without a defense card,
// so they must mark their damage themselves; damage that is not an attack must stay unmarked.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (type, action, label) => ({
      type, action, label
    }),
    updateChatButtonHelper: () => {},
  },
}))
vi.mock('../modules/rolls/roll-helpers/mark.js', () => ({
  SR5_MarkHelpers: {
    findMarkValue: async () => 1,
  },
}))
vi.mock('../modules/rolls/roll-helpers/matrix.js', () => ({
  SR5_MatrixHelpers: {
  },
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
  },
}))

const {
  default: attackInfo
} = await import('../modules/rolls/roll-test-case/test-Attack.js')
const {
  default: iceDefenseInfo
} = await import('../modules/rolls/roll-test-case/test-IceDefense.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

const attackCard = (typeSub, isGrenade, hits) => ({
  test: {
    typeSub, type: 'attack'
  },
  roll: {
    hits
  },
  damage: {
    base: 10, value: 10, type: 'physical', element: '', isAttack: false
  },
  combat: {
    choke: {
    }, armorPenetration: -2, grenade: {
      isGrenade
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

describe('attacks without a defense card mark their damage', () => {
  it('a grenade, a grenade launcher or a missile launcher is an attack', async () => {
    for (const [typeSub, isGrenade] of [['grenade', true], ['rangedWeapon', true]]) {
      const c = attackCard(typeSub, isGrenade, 1)
      await attackInfo(c)
      expect(c.chatCard.buttons.resistanceCard).toBeDefined()
      expect(c.damage.isAttack).toBe(true)
    }
  })

  it('an ordinary shot is left to its defense card', async () => {
    const c = attackCard('rangedWeapon', false, 2)
    await attackInfo(c)
    expect(c.damage.isAttack).toBe(false)
  })

  it('the Catapult IC attack is marked on the IC defense card', async () => {
    const defender = {
      id: 'd1', name: 'Decker', system: {
        matrix: {
          attributes: {
            firewall: {
              value: 3
            }
          }
        }
      }
    }
    const ice = {
      id: 'i1', name: 'Catapulte', system: {
      }
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'd1' ? defender : ice))
    globalThis.fromUuid = async () => ({
      system: {
      }
    })
    const c = {
      test: {
        typeSub: 'iceCatapult'
      },
      previousMessage: {
        hits: 4, actorId: 'i1'
      },
      roll: {
        hits: 1
      },
      target: {
        itemUuid: 'x'
      },
      damage: {
        isAttack: false, matrix: {
        }
      },
      chatCard: {
        buttons: {
        }
      },
    }
    await iceDefenseInfo(c, 'd1')
    expect(c.chatCard.buttons.resistanceCard).toBeDefined()
    expect(c.damage.isAttack).toBe(true)
  })
})

describe('damage that is not an attack stays unmarked', () => {
  it('a toxin delivered by a gas grenade does not knock down', async () => {
    const takeDamage = vi.fn()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue({
      effects: [], takeDamage, createEmbeddedDocuments: vi.fn()
    })
    await SR5_ActorHelper.applyToxinEffect('a1', {
      damage: {
        type: 'stun', value: 6, isAttack: true, toxin: {
          effect: {
          }
        }
      }
    })
    expect(takeDamage).toHaveBeenCalledOnce()
    expect(takeDamage.mock.calls[0][0].damage.isAttack).toBe(false)
  })
})

describe('matrix attacks are attacks', () => {
  const matrixCard = (typeSub, attackerHits, defenderHits) => ({
    test: {
      typeSub
    },
    previousMessage: {
      hits: attackerHits, actorId: 'h1'
    },
    roll: {
      hits: defenderHits
    },
    target: {
    },
    matrix: {
      actionType: 'attack', mark: 1
    },
    owner: {
    },
    damage: {
      isAttack: false, matrix: {
      }
    },
    effects: {
    },
    chatCard: {
      buttons: {
      }
    },
  })
  const persona = userMode => ({
    id: 'x', name: 'X', type: 'actorPc', system: {
      matrix: {
        userMode, deviceType: 'device', programs: {
          biofeedback: {
            isActive: true
          }, blackout: {
            isActive: false
          }
        }
      }
    }
  })

  it('an offensive complex form that gets through is an attack', async () => {
    const {
      default: complexFormDefenseInfo
    } = await import('../modules/rolls/roll-test-case/test-ComplexFormDefense.js')
    const c = matrixCard('resonanceSpike', 4, 1)
    await complexFormDefenseInfo(c)
    expect(c.chatCard.buttons.takeMatrixDamage).toBeDefined()
    expect(c.damage.isAttack).toBe(true)
  })

  it('a matrix attack that gets through is an attack, the biofeedback sent back is not', async () => {
    const {
      default: matrixDefenseInfo
    } = await import('../modules/rolls/roll-test-case/test-MatrixDefense.js')
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => persona(id === 'h1' ? 'hotsim' : 'ar'))
    const hit = matrixCard('hackOnTheFly', 4, 1)
    await matrixDefenseInfo(hit, 'd1')
    expect(hit.damage.isAttack).toBe(true)
    const riposte = matrixCard('dataSpike', 1, 4)
    await matrixDefenseInfo(riposte, 'd1')
    expect(riposte.chatCard.buttons.defenderDoBiofeedbackDamage).toBeDefined()
    expect(riposte.damage.isAttack).toBe(false)
  })
})
