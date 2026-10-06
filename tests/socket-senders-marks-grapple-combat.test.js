import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

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
  SR5_GrappleHelpers
} = await import('../modules/rolls/roll-helpers/grapple.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const senders = await import('../modules/rolls/roll-helpers/socket-senders.js')

// Security lot (Thomas, before the djamz.11): the sockets of marks, grappling, combat and chat buttons
// applied whatever a player's console sent. Each test below sends what such a console would, and then
// what the real button sends.

const users = {
  gm: {
    id: 'gm', name: 'MJ', isGM: true
  },
  owner: {
    id: 'owner', name: 'Joueuse', isGM: false
  },
  stranger: {
    id: 'stranger', name: 'Autre', isGM: false
  },
}
const ownedBy = (...ids) => user => !!user && (user.isGM || ids.includes(user.id))

let actors, docs, messages, settings, serial = 0
function actor(id, system = {
}, owners = [], extra = {
}) {
  const doc = {
    id, uuid: `Actor.${id}`, documentName: 'Actor', name: id, system, items: [], effects: [],
    testUserPermission: ownedBy(...owners), ...extra,
  }
  actors.set(id, doc)
  docs.set(doc.uuid, doc)
  return doc
}
function item(id, parent, system) {
  const doc = {
    id, uuid: `${parent.uuid}.Item.${id}`, documentName: 'Item', name: id, type: 'itemDevice', parent, system,
  }
  parent.items.push(doc)
  docs.set(doc.uuid, doc)
  return doc
}
function card(author, data) {
  const id = `card${++serial}`
  messages.set(id, {
    id, author, flags: {
      sr5data: data
    }
  })
  return id
}
const dice = (hits, misses = 0) => ({
  terms: [{
    results: [...Array(hits).fill({
      result: 6, active: true
    }), ...Array(misses).fill({
      result: 2, active: true
    })]
  }]
})
const grapple = (role, partner, hold = 2, holdId = 'h1', kind = 'subdue') => ({
  flags: {
    sr5: {
      grapple: {
        role, partner, hold, holdId, kind
      }
    }
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  actors = new Map()
  docs = new Map()
  messages = new Map()
  settings = {
  }
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors.get(id) ?? null)
  vi.spyOn(SR5_MiscellaneousHelpers, 'confirmUse').mockResolvedValue(true)
  game.user = users.gm
  game.users = {
    get: id => users[id], find: fn => Object.values(users).find(fn), activeGM: users.gm,
  }
  game.messages = messages
  game.settings = {
    get: (_s, key) => settings[key] ?? (key === 'sr5GrapplingRules' ? true : {
    }),
    set: async (_s, key, value) => {
      settings[key] = value
    },
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
})

/* -------------------------------------------- */
/*  Marks                                         */
/* -------------------------------------------- */
describe('the rules of marks (SR5 p. 232, 240, 242)', () => {
  it('puts the marks chosen, 1 to 3, and a fixed number for Watchdog and the IC', () => {
    expect(senders.attackerMarks('hackOnTheFly', 3)).toBe(3)
    expect(senders.attackerMarks('bruteForce', 9)).toBe(3)
    expect(senders.attackerMarks('watchdog', 3)).toBe(1)
    expect(senders.attackerMarks('iceBloodhound', 1)).toBe(2)
    expect(senders.markPenalty(2)).toBe(-4)
    expect(senders.markPenalty(3)).toBe(-10)
  })
  it('gives the defender one mark when a Sleaze action fails, nothing when an Attack action does', () => {
    expect(senders.markOutcome({
      typeSub: 'hackOnTheFly', actionType: 'sleaze', attackerHits: 1, defenderHits: 1
    })).toEqual({
      winner: 'defender', marks: 1, watchdog: false
    })
    expect(senders.markOutcome({
      typeSub: 'bruteForce', actionType: 'attack', attackerHits: 1, defenderHits: 2
    })).toBeNull()
  })
})

describe('the markItem socket', () => {
  let attackId
  beforeEach(() => {
    actor('hacker', {
      matrix: {
        actions: {
          hackOnTheFly: {
            actionType: 'sleaze', test: {
              dicePool: 8
            }
          }
        }
      }
    })
    actor('pc', {
      specialAttributes: {
        edge: {
          augmented: {
            value: 0
          }
        }
      },
      matrix: {
        actions: {
          hackOnTheFly: {
            defense: {
              dicePool: 5
            }
          }
        }
      }
    }, ['owner'])
    attackId = card(users.gm, {
      test: {
        type: 'matrixAction', typeSub: 'hackOnTheFly'
      }, owner: {
        actorId: 'hacker'
      }, roll: {
        hits: 1
      }, matrix: {
        mark: 1
      }
    })
    vi.spyOn(SR5_MarkHelpers, 'markItem').mockResolvedValue()
  })
  const defenseCard = (hits, author = users.owner) => card(author, {
    test: {
      type: 'matrixDefense', typeSub: 'hackOnTheFly'
    }, owner: {
      actorId: 'pc'
    }, target: {
    }, matrix: {
      mark: 1
    },
    previousMessage: {
      actorId: 'hacker', messageId: attackId, hits: 1
    }, roll: {
      hits, r: dice(hits, 2)
    },
  })

  it('refuses three marks a console asks for on an icon the sender does not own', async () => {
    await SR5_MarkHelpers._socketMarkItem({
      data: {
        targetActor: 'hacker', attackerID: 'pc', mark: 3
      }
    }, 'stranger')
    expect(SR5_MarkHelpers.markItem).not.toHaveBeenCalled()
  })
  it('puts the one mark the failed Sleaze card allows, whatever the request says, once', async () => {
    const messageId = defenseCard(3)
    const request = {
      data: {
        targetActor: 'hacker', attackerID: 'pc', mark: 3, messageId
      }
    }
    await SR5_MarkHelpers._socketMarkItem(request, 'owner')
    await SR5_MarkHelpers._socketMarkItem(request, 'owner')
    expect(SR5_MarkHelpers.markItem).toHaveBeenCalledTimes(1)
    expect(SR5_MarkHelpers.markItem.mock.calls[0][2]).toBe(1)
  })
  it('refuses a defense card whose dice exceed the defense pool of the sheet', async () => {
    const messageId = card(users.owner, {
      test: {
        type: 'matrixDefense', typeSub: 'hackOnTheFly'
      }, owner: {
        actorId: 'pc'
      }, target: {
      },
      previousMessage: {
        actorId: 'hacker', messageId: attackId
      }, roll: {
        hits: 0, r: dice(0, 12)
      },
    })
    // twelve dice shown, five in the pool: the recount stops at five misses, the attacker's hit wins
    await SR5_MarkHelpers._socketMarkItem({
      data: {
        targetActor: 'hacker', attackerID: 'pc', mark: 1, messageId
      }
    }, 'owner')
    expect(SR5_MarkHelpers.markItem).not.toHaveBeenCalled()
  })
  it('lets the owner of the icon marked write as before', async () => {
    await SR5_MarkHelpers._socketMarkItem({
      data: {
        targetActor: 'pc', attackerID: 'hacker', mark: 2
      }
    }, 'owner')
    expect(SR5_MarkHelpers.markItem).toHaveBeenCalledWith('pc', 'hacker', 2, undefined, undefined)
  })
})

describe('the markPanMaster socket', () => {
  it('refuses an item a player slaved herself to a master that does not list it', async () => {
    const npc = actor('npc')
    item('master', npc, {
      isActive: true, pan: {
        content: []
      }
    })
    const mine = actor('mine', {
    }, ['stranger'])
    const gun = item('gun', mine, {
      isSlavedToPan: true, panMaster: 'npc', marks: [{
        ownerId: 'hacker', value: 3
      }]
    })
    const spy = vi.spyOn(SR5_MarkHelpers, 'markPanMaster').mockResolvedValue()
    await SR5_MarkHelpers._socketMarkPanMaster({
      data: {
        itemUuid: gun.uuid, itemToMark: gun.system, attackerID: 'hacker', mark: 3
      }
    }, 'stranger')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('the markSlavedDevice socket', () => {
  it('is refused from a player who does not own the host, accepted from the GM', async () => {
    actor('host', {
      matrix: {
        deviceType: 'host'
      }
    })
    const spy = vi.spyOn(SR5_MarkHelpers, 'markSlavedDevice').mockResolvedValue()
    await SR5_MarkHelpers._socketMarkSlavedDevice({
      data: {
        targetActorID: 'host'
      }
    }, 'stranger')
    expect(spy).not.toHaveBeenCalled()
    await SR5_MarkHelpers._socketMarkSlavedDevice({
      data: {
        targetActorID: 'host'
      }
    }, 'gm')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('the updateDeckMarkedItems socket', () => {
  let deck
  beforeEach(() => {
    actor('hacker')
    const pc = actor('pc', {
    }, ['owner'])
    deck = item('deck', pc, {
      marks: [{
        ownerId: 'hacker', value: 2
      }]
    })
    vi.spyOn(SR5_MarkHelpers, 'updateDeckMarkedItems').mockResolvedValue()
  })
  it('is refused from a player who does not own the icon marked', async () => {
    await SR5_MarkHelpers._socketUpdateDeckMarkedItems({
      data: {
        ownerID: 'hacker', markedItem: deck.uuid, mark: 3
      }
    }, 'stranger')
    expect(SR5_MarkHelpers.updateDeckMarkedItems).not.toHaveBeenCalled()
  })
  it("records what the icon carries, not the number sent", async () => {
    await SR5_MarkHelpers._socketUpdateDeckMarkedItems({
      data: {
        ownerID: 'hacker', markedItem: deck.uuid, mark: 3
      }
    }, 'owner')
    expect(SR5_MarkHelpers.updateDeckMarkedItems).toHaveBeenCalledWith('hacker', deck.uuid, 0, 2)
  })
})

describe('the eraseMark socket', () => {
  let deck, actionId
  beforeEach(() => {
    actor('ice')
    const pc = actor('pc', {
      specialAttributes: {
        edge: {
          augmented: {
            value: 0
          }
        }
      }, matrix: {
        actions: {
          eraseMark: {
            test: {
              dicePool: 6
            }
          }
        }
      }
    }, ['owner'])
    deck = item('deck', pc, {
      marks: [{
        ownerId: 'ice', value: 2
      }]
    })
    actionId = card(users.owner, {
      test: {
        type: 'matrixAction', typeSub: 'eraseMark'
      }, owner: {
        actorId: 'pc'
      }, roll: {
        hits: 3, r: dice(3, 2)
      }
    })
    vi.spyOn(SR5_MarkHelpers, 'eraseMark').mockResolvedValue()
  })
  it('refuses the card data a console sends', async () => {
    await SR5_MarkHelpers._socketEraseMark({
      data: {
        cardData: {
          owner: {
            actorId: 'ice'
          }, previousMessage: {
            itemUuid: deck.uuid
          }
        }
      }
    }, 'stranger')
    expect(SR5_MarkHelpers.eraseMark).not.toHaveBeenCalled()
  })
  it('erases once what the stored defense card says, when the eraser won', async () => {
    const messageId = card(users.gm, {
      test: {
        type: 'eraseMark'
      }, owner: {
        actorId: 'ice'
      }, roll: {
        hits: 1
      },
      previousMessage: {
        messageId: actionId, actorId: 'pc', itemUuid: deck.uuid
      },
    })
    await SR5_MarkHelpers._socketEraseMark({
      data: {
        messageId
      }
    }, 'owner')
    await SR5_MarkHelpers._socketEraseMark({
      data: {
        messageId
      }
    }, 'owner')
    expect(SR5_MarkHelpers.eraseMark).toHaveBeenCalledTimes(1)
    expect(SR5_MarkHelpers.eraseMark.mock.calls[0][0].owner.actorId).toBe('ice')
  })
})

describe('the overwatchIncrease socket', () => {
  let attackId
  beforeEach(async () => {
    actor('hacker', {
      matrix: {
        overwatchScore: 3
      }
    }, ['owner'])
    actor('npcDecker', {
      matrix: {
        overwatchScore: 3
      }
    })
    actor('pc', {
      specialAttributes: {
        edge: {
          augmented: {
            value: 0
          }
        }
      }, matrix: {
        actions: {
          dataSpike: {
            defense: {
              dicePool: 4
            }
          }
        }
      }
    }, ['stranger'])
    attackId = card(users.gm, {
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }, owner: {
        actorId: 'npcDecker'
      }, roll: {
        hits: 2
      }
    })
    const {
      SR5_ActorHelper
    } = await import('../modules/entities/actors/entityActor-helpers.js')
    vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockResolvedValue()
  })
  const helper = async () => (await import('../modules/entities/actors/entityActor-helpers.js')).SR5_ActorHelper

  it('refuses a negative relay from the owner (Quitterie: a score from 3 to 0)', async () => {
    const SR5_ActorHelper = await helper()
    await SR5_ActorHelper._socketOverwatchIncrease({
      data: {
        defenseHits: -3, actorId: 'hacker'
      }
    }, 'owner')
    expect(SR5_ActorHelper.overwatchIncrease).not.toHaveBeenCalled()
  })
  it("raises a GM's decker by the defense card's hits counted again within the defense pool, once", async () => {
    const SR5_ActorHelper = await helper()
    const messageId = card(users.stranger, {
      test: {
        type: 'matrixDefense', typeSub: 'dataSpike'
      }, owner: {
        actorId: 'pc'
      }, target: {
      }, matrix: {
        overwatchScore: true
      },
      previousMessage: {
        actorId: 'npcDecker', messageId: attackId
      }, roll: {
        hits: 9, r: dice(9)
      },
    })
    const request = {
      data: {
        defenseHits: 9, actorId: 'npcDecker', messageId
      }
    }
    await SR5_ActorHelper._socketOverwatchIncrease(request, 'stranger')
    await SR5_ActorHelper._socketOverwatchIncrease(request, 'stranger')
    expect(SR5_ActorHelper.overwatchIncrease.mock.calls).toEqual([[4, 'npcDecker']])
  })
  it('refuses a stranger without a card', async () => {
    const SR5_ActorHelper = await helper()
    await SR5_ActorHelper._socketOverwatchIncrease({
      data: {
        defenseHits: 40, actorId: 'npcDecker'
      }
    }, 'stranger')
    expect(SR5_ActorHelper.overwatchIncrease).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------- */
/*  Grappling                                     */
/* -------------------------------------------- */
describe('the grappling sockets', () => {
  let thug, pc
  beforeEach(() => {
    thug = actor('thug', {
    })
    pc = actor('pc', {
      specialAttributes: {
        edge: {
          augmented: {
            value: 0
          }
        }
      },
      skills: {
        unarmedCombat: {
          test: {
            dicePool: 6
          }
        }
      }, attributes: {
        strength: {
          augmented: {
            value: 4
          }
        }, agility: {
          augmented: {
            value: 4
          }
        }
      },
    }, ['owner'])
    for (const name of ['startHold', 'setHold', 'releaseHold', 'reverseHold']) vi.spyOn(SR5_GrappleHelpers, name).mockResolvedValue()
  })

  it('startHold: refuses a hold a console asks for without a card', async () => {
    await SR5_GrappleHelpers._socketStartHold({
      data: {
        holderId: 'thug', heldId: 'pc', hold: 9
      }
    }, 'stranger')
    expect(SR5_GrappleHelpers.startHold).not.toHaveBeenCalled()
  })
  it('startHold: takes the hold of the subdue card, not of the request, once', async () => {
    const messageId = card(users.owner, {
      test: {
        type: 'defense'
      }, owner: {
        actorId: 'pc'
      }, previousMessage: {
        actorId: 'thug'
      },
      combat: {
        calledShot: {
          name: 'subdue', effects: [{
            name: 'subdue', value: 2
          }]
        }
      },
    })
    const request = {
      data: {
        holderId: 'thug', heldId: 'pc', hold: 9, messageId
      }
    }
    await SR5_GrappleHelpers._socketStartHold(request, 'owner')
    await SR5_GrappleHelpers._socketStartHold(request, 'owner')
    expect(SR5_GrappleHelpers.startHold).toHaveBeenCalledTimes(1)
    expect(SR5_GrappleHelpers.startHold.mock.calls[0].slice(0, 5)).toEqual(['thug', 'pc', 2, 'subdue', 'owner'])
  })

  it('setHold: refuses the held fighter lowering her hold without a card', async () => {
    thug.effects = [grapple('holder', 'pc')]
    pc.effects = [grapple('held', 'thug')]
    await SR5_GrappleHelpers._socketSetHold({
      data: {
        actorId: 'pc', hold: 0, holdId: 'h1'
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.setHold).not.toHaveBeenCalled()
  })

  it('releaseHold: refuses the held fighter, lets the holder go', async () => {
    thug.effects = [grapple('holder', 'pc')]
    pc.effects = [grapple('held', 'thug')]
    await SR5_GrappleHelpers._socketReleaseHold({
      data: {
        actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.releaseHold).not.toHaveBeenCalled()
    // A partner forged on her own half names nobody who agrees
    pc.effects = [grapple('holder', 'pc')]
    await SR5_GrappleHelpers._socketReleaseHold({
      data: {
        actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.releaseHold).not.toHaveBeenCalled()
  })
  it('releaseHold: frees the held fighter whose escape card reaches the holder\'s hold', async () => {
    thug.effects = [grapple('holder', 'pc', 2)]
    pc.effects = [grapple('held', 'thug', 0)]
    const messageId = card(users.owner, {
      test: {
        type: 'grappleEscape'
      }, owner: {
        actorId: 'pc'
      }, roll: {
        hits: 2, r: dice(2, 3)
      }
    })
    await SR5_GrappleHelpers._socketReleaseHold({
      data: {
        actorId: 'pc', messageId
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.releaseHold).toHaveBeenCalledTimes(1)
  })
  it('releaseHold: an escape short of the holder\'s hold frees nobody, whatever her own half says', async () => {
    thug.effects = [grapple('holder', 'pc', 3)]
    pc.effects = [grapple('held', 'thug', 0)]
    const messageId = card(users.owner, {
      test: {
        type: 'grappleEscape'
      }, owner: {
        actorId: 'pc'
      }, roll: {
        hits: 2, r: dice(2, 3)
      }
    })
    await SR5_GrappleHelpers._socketReleaseHold({
      data: {
        actorId: 'pc', messageId
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.releaseHold).not.toHaveBeenCalled()
  })

  it('releaseHold: an escape card rolled before the hold began is not served again on it', async () => {
    thug.effects = [{
      ...grapple('holder', 'pc', 1, 'h2'), _stats: {
        createdTime: 2000
      }
    }]
    pc.effects = [grapple('held', 'thug', 1, 'h2')]
    const messageId = card(users.owner, {
      test: {
        type: 'grappleEscape'
      }, owner: {
        actorId: 'pc'
      }, roll: {
        hits: 3, r: dice(3, 3)
      }
    })
    messages.get(messageId).timestamp = 1000
    await SR5_GrappleHelpers._socketReleaseHold({
      data: {
        actorId: 'pc', messageId
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.releaseHold).not.toHaveBeenCalled()
  })

  it('reverseHold: refuses a reversal without a card', async () => {
    thug.effects = [grapple('holder', 'pc')]
    pc.effects = [grapple('held', 'thug')]
    await SR5_GrappleHelpers._socketReverseHold({
      data: {
        reverserId: 'pc', hold: 6, holdId: 'h1'
      }
    }, 'owner')
    expect(SR5_GrappleHelpers.reverseHold).not.toHaveBeenCalled()
  })

  it('grappleWarn: shows only a GM\'s grappling warning', () => {
    SR5_GrappleHelpers._socketWarn({
      data: {
        key: 'Envoie ton mot de passe au MJ'
      }
    }, 'stranger')
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    SR5_GrappleHelpers._socketWarn({
      data: {
        key: 'SR5.WARN_GrappleNoHold'
      }
    }, 'gm')
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------- */
/*  Combat                                        */
/* -------------------------------------------- */
describe('the combat sockets', () => {
  let combat
  beforeEach(() => {
    const mine = {
      testUserPermission: ownedBy('owner')
    }
    combat = {
      id: 'c1', round: 2, initiativePass: 1, turns: [mine, {
      }, {
      }], combatant: mine, nextTurnPosition: 1,
      doIniPass: vi.fn(() => false), stepTurn: vi.fn(), nextRound: vi.fn(),
      update: vi.fn(),
    }
    game.combats = {
      get: id => id === 'c1' ? combat : undefined
    }
    vi.spyOn(SR5Combat, 'handleIniPass').mockResolvedValue()
    vi.spyOn(SR5Combat, 'handleNextRound').mockResolvedValue()
    vi.spyOn(SR5Combat, 'endOwnerPassEffects').mockResolvedValue()
  })

  it('updateCombat: never writes the combatants of a request, nor a turn other than the next', async () => {
    await SR5Combat._socketUpdateCombat({
      data: {
        combatId: 'c1', round: 2, turn: 1, combatants: [{
          initiative: 99
        }]
      }
    }, 'stranger')
    await SR5Combat._socketUpdateCombat({
      data: {
        combatId: 'c1', round: 2, turn: 2
      }
    }, 'owner')
    expect(combat.update).not.toHaveBeenCalled()
    expect(combat.stepTurn).not.toHaveBeenCalled()
    await SR5Combat._socketUpdateCombat({
      data: {
        combatId: 'c1', round: 2, turn: 1
      }
    }, 'owner')
    expect(combat.stepTurn).toHaveBeenCalledWith(1)
  })

  it('doInitPass: refused when the GM finds no pass due', async () => {
    await SR5Combat._socketDoInitPass({
      data: {
        id: 'c1', round: 2, pass: 1
      }
    }, 'owner')
    expect(SR5Combat.handleIniPass).not.toHaveBeenCalled()
    combat.nextTurnPosition = 3
    combat.doIniPass = () => true
    await SR5Combat._socketDoInitPass({
      data: {
        id: 'c1', round: 2, pass: 1
      }
    }, 'owner')
    expect(SR5Combat.handleIniPass).toHaveBeenCalledWith('c1')
  })

  it('doNextRound: refused mid-round, and from who does not own the current combatant', async () => {
    await SR5Combat._socketDoNextRound({
      data: {
        id: 'c1', round: 2
      }
    }, 'owner')
    combat.nextTurnPosition = 3
    await SR5Combat._socketDoNextRound({
      data: {
        id: 'c1', round: 2
      }
    }, 'stranger')
    expect(SR5Combat.handleNextRound).not.toHaveBeenCalled()
    expect(combat.nextRound).not.toHaveBeenCalled()
    await SR5Combat._socketDoNextRound({
      data: {
        id: 'c1', round: 2
      }
    }, 'owner')
    expect(combat.nextRound).toHaveBeenCalledTimes(1)
  })

  it('changeInitInCombat: a stranger only gets the sheet read again', async () => {
    actor('pc', {
    }, ['owner'])
    const spy = vi.spyOn(SR5Combat, 'changeInitInCombat').mockResolvedValue()
    await SR5Combat._socketChangeInitInCombat({
      data: {
        documentId: 'pc', initChange: -50
      }
    }, 'stranger')
    expect(spy).not.toHaveBeenCalled()
    await SR5Combat._socketChangeInitInCombat({
      data: {
        documentId: 'pc'
      }
    }, 'stranger')
    await SR5Combat._socketChangeInitInCombat({
      data: {
        documentId: 'pc', initChange: -10
      }
    }, 'owner')
    expect(spy.mock.calls).toEqual([['pc', undefined], ['pc', -10]])
  })
})

/* -------------------------------------------- */
/*  Chat buttons                                  */
/* -------------------------------------------- */
describe('the updateChatButton socket', () => {
  let messageId
  beforeEach(() => {
    actor('npc')
    actor('pc', {
    }, ['owner'])
    messageId = card(users.gm, {
      owner: {
        actorId: 'npc'
      }, target: {
        actorId: 'pc'
      }, previousMessage: {
      },
      chatCard: {
        buttons: {
          damage: {
            testType: 'nonOpposedTest'
          }, gmOnly: {
            testType: 'nonOpposedTest', gmAction: 'chat-button-gm'
          }, defenseRangedWeapon: {
            testType: 'opposedTest'
          }
        }
      },
    })
    vi.spyOn(SR5_RollMessage, 'updateChatButton').mockResolvedValue()
  })
  const send = (button, senderId) => SR5_RollMessage._socketUpdateChatButton({
    data: {
      message: messageId, buttonToUpdate: button
    }
  }, senderId)

  it("refuses a stranger who strips the button of someone else's card", async () => {
    await send('damage', 'stranger')
    await send('gmOnly', 'owner')
    await send('missing', 'owner')
    expect(SR5_RollMessage.updateChatButton).not.toHaveBeenCalled()
  })
  it('lets the owner of the target, and anyone for a test any token answers', async () => {
    await send('damage', 'owner')
    await send('defenseRangedWeapon', 'stranger')
    expect(SR5_RollMessage.updateChatButton).toHaveBeenCalledTimes(2)
  })
})
