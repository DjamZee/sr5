import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}
globalThis.fromUuid = vi.fn(async () => null)
const testCases = await import('../modules/rolls/roll-test-case/index.js')
const prepareCases = await import('../modules/rolls/roll-prepare-case/index.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')

let actor
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    isGM: true
  }
  actor = {
    id: 'a1', name: 'IA', type: 'actorPc', isOwner: true, items: [],
    system: {
      matrix: {
        overwatchScore: 0,
        actions: {
          dataSpike: {
            increaseOverwatchScore: true,
            defense: {
              modifiers: [{
                source: 'SR5.Intuition', type: 'linkedAttribute', value: 4
              }]
            }
          }
        },
        programs: {
          biofeedback: {
            isActive: false
          },
          blackout: {
            isActive: false
          }
        },
        userMode: 'ar',
      },
      specialAttributes: {
      },
      specialProperties: {
      },
    },
    update: vi.fn(async function (data) {
      this.system = data.system
    }),
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => actor)
  vi.spyOn(SR5_RollMessage, 'generateChatButton').mockImplementation((_t, action, label) => label ?? action)
  vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockImplementation(async () => {})
})

describe('Emulate on a Matrix Search (Data Trails p. 159)', () => {
  function searchCard(hits) {
    return {
      roll: {
        hits
      },
      edge: {
      },
      test: {
        type: 'matrixAction', typeSub: 'matrixSearch', title: 'Test'
      },
      threshold: {
        value: 2, type: 'generalInformation'
      },
      matrix: {
        emulateRating: 3
      },
      chatCard: {
        buttons: {
        }
      },
      previousMessage: {
      },
    }
  }

  it('raises the Overwatch Score and names Emulate in the title', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'getMatrixSearchDuration').mockResolvedValue('1 min')
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    const card = searchCard(3)
    await testCases.matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledWith(3, 'a1')
    expect(card.test.title).toBe('SR5.MatrixActionTestSR5.Colons SR5.MatrixActionMatrixSearch (2) (SR5.MatrixActionEmulate 3)')
    expect(card.chatCard.buttons.matrixSearchSuccess).toBeDefined()
  })

  it('keeps Emulate in the rebuilt title on Second Chance, without raising the score again', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'getMatrixSearchDuration').mockResolvedValue('1 min')
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    const card = searchCard(1)
    await testCases.matrixActionInfo(card, 'a1')
    card.roll.hits = 3
    await testCases.matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledTimes(1)
    expect(card.test.title).toBe('SR5.MatrixActionTestSR5.Colons SR5.MatrixActionMatrixSearch (2) (SR5.MatrixActionEmulate 3)')
  })
})

describe('The Overwatch Score never goes below 0 (SR5 p. 231)', () => {
  it('a decrease larger than the score stops at 0', async () => {
    await SR5_ActorHelper.overwatchIncrease(-4, 'a1')
    expect(actor.system.matrix.overwatchScore).toBe(0)
  })

  it('a decrease within the score still lowers it', async () => {
    actor.system.matrix.overwatchScore = 10
    await SR5_ActorHelper.overwatchIncrease(-4, 'a1')
    expect(actor.system.matrix.overwatchScore).toBe(6)
  })

  it('the GM side of the socket never lowers it on a relay (Quitterie, 06/10: a score from 3 to 0)', async () => {
    actor.system.matrix.overwatchScore = 1
    // The owner of the actor only raises it on that socket (security lot, Thomas): Emulate lowers it on her own client
    actor.testUserPermission = (user) => user?.id === "owner"
    game.users = {
      get: (id) => ({
        id
      })
    }
    await SR5_ActorHelper._socketOverwatchIncrease({
      data: {
        defenseHits: -3, actorId: 'a1'
      }
    }, "owner")
    expect(actor.system.matrix.overwatchScore).toBe(1)
  })
})

describe('Object resistance keeps the button of an area spell only', () => {
  async function resist(area) {
    game.messages = {
      get: () => ({
        flags: {
          sr5data: {
            test: {
              type: 'spell'
            }, magic: {
              spell: {
                area
              }
            }, owner: {
            }
          }
        }
      })
    }
    await testCases.objectResistanceResultInfo({
      previousMessage: {
        messageId: 'm1', hits: 0
      },
      roll: {
        hits: 2
      },
      chatCard: {
        buttons: {
        }
      },
    })
    return SR5_RollMessage.updateChatButtonHelper.mock.calls.length > 0
  }

  it('removes the button of a spell without area', async () => {
    expect(await resist(0)).toBe(true)
  })

  it('keeps it on an area spell, other objects in the area may still resist', async () => {
    expect(await resist(3)).toBe(false)
  })

  it('removes it whenever the area is not positive', async () => {
    expect(await resist(-1)).toBe(true)
  })
})

