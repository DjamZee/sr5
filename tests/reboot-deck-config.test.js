import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  ActorSheetSR5
} = await import('../modules/entities/actors/baseSheet.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

/** A document whose update merges the flattened changes the way Foundry does */
function documentWith(data) {
  const doc = {
    ...data,
    update: vi.fn(async changes => {
      for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(doc, path, value)
    }),
  }
  Object.defineProperty(doc, '_source', {
    get: () => doc
  })
  return doc
}

/**
 * An actor's system as Foundry gives it: deviceName and markedItems are prepared from the
 * active device, while a copy (foundry.utils.duplicate, through DataModel#toJSON) only
 * holds the source, where both are empty.
 */
function preparedSystem(activeDeck) {
  const source = () => ({
    matrix: {
      attributes: {
        attack: {
          base: 2
        }, dataProcessing: {
          base: 3
        }, firewall: {
          base: 4
        }, sleaze: {
          base: 5
        }
      },
      attributesCollection: {
        value1isSet: true, value2isSet: true, value3isSet: true, value4isSet: true
      },
      overwatchScore: 7,
      markedItems: [],
      marks: [],
      deviceName: '',
      deviceType: 'cyberdeck',
    },
    specialProperties: {
      actions: {
        simple: {
          current: 2
        },
        complex: {
          current: 1
        }
      }
    },
  })
  const system = source()
  Object.defineProperty(system.matrix, 'markedItems', {
    get: () => activeDeck.system.markedItems, enumerable: true
  })
  system.matrix.deviceName = activeDeck.name
  Object.defineProperty(system, 'toJSON', {
    value: source
  })
  return system
}

let hacker, activeDeck, spareDeck, pc, commlink, server, serverFile
beforeEach(() => {
  vi.clearAllMocks()
  game.user = {
    isGM: true, id: 'gm'
  }
  game.combat = null
  commlink = documentWith({
    type: 'itemDevice', uuid: 'Actor.pc.Item.c', name: 'Commlink', system: {
      isActive: true, marks: [{
        ownerId: 'hacker', value: 2
      }, {
        ownerId: 'other', value: 1
      }]
    }
  })
  pc = documentWith({
    id: 'pc', name: 'PJ', type: 'actorPc', items: [commlink], system: {
      matrix: {
        marks: [], deviceType: 'commlink'
      }
    }
  })
  commlink.parent = pc
  serverFile = documentWith({
    type: 'itemDevice', uuid: 'Actor.srv.Item.f', name: 'Fichier', system: {
      marks: [{
        ownerId: 'hacker', value: 1
      }]
    }
  })
  server = documentWith({
    id: 'srv', name: 'Serveur', type: 'actorDevice', items: [serverFile], system: {
      matrix: {
        marks: [], deviceType: 'device'
      }
    }
  })
  serverFile.parent = server
  // The active deck marked the server file, the spare deck marked the PC commlink before being put away
  activeDeck = documentWith({
    _id: 'deck', type: 'itemDevice', name: 'Hermes Chariot', system: {
      isActive: true, markedItems: [{
        uuid: serverFile.uuid
      }], marks: []
    }
  })
  spareDeck = documentWith({
    _id: 'spare', type: 'itemDevice', name: 'Erika MCD-6', system: {
      isActive: false, markedItems: [{
        uuid: commlink.uuid
      }], marks: []
    }
  })
  hacker = Object.create(SR5Actor.prototype)
  Object.assign(hacker, {
    id: 'hacker', name: 'Hackeuse', type: 'actorPc', isToken: false, items: [activeDeck, spareDeck],
    system: preparedSystem(activeDeck),
    deleteEmbeddedDocuments: vi.fn(),
  })
  // The sheet's update writes the decks back from the copy of the items
  hacker.update = vi.fn(async changes => {
    if (!changes.items) return
    for (const deck of [activeDeck, spareDeck]) deck.system.markedItems = changes.items.find(i => i._id === deck._id).system.markedItems
  })
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => ({
    hacker, pc, srv: server
  })[id])
  globalThis.fromUuid = vi.fn(async uuid => ({
    [commlink.uuid]: commlink, [serverFile.uuid]: serverFile
  })[uuid] ?? null)
  vi.spyOn(ui.notifications, 'info').mockImplementation(() => {})
})

