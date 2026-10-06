import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// An AI outside any device attacked by an IC (Data Trails p. 157): the defense used to read deck.uuid
// on a device that does not exist and threw before any dialog opened. The IC now targets the persona:
// marks are read on it, and no link lock nor reboot is offered to an AI that cannot have either.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (type, action, label) => ({
      type, action, label
    }),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  default: iceDefense
} = await import('../modules/rolls/roll-prepare-case/rollData-IceDefense.js')
const {
  default: iceDefenseInfo
} = await import('../modules/rolls/roll-test-case/test-IceDefense.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

function ai({
  device = false, marks = []
} = {
}) {
  return {
    id: 'ai', type: 'actorPc', name: 'IA',
    items: device ? [{
      type: 'itemDevice', uuid: 'Actor.ai.Item.cl', name: 'Commlink', system: {
        isActive: true, marks
      }
    }] : [],
    system: {
      activeSpecialAttribute: 'depth',
      attributes: {
        intuition: {
          augmented: {
            value: 5
          }
        }, willpower: {
          augmented: {
            value: 3
          }
        }, logic: {
          augmented: {
            value: 1
          }
        }
      },
      matrix: {
        marks, isLinkLocked: false,
        attributes: {
          firewall: {
            value: 0
          }, dataProcessing: {
            value: 0
          }, attack: {
            value: 0
          }
        },
      },
    },
  }
}

function card(typeSub, itemUuid) {
  return {
    test: {
      typeSub
    }, roll: {
      hits: 0
    }, previousMessage: {
      hits: 3, actorId: 'ice'
    }, target: {
      itemUuid
    }, damage: {
      matrix: {
        value: 0
      }
    }, matrix: {
    }, owner: {
      speakerActor: 'CI'
    }, chatCard: {
      buttons: {
      }
    },
  }
}

const ice = {
  id: 'ice', name: 'CI', system: {
    matrix: {
      attributes: {
        attack: {
          value: 5
        }
      }
    }
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  game.i18n.format = vi.fn(k => k)
  // The GM's attack card, read again from the chat log (ice-attack-card.test.js); its IC names no defense
  // attributes, so the button's are kept
  vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue({
    id: 'attack', byGM: true, author: {
      isGM: true
    }, roller: {
      system: {
        matrix: {
          deviceType: 'ice', ice: {
            attackDicepool: 10
          }, attributes: {
            attack: {
              value: 5
            }
          }
        }
      }
    },
    data: {
      test: {
        type: 'iceAttack'
      }, roll: {
        hits: 3
      }, owner: {
        actorId: 'ice'
      }
    },
  })
})

describe('IC defense of an AI without a device (Data Trails p. 157)', () => {
  it('prepares the defense without a device to target', async () => {
    const rollData = {
      test: {
      }, dicePool: {
      }, target: {
      }, previousMessage: {
      }, damage: {
        matrix: {
          value: 5
        }
      }
    }
    const chatData = {
      various: {
        defenseFirstAttribute: 'intuition', defenseSecondAttribute: 'firewall'
      }, test: {
        typeSub: 'iceKiller'
      }, roll: {
        hits: 3
      }, owner: {
        actorId: 'ice'
      }
    }
    await expect(iceDefense(rollData, ai(), chatData)).resolves.toBeDefined()
    expect(rollData.target.itemUuid).toBeUndefined()
    expect(rollData.dicePool.base).toBe(5)
  })

  it('defends against a Logic IC with the attribute the world sets, and no Firewall', async () => {
    const roll = async (mode, device = false) => {
      game.settings.get = vi.fn((_ns, key) => key === 'sr5DevicelessAILogicDefense' ? mode : null)
      const rollData = {
        test: {
        }, dicePool: {
        }, target: {
        }, previousMessage: {
        }, damage: {
          matrix: {
          }
        }
      }
      const actor = ai({
        device
      })
      actor.system.matrix.attributes.firewall.value = 4
      await iceDefense(rollData, actor, {
        various: {
          defenseFirstAttribute: 'logic', defenseSecondAttribute: 'firewall'
        }, test: {
          typeSub: 'iceBlaster'
        }, roll: {
          hits: 3
        }, owner: {
          actorId: 'ice'
        }
      })
      return rollData.dicePool
    }
    expect((await roll('highest')).base).toBe(5)
    expect((await roll('highest')).composition.map(m => m.source)).toEqual(['SR5.Intuition'])
    expect((await roll('willpower')).base).toBe(3)
    expect((await roll('intuition')).base).toBe(5)
    // An AI on a device keeps Logic + Firewall
    expect((await roll('highest', true)).base).toBe(5)
    expect((await roll('highest', true)).composition.map(m => m.type)).toEqual(['linkedAttribute', 'matrixAttribute'])
  })

  it('still targets the active device of an AI that has one', async () => {
    const rollData = {
      test: {
      }, dicePool: {
      }, target: {
      }, previousMessage: {
      }, damage: {
        matrix: {
        }
      }
    }
    await iceDefense(rollData, ai({
      device: true
    }), {
      various: {
        defenseFirstAttribute: 'intuition', defenseSecondAttribute: 'firewall'
      }, test: {
      }, roll: {
      }, owner: {
      }
    })
    expect(rollData.target.itemUuid).toBe('Actor.ai.Item.cl')
  })

  it('reads the marks on the persona and offers neither link lock nor reboot', async () => {
    const target = ai({
      marks: [{
        ownerId: 'ice', value: 3
      }]
    })
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'ice' ? ice : target)
    for (const typeSub of ['iceFlicker', 'iceScramble', 'iceTarBaby']) {
      const data = card(typeSub, undefined)
      await expect(iceDefenseInfo(data, 'ai')).resolves.not.toThrow()
      expect(data.chatCard.buttons.iceEffect, typeSub).toBeUndefined()
    }
    const flicker = card('iceFlicker', undefined)
    await iceDefenseInfo(flicker, 'ai')
    expect(flicker.chatCard.buttons.attackerPlaceMark).toBeDefined()
  })
})