describe('Matrix defense of an AI without a device (Data Trails p. 157)', () => {
  const chatData = {
    roll: {
      hits: 3
    },
    target: {
    },
    matrix: {
      mark: 1, actionType: 'attack'
    },
    owner: {
      actorId: 'b1', messageId: 'm1'
    },
    previousMessage: {
    },
  }

  function emptyRollData() {
    return {
      test: {
      }, dicePool: {
      }, target: {
      }, combat: {
        activeDefenses: {
        }
      }, matrix: {
      }, previousMessage: {
      }
    }
  }

  it('prepares the defense with no targeted device', async () => {
    const rollData = await prepareCases.matrixDefense(emptyRollData(), 'dataSpike', actor, chatData)
    expect(rollData.target.itemUuid).toBeUndefined()
    expect(rollData.dicePool.base).toBe(4)
  })

  it('still targets the active device when there is one', async () => {
    actor.items = [{
      type: 'itemDevice', uuid: 'Actor.a1.Item.d1', system: {
        isActive: true
      }
    }]
    const rollData = await prepareCases.matrixDefense(emptyRollData(), 'dataSpike', actor, chatData)
    expect(rollData.target.itemUuid).toBe('Actor.a1.Item.d1')
  })

  it('names the AI on the mark button when the attacker wins', async () => {
    const card = {
      roll: {
        hits: 0
      },
      target: {
      },
      matrix: {
        mark: 1
      },
      test: {
        typeSub: 'hackOnTheFly'
      },
      previousMessage: {
        actorId: 'b1', hits: 3
      },
      owner: {
        speakerActor: 'Decker'
      },
      damage: {
        matrix: {
        }
      },
      chatCard: {
        buttons: {
        }
      },
    }
    const format = vi.spyOn(game.i18n, 'format')
    await testCases.matrixDefenseInfo(card, 'a1')
    expect(format).toHaveBeenCalledWith('SR5.AttackerPlaceMarkTo', expect.objectContaining({
      item: 'IA'
    }))
  })
})

describe('Matrix damage against an AI without a device (Data Trails p. 157, 161)', () => {
  function spikeCard() {
    return {
      roll: {
        hits: 0
      },
      target: {
      },
      matrix: {
        mark: 0, actionType: 'attack'
      },
      test: {
        typeSub: 'dataSpike'
      },
      previousMessage: {
        actorId: 'b1', hits: 3
      },
      owner: {
      },
      damage: {
        matrix: {
        }
      },
      chatCard: {
        buttons: {
        }
      },
    }
  }

  beforeEach(() => {
    Object.assign(actor.system.matrix.programs, {
      mugger: {
        isActive: false
      }, guard: {
        isActive: false
      }, hammer: {
        isActive: false
      }
    })
    actor.system.matrix.attributes = {
      attack: {
        value: 4
      }
    }
    actor.system.matrix.marks = []
  })

  it('a successful Data Spike yields its damage and the resistance button', async () => {
    const card = spikeCard()
    await testCases.matrixDefenseInfo(card, 'a1')
    expect(card.damage.matrix.value).toBe(7)
    expect(card.chatCard.buttons.matrixResistance).toBeDefined()
  })

  it('the marks on the persona add to the damage', async () => {
    actor.system.matrix.marks = [{
      ownerId: 'a1', value: 2
    }]
    const card = spikeCard()
    await testCases.matrixDefenseInfo(card, 'a1')
    expect(card.damage.matrix.value).toBe(11)
  })
})

describe('Applying matrix damage without a device (Data Trails p. 161)', () => {
  const card = () => ({
    damage: {
      matrix: {
        value: 5
      }
    }, target: {
    }
  })

  it('goes to the core condition monitor of an AI', async () => {
    actor.system.activeSpecialAttribute = 'depth'
    actor.takeDamage = vi.fn(async () => {})
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card())
    expect(actor.takeDamage).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a character who is not an AI', async () => {
    actor.system.activeSpecialAttribute = 'magic'
    actor.takeDamage = vi.fn(async () => {})
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card())
    expect(actor.takeDamage).not.toHaveBeenCalled()
  })

  it('still damages the active device when there is one', async () => {
    actor.system.activeSpecialAttribute = 'depth'
    actor.takeDamage = vi.fn(async () => {})
    actor.system.matrix.programs.virtualMachine = {
      isActive: false
    }
    const update = vi.fn(async () => {})
    actor.items = [{
      type: 'itemDevice', name: 'Deck', uuid: 'Actor.a1.Item.d1', update, system: {
        isActive: true, type: 'cyberdeck', conditionMonitors: {
          matrix: {
            value: 10, actual: {
              base: 1, value: 1, modifiers: []
            }
          }
        }
      }
    }]
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card())
    expect(actor.takeDamage).not.toHaveBeenCalled()
    expect(update.mock.calls[0][0].system.conditionMonitors.matrix.actual.base).toBe(6)
  })
})