describe('Rebooting a deck (SR5 p. 244)', () => {
  it('names the rebooted device in the notification', async () => {
    await hacker.rebootDeck()
    expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringMatching(/^Hermes Chariot \S/))
  })

  it('wipes the marks traced on an inactive deck along with the trace', async () => {
    await hacker.rebootDeck()
    expect(spareDeck.system.markedItems).toEqual([])
    expect(commlink.system.marks).toEqual([{
      ownerId: 'other', value: 1
    }])
  })

  it('still wipes the marks of the active deck', async () => {
    await hacker.rebootDeck()
    expect(activeDeck.system.markedItems).toEqual([])
    expect(serverFile.system.marks).toEqual([])
  })

  it('sends the traces of every deck to the GM when a player reboots', async () => {
    game.user = {
      isGM: false, id: 'player'
    }
    await hacker.rebootDeck()
    const call = SR5_SocketHandler.emitForGM.mock.calls.find(c => c[0] === 'deleteMarksOnActor')
    expect(call[1].actorData.matrix.markedItems.map(m => m.uuid)).toEqual([serverFile.uuid, commlink.uuid])
  })

  it('keeps the deck configuration and resets only the Overwatch Score (SR5 p. 229, p. 244)', async () => {
    await hacker.rebootDeck()
    const matrix = hacker.update.mock.calls[0][0].system.matrix
    expect(matrix.overwatchScore).toBe(0)
    expect([matrix.attributes.attack.base, matrix.attributes.sleaze.base, matrix.attributes.dataProcessing.base, matrix.attributes.firewall.base]).toEqual([2, 5, 3, 4])
    expect(matrix.attributesCollection).toEqual({
      value1isSet: true, value2isSet: true, value3isSet: true, value4isSet: true
    })
  })

  it('refuses the reboot button of a link-locked character and changes nothing (SR5 p. 231, p. 244)', async () => {
    hacker.system.matrix.isLinkLocked = true
    vi.spyOn(ui.notifications, 'warn').mockImplementation(() => {})
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      get: () => hacker
    })
    for (const isGM of [true, false]) {
      game.user = {
        isGM, id: isGM ? 'gm' : 'player'
      }
      expect(await sheet._onRebootDeck({
        preventDefault(){}
      })).toBe(false)
    }
    expect(ui.notifications.warn).toHaveBeenCalledTimes(2)
    expect(hacker.update).not.toHaveBeenCalled()
    expect(SR5_SocketHandler.emitForGM).not.toHaveBeenCalled()
    expect(commlink.system.marks).toHaveLength(2)
    expect(spareDeck.system.markedItems).toHaveLength(1)
  })

  it('lets the reboot button through once the connection is free', async () => {
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      get: () => hacker
    })
    await sheet._onRebootDeck({
      preventDefault(){}
    })
    // The reboot, then the complex action the character chose to spend on it (SR5 p. 231)
    expect(hacker.update).toHaveBeenCalledTimes(2)
    // ... which leaves no simple action either (SR5 p. 164)
    expect(hacker.update.mock.calls[1][0]).toEqual({
      "system.specialProperties.actions.simple.current": 0,
      "system.specialProperties.actions.complex.current": 0
    })
  })

  // An IC forces the reboot (SR5 p. 250): the link lock holds back the character, not the IC
  it.each(['iceFlicker', 'iceScramble'])('lets %s reboot a link-locked deck', async typeSub => {
    hacker.system.matrix.isLinkLocked = true
    hacker.system.matrix.userMode = 'ar'
    activeDeck.uuid = 'Actor.hacker.Item.deck'
    activeDeck.system.marks = [{
      ownerId: 'ice', value: 2
    }]
    globalThis.fromUuid.mockImplementation(async uuid => ({
      [commlink.uuid]: commlink, [serverFile.uuid]: serverFile, [activeDeck.uuid]: activeDeck
    })[uuid] ?? null)
    vi.spyOn(SR5_MatrixHelpers, 'applylinkLockEffect').mockResolvedValue()
    const reboot = vi.spyOn(hacker, 'rebootDeck')
    await SR5_MatrixHelpers.applyIceEffect({
      test: {
        typeSub
      }, target: {
        itemUuid: activeDeck.uuid
      }, damage: {
      }
    }, {
      id: 'ice', name: 'CI'
    }, hacker)
    await reboot.mock.results[0].value
    expect(reboot).toHaveBeenCalledTimes(1)
    expect(hacker.update).toHaveBeenCalledTimes(1)
    expect(activeDeck.system.markedItems).toEqual([])
    expect(serverFile.system.marks).toEqual([])
  })

  // A reboot forced by an IC (SR5 p. 250) is no action of the character's: only the sheet button spends one
  it('spends none of the character actions by itself', async () => {
    await hacker.rebootDeck()
    expect(hacker.update).toHaveBeenCalledTimes(1)
    expect(hacker.update.mock.calls[0][0].system.specialProperties.actions.complex.current).toBe(1)
  })
})