describe('Matrix defense pool of an AI without a device (Data Trails p. 157)', async () => {
  const {
    SR5_CharacterUtility
  } = await import('../modules/entities/actors/utilityActor.js')
  const {
    SR5
  } = await import('../modules/config.js')
  let previousGet

  /** A character sheet with every matrix defense, prepared under the given setting */
  function defenses({
    depth = true, device = false, intuition = 5, willpower = 3, mode = 'highest'
  } = {
  }) {
    const actions = {
    }
    for (const key of [...Object.keys(SR5.matrixActions), 'checkOverwatchScore']) actions[key] = {
      defense: {
        base: 0, dicePool: 0, modifiers: []
      }
    }
    const value = v => ({
      augmented: {
        value: v
      }
    })
    const sheet = {
      type: 'actorPc', name: 'IA', items: device ? [{
        type: 'itemDevice', system: {
          isActive: true
        }
      }] : [],
      system: {
        activeSpecialAttribute: depth ? 'depth' : 'magic',
        attributes: {
          intuition: value(intuition), willpower: value(willpower), logic: value(6)
        },
        matrix: {
          actions, attributes: {
            firewall: {
              value: 4
            }, sleaze: {
              value: 2
            }, dataProcessing: {
              value: 3
            }, attack: {
              value: 1
            }
          }
        },
      },
    }
    game.settings.get = (_ns, key) => key === 'sr5DevicelessAILogicDefense' ? mode : null
    SR5_CharacterUtility.generateMatrixActionsDefenses(sheet)
    game.settings.get = previousGet
    return actions
  }
  const sources = defense => defense.modifiers.map(m => m.source)

  beforeEach(() => {
    previousGet = game.settings.get
  })

  it('stands the higher of Willpower and Intuition in for Logic, by default, with no matrix attribute', () => {
    const actions = defenses()
    expect(sources(actions.snoop.defense)).toEqual(['SR5.Intuition'])
    expect(actions.snoop.defense.dicePool).toBe(5)
    expect(defenses({
      willpower: 7
    }).snoop.defense.dicePool).toBe(7)
  })

  it('keeps Willpower and Intuition where the defense already uses them', () => {
    const actions = defenses()
    expect(actions.eraseMark.defense.dicePool).toBe(3)
    expect(sources(actions.eraseMark.defense)).toEqual(['SR5.Willpower'])
    expect(actions.dataSpike.defense.dicePool).toBe(5)
  })

  it('follows the world setting', () => {
    expect(defenses({
      mode: 'willpower'
    }).snoop.defense.dicePool).toBe(3)
    expect(defenses({
      mode: 'intuition', willpower: 7
    }).snoop.defense.dicePool).toBe(5)
  })

  it('leaves an AI with a device and any other character as they were', () => {
    for (const actions of [defenses({
      device: true
    }), defenses({
      depth: false
    })]) {
      expect(sources(actions.snoop.defense)).toEqual(['SR5.Logic', 'SR5.Firewall'])
      expect(actions.snoop.defense.dicePool).toBe(10)
    }
  })
})

describe('Matrix target choice of a character without a device', () => {
  it('names the persona when there is no device name', async () => {
    let shown
    foundry.applications.handlebars = {
      renderTemplate: vi.fn(async (_path, data) => {
        shown = data
        return ''
      })
    }
    foundry.applications.api.DialogV2 = {
      wait: vi.fn(async () => null)
    }
    actor.system.matrix.deviceName = ''
    actor.system.matrix.connectedObject = {
    }
    await SR5_MatrixHelpers.chooseMatrixDefender({
    }, actor)
    expect(shown.device).toBe('IA')
    actor.system.matrix.deviceName = 'Deck'
    await SR5_MatrixHelpers.chooseMatrixDefender({
    }, actor)
    expect(shown.device).toBe('Deck')
  })
})