describe('Jacking out reboots the device used (SR5 p. 244)', () => {
  let dumpshock
  beforeEach(() => {
    vi.spyOn(SR5_EntityHelpers, 'deleteEffectOnActor').mockResolvedValue()
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
      damage: {
      }
    }))
    dumpshock = hacker.rollTest = vi.fn()
  })

  /** A link lock as applylinkLockEffect creates it */
  function linkLock(id) {
    return {
      id, type: 'itemEffect', system: {
        type: 'linkLock', customEffects: {
          0: {
            target: 'system.matrix.isLinkLocked'
          }
        }
      }
    }
  }

  it.each([
    ['free, in AR', 'ar', false],
    ['free, in cold sim', 'coldsim', true],
    ['link-locked, in hot sim', 'hotsim', true],
  ])('%s: Overwatch Score to 0, marks wiped, configuration kept, no action spent', async (_case, userMode, shocked) => {
    hacker.system.matrix.userMode = userMode
    await SR5_MatrixHelpers.jackOut({
      owner: {
        actorId: 'hacker'
      }, previousMessage: {
      }
    })
    const system = hacker.update.mock.calls[0][0].system
    expect(system.matrix.overwatchScore).toBe(0)
    expect(system.matrix.attributes.sleaze.base).toBe(5)
    expect(system.specialProperties.actions.complex.current).toBe(1)
    expect(activeDeck.system.markedItems).toEqual([])
    expect(serverFile.system.marks).toEqual([])
    expect(commlink.system.marks).toHaveLength(1)
    // Dumpshock in VR only, cold sim included (SR5 p. 231)
    expect(dumpshock).toHaveBeenCalledTimes(shocked ? 1 : 0)
  })

  // SR5 p. 246: one roll, compared to each lock; only the beaten ones go
  describe('under two link locks', () => {
    beforeEach(() => {
      hacker.system.matrix.isLinkLocked = true
      hacker.items.push(linkLock('lock1'), linkLock('lock2'))
      hacker.deleteEmbeddedDocuments = vi.fn(async (_type, ids) => {
        hacker.items = hacker.items.filter(i => !ids.includes(i.id))
      })
      // The active GM rolls the locks, once per card (Anke's review)
      game.users = {
        activeGM: {
          isSelf: true
        }
      }
      const spent = new Set()
      vi.spyOn(SR5_MiscellaneousHelpers, 'consume').mockImplementation(async key => !spent.has(key) && !!spent.add(key))
    })

    /** The success button of the resistance card rolled against one lock */
    const beat = itemUuid => SR5_MatrixHelpers.jackOut({
      owner: {
        actorId: 'hacker'
      }, previousMessage: {
        itemUuid
      }
    })

    it('beating one lock removes it alone, and the device does not reboot', async () => {
      await beat('lock2')
      expect(hacker.items.map(i => i.id)).toContain('lock1')
      expect(hacker.items.map(i => i.id)).not.toContain('lock2')
      expect(SR5_EntityHelpers.deleteEffectOnActor).not.toHaveBeenCalled()
      expect(hacker.update).not.toHaveBeenCalled()
      expect(dumpshock).not.toHaveBeenCalled()
    })

    it('beating the last lock frees the character and reboots the device', async () => {
      await beat('lock2')
      await beat('lock1')
      expect(hacker.items.some(i => i.type === 'itemEffect')).toBe(false)
      expect(SR5_EntityHelpers.deleteEffectOnActor).toHaveBeenCalledWith(hacker, 'linkLock')
      expect(hacker.update).toHaveBeenCalledTimes(1)
      expect(hacker.update.mock.calls[0][0].system.matrix.overwatchScore).toBe(0)
    })

    it('rolls one resistance per lock, each against the same jack out hits', async () => {
      hacker.items.find(i => i.id === 'lock1').system.value = 4
      hacker.items.find(i => i.id === 'lock2').system.value = 6
      vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
        test: {
        }, dicePool: {
        }, previousMessage: {
        }
      }))
      const rollDice = vi.spyOn(SR5_RollTest, 'rollDice').mockResolvedValue({
      })
      vi.spyOn(SR5_RollTest, 'addInfoToCard').mockResolvedValue()
      const render = vi.spyOn(SR5_RollTest, 'renderRollCard').mockResolvedValue()
      // A GM's card: its hits are believed as written
      vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue({
        byGM: true, roller: hacker, data: {
          test: {
            typeSub: 'jackOut'
          }, roll: {
            hits: 3
          }
        }
      })
      await SR5_MatrixHelpers.rollJackOut({
        owner: {
          actorId: 'hacker', messageId: 'card'
        }, roll: {
          hits: 3
        }, previousMessage: {
        }
      })
      expect(rollDice.mock.calls.map(c => c[0].dicePool)).toEqual([4, 6])
      expect(render.mock.calls.map(c => [c[0].previousMessage.itemUuid, c[0].previousMessage.hits])).toEqual([['lock1', 3], ['lock2', 3]])
    })

    // Security pass (Petra): the GM never believes the hits a player's Jack Out card claims
    describe("a player's card", () => {
      let render
      /** Dice as Foundry stores them on a card: the hits are the 5 and 6 */
      const diceRoll = results => JSON.stringify({
        terms: [{
          results: results.map(result => ({
            result, active: true
          }))
        }]
      })
      const playerCard = (claimed, dice, extra = {
      }) => vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue({
        byGM: false, roller: hacker, data: {
          test: {
            typeSub: 'jackOut'
          }, roll: {
            hits: claimed, r: diceRoll(dice)
          }, edge: {
          }, ...extra
        }
      })
      const jackOutWith = claimed => SR5_MatrixHelpers.rollJackOut({
        owner: {
          actorId: 'hacker', messageId: 'card'
        }, roll: {
          hits: claimed
        }, previousMessage: {
        }
      })

      beforeEach(() => {
        hacker.system.matrix.actions = {
          jackOut: {
            test: {
              dicePool: 4
            }, limit: {
              value: 0
            }
          }
        }
        hacker.system.specialAttributes = {
          edge: {
            augmented: {
              value: 0
            }
          }
        }
        vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
          test: {
          }, dicePool: {
          }, previousMessage: {
          }
        }))
        vi.spyOn(SR5_RollTest, 'rollDice').mockResolvedValue({
        })
        vi.spyOn(SR5_RollTest, 'addInfoToCard').mockResolvedValue()
        render = vi.spyOn(SR5_RollTest, 'renderRollCard').mockResolvedValue()
        vi.spyOn(ui.notifications, 'warn').mockImplementation(() => {})
      })

      it('counts its hits again on its dice, within the sheet pool: 99 claimed, 2 rolled', async () => {
        playerCard(99, [6, 5, 1, 2, 6, 6, 6])
        await jackOutWith(99)
        // The pool is 4: only the first four dice count, two of them hits
        expect(render.mock.calls.map(c => c[0].previousMessage.hits)).toEqual([2, 2])
      })

      it('caps its hits at the Firewall limit of the sheet', async () => {
        hacker.system.matrix.actions.jackOut.limit.value = 1
        playerCard(3, [6, 5, 6, 1])
        await jackOutWith(3)
        expect(render.mock.calls.map(c => c[0].previousMessage.hits)).toEqual([1, 1])
      })

      // Anke's review: the button written back in the card's content rolled the locks at every click
      it('rolls the locks once per card, never on a second click', async () => {
        playerCard(3, [6, 5, 6, 1])
        await jackOutWith(3)
        await jackOutWith(3)
        expect(render).toHaveBeenCalledTimes(2)
        expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_JackOutCardSpent')
      })

      it('rolls nothing on a GM who is not the active one', async () => {
        game.users.activeGM.isSelf = false
        playerCard(3, [6, 5, 6, 1])
        await jackOutWith(3)
        expect(render).not.toHaveBeenCalled()
        expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_JackOutActiveGMOnly')
      })

      it('tells the GM when the card says it pushed the limit', async () => {
        const info = vi.spyOn(ui.notifications, 'info').mockImplementation(() => {})
        playerCard(3, [6, 5, 6, 1], {
          edge: {
            hasUsedPushTheLimit: true
          }
        })
        await jackOutWith(3)
        expect(info).toHaveBeenCalled()
      })

      it('rolls nothing for a card nobody can stand by', async () => {
        vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(null)
        await jackOutWith(99)
        expect(render).not.toHaveBeenCalled()
        expect(ui.notifications.warn).toHaveBeenCalled()
      })

      it('rolls nothing for a card of another action', async () => {
        playerCard(5, [6, 6, 6, 6], {
          test: {
            typeSub: 'hackOnTheFly'
          }
        })
        await jackOutWith(5)
        expect(render).not.toHaveBeenCalled()
      })
    })
  })
})
