import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Foundry's object helpers the sockets use, as update-item-relay.test.js stubs them
const diffObject = (original, other) => Object.entries(other ?? {
}).reduce((acc, [k, v]) => {
  const o = original?.[k]
  if (v && typeof v === 'object' && !Array.isArray(v) && o && typeof o === 'object') {
    const d = diffObject(o, v)
    if (Object.keys(d).length) acc[k] = d
  } else if (JSON.stringify(o) !== JSON.stringify(v)) acc[k] = v
  return acc
}, {
})
const flattenObject = (obj, prefix = '') => Object.entries(obj ?? {
}).reduce((acc, [k, v]) => {
  const key = prefix ? `${prefix}.${k}` : k
  if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(acc, flattenObject(v, key))
  else acc[key] = v
  return acc
}, {
})
const expandObject = obj => {
  const out = {
  }
  for (const [k, v] of Object.entries(obj ?? {
  })) foundry.utils.setProperty(out, k, v)
  return out
}
Object.assign(foundry.utils, {
  diffObject, flattenObject, expandObject, isEmpty: o => !o || Object.keys(o).length === 0,
})

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

// Security lot (Sixtine, ruled by DjamZ before the djamz.11): the four generic sockets believed any
// sender, so one line typed in a player's console wrote any item or actor of the world. Now a GM or
// an owner of the target writes; anyone else only a use backed by a card the GM reads again.

const users = {
  gm: {
    id: 'gm', isGM: true
  },
  owner: {
    id: 'owner', isGM: false
  },
  stranger: {
    id: 'stranger', isGM: false
  },
}
const ownedBy = (...ids) => user => !!user && (user.isGM || ids.includes(user.id))

function actor(id, system = {
}, owners = []) {
  const doc = {
    id, documentName: 'Actor', uuid: `Actor.${id}`, system, _source: {
      system: foundry.utils.deepClone(system)
    },
    items: new Map(),
    testUserPermission: ownedBy(...owners),
    update: vi.fn(),
    toObject: () => ({
      system: foundry.utils.deepClone(doc._source.system)
    }),
    createEmbeddedDocuments: vi.fn(),
    deleteEmbeddedDocuments: vi.fn(),
  }
  doc.items.find = fn => [...doc.items.values()].find(fn)
  return doc
}

function item(id, parent, type, system) {
  const doc = {
    id, documentName: 'Item', uuid: `${parent.uuid}.Item.${id}`, type, parent, system: foundry.utils.deepClone(system),
    _source: {
      system: foundry.utils.deepClone(system)
    },
    update: vi.fn(), delete: vi.fn(),
    toObject: () => ({
      system: foundry.utils.deepClone(doc._source.system)
    }),
  }
  parent.items.set(id, doc)
  return doc
}

let docs, actors, messages, settings, confirmed, serial = 0
beforeEach(() => {
  vi.restoreAllMocks()
  docs = new Map()
  actors = new Map()
  messages = new Map()
  settings = {
  }
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors.get(id) ?? null)
  // The GM's confirmation of a player's card: yes, and counted
  confirmed = []
  if (SR5_MiscellaneousHelpers.confirmUse) vi.spyOn(SR5_MiscellaneousHelpers, 'confirmUse').mockImplementation(async use => {
    confirmed.push(use)
    return true
  })
  game.user = users.gm
  game.users = {
    get: id => users[id]
  }
  game.messages = messages
  game.actors = {
    find: fn => [...actors.values()].find(fn)
  }
  game.settings = {
    get: (_s, key) => settings[key] ?? {
    },
    set: async (_s, key, value) => {
      settings[key] = value
    },
  }
})

function register(...list) {
  for (const doc of list) {
    docs.set(doc.uuid, doc)
    if (doc.documentName === 'Actor') actors.set(doc.id, doc)
  }
}

// A card in the chat log; ids are new in every test, the GM's browser keeps spent cards in memory
function card(author, data) {
  const id = `card${++serial}`
  messages.set(id, {
    id, author, flags: {
      sr5data: data
    }
  })
  return id
}

// The dice a card shows: so many hits (6), then misses (2)
const dice = (hits, misses = 0) => ({
  terms: [{
    results: [...Array(hits).fill({
      result: 6, active: true
    }), ...Array(misses).fill({
      result: 2, active: true
    })]
  }]
})

const edge = value => ({
  edge: {
    augmented: {
      value
    }
  }
})

describe('updateItem', () => {
  let npc, deck, player
  beforeEach(() => {
    npc = actor('npc', {
    }, [])
    player = actor('player', {
      specialAttributes: edge(0),
      matrix: {
        actions: {
          dataSpike: {
            test: {
              dicePool: 6
            }, defense: {
              dicePool: 5
            }
          }
        }
      },
      skills: {
        counterspelling: {
          test: {
            dicePool: 4
          }
        }, disenchanting: {
          test: {
            dicePool: 4
          }
        }
      },
    }, ['owner'])
    deck = item('deck', npc, 'itemDevice', {
      isActive: true, conditionMonitors: {
        matrix: {
          value: 10, actual: {
            base: 0, value: 0
          }
        }
      }
    })
    register(npc, player, deck)
  })

  const fill = (device, value, messageId, use = 'matrixDamage', who = 'owner') => SR5_MiscellaneousHelpers._socketUpdateItem({
    data: {
      item: device.uuid, use, messageId, info: {
        conditionMonitors: {
          matrix: {
            actual: {
              base: value, value
            }
          }
        }
      }
    }
  }, who)

  it('is refused from a player who does not own the item, without a card', async () => {
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: deck.uuid, info: {
          isActive: false
        }
      }
    }, 'stranger')
    expect(deck.update).not.toHaveBeenCalled()
  })

  it('is applied for an owner of the actor holding the item', async () => {
    npc.testUserPermission = ownedBy('owner')
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: deck.uuid, info: {
          isActive: false
        }
      }
    }, 'owner')
    expect(deck.update).toHaveBeenCalledWith({
      system: {
        isActive: false
      }
    })
  })

  // Zélia's review, B1: the defender who wins hurts the ATTACKER's deck, while her card names her own
  it("a defender who wins fills the attacker's deck, her net hits counted again on her dice", async () => {
    const attack = card(users.gm, {
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }, owner: {
        actorId: 'npc'
      }, roll: {
        hits: 1
      }
    })
    const defense = card(users.owner, {
      test: {
        type: 'matrixDefense', typeSub: 'dataSpike'
      }, owner: {
        actorId: 'player'
      },
      previousMessage: {
        actorId: 'npc', messageId: attack
      }, target: {
        itemUuid: 'Actor.player.Item.herOwnDeck'
      },
      // the card claims 9; her five defense dice show 4 hits, over the attacker's 1: 3 at most
      damage: {
        matrix: {
          value: 9
        }
      }, roll: {
        hits: 9, r: dice(9)
      },
    })
    await fill(deck, 6, defense)
    expect(deck.update).not.toHaveBeenCalled()
    await fill(deck, 3, defense)
    expect(deck.update).toHaveBeenCalledTimes(1)
    expect(confirmed).toHaveLength(1)
  })

  it("a resistance the GM rolled for his NPC fills that NPC's deck, without asking him", async () => {
    const resistance = card(users.gm, {
      test: {
        type: 'matrixResistance'
      }, owner: {
        actorId: 'npc'
      }, target: {
        itemUuid: deck.uuid
      }, damage: {
        matrix: {
          value: 4
        }
      }, roll: {
        hits: 1
      }
    })
    await fill(deck, 4, resistance)
    expect(deck.update).toHaveBeenCalledTimes(1)
    expect(confirmed).toHaveLength(0)
  })

  it("a resistance card a player wrote for the GM's NPC stands behind nothing", async () => {
    const forged = card(users.owner, {
      test: {
        type: 'matrixResistance'
      }, owner: {
        actorId: 'npc'
      }, target: {
        itemUuid: deck.uuid
      }, damage: {
        matrix: {
          value: 4
        }
      }
    })
    await fill(deck, 4, forged)
    expect(deck.update).not.toHaveBeenCalled()
  })

  // B3: the true card sent again does nothing more
  it('a card serves once: sent again, it is refused', async () => {
    const resistance = card(users.gm, {
      test: {
        type: 'matrixResistance'
      }, owner: {
        actorId: 'npc'
      }, target: {
        itemUuid: deck.uuid
      }, damage: {
        matrix: {
          value: 2
        }
      }
    })
    await fill(deck, 2, resistance)
    deck._source.system.conditionMonitors.matrix.actual = {
      base: 2, value: 2
    }
    await fill(deck, 4, resistance)
    expect(deck.update).toHaveBeenCalledTimes(1)
  })

  it('a card of another test (a Perception) stands behind no matrix damage', async () => {
    const perception = card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'perception'
      }, owner: {
        actorId: 'player'
      }, previousMessage: {
        actorId: 'npc'
      }, damage: {
        matrix: {
          value: 3
        }
      }, roll: {
        r: dice(3)
      }
    })
    await fill(deck, 3, perception)
    expect(deck.update).not.toHaveBeenCalled()
  })

  // B2: a disenchanting resistance made up in the console, with no disenchanting test behind it
  it('a focus goes off only through the resistance of a true disenchanting test aimed at it', async () => {
    const focus = item('focus', npc, 'itemFocus', {
      isActive: true
    })
    register(focus)
    const off = messageId => SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: focus.uuid, use: 'deactivateFocus', messageId, info: {
          isActive: false
        }
      }
    }, 'owner')
    await off(card(users.owner, {
      test: {
        type: 'enchantmentResistance'
      }, owner: {
        actorId: 'player'
      }, target: {
        itemUuid: focus.uuid
      }, roll: {
        netHits: 5, r: dice(0)
      }
    }))
    expect(focus.update).not.toHaveBeenCalled()
    const disenchant = card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'disenchanting'
      }, owner: {
        actorId: 'player'
      }, target: {
        itemUuid: focus.uuid
      }, roll: {
        r: dice(2, 2)
      }
    })
    await off(card(users.owner, {
      test: {
        type: 'enchantmentResistance'
      }, owner: {
        actorId: 'player'
      }, target: {
        itemUuid: focus.uuid
      },
      previousMessage: {
        messageId: disenchant
      }, roll: {
        r: dice(1, 3)
      }
    }))
    expect(focus.update).toHaveBeenCalledTimes(1)
  })

  // B2: a dispelling resistance at 99 net hits: the dispeller's 4 Counterspelling dice cap it
  it("dispelling takes away no more than the dispeller's hits counted again on her dice, over the resistance", async () => {
    const spell = item('spell', npc, 'itemSpell', {
      hits: 8, targetOfEffect: []
    })
    register(spell)
    const dispel = card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'counterspelling'
      }, owner: {
        actorId: 'player'
      }, target: {
        itemUuid: spell.uuid
      }, roll: {
        hits: 99, r: dice(10)
      }
    })
    const resistance = card(users.owner, {
      test: {
        type: 'dispellResistance'
      }, owner: {
        actorId: 'player'
      }, target: {
        itemUuid: spell.uuid
      },
      previousMessage: {
        messageId: dispel
      }, roll: {
        netHits: 99, r: dice(1, 5)
      }
    })
    const ask = hits => SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: spell.uuid, use: 'reduceEffect', messageId: resistance, info: {
          hits
        }
      }
    }, 'owner')
    await ask(0)
    expect(spell.update).not.toHaveBeenCalled()
    // 4 dice counted, 1 resisted: 3 net hits, from 8 down to 5
    await ask(5)
    expect(spell.update).toHaveBeenCalledTimes(1)
    // B3: the same card again, to 2
    spell._source.system.hits = 5
    await ask(2)
    expect(spell.update).toHaveBeenCalledTimes(1)
  })
})

describe('deleteItem', () => {
  it('is refused without a card, and deletes an effect a spell brought to nothing held up', async () => {
    const caster = actor('caster', {
    }, [])
    const victim = actor('victim', {
    }, [])
    const dispeller = actor('dispeller', {
      specialAttributes: edge(0), skills: {
        counterspelling: {
          test: {
            dicePool: 6
          }
        }
      }
    }, ['owner'])
    const effect = item('fx', victim, 'itemEffect', {
      value: 2
    })
    const spell = item('spell', caster, 'itemSpell', {
      hits: 2, targetOfEffect: [effect.uuid]
    })
    register(caster, victim, dispeller, effect, spell)
    const remove = messageId => SR5_MiscellaneousHelpers._socketDeleteItem({
      data: {
        item: effect.uuid, use: 'dispelledEffect', messageId
      }
    }, 'owner')
    await remove(undefined)
    expect(effect.delete).not.toHaveBeenCalled()
    const dispel = card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'counterspelling'
      }, owner: {
        actorId: 'dispeller'
      }, target: {
        itemUuid: spell.uuid
      }, roll: {
        r: dice(3, 3)
      }
    })
    const resistance = card(users.gm, {
      test: {
        type: 'dispellResistance'
      }, owner: {
        actorId: 'dispeller'
      }, target: {
        itemUuid: spell.uuid
      }, previousMessage: {
        messageId: dispel
      }, roll: {
        hits: 0
      }
    })
    await remove(resistance)
    expect(effect.delete).toHaveBeenCalledTimes(1)
  })
})

describe('createItemEffect', () => {
  const effect = value => ({
    name: 'Firewall', type: 'itemEffect', 'system.type': 'iAmTheFirewall', 'system.ownerID': 'hacker', 'system.value': value,
  })
  let ally
  beforeEach(() => {
    ally = actor('ally', {
    }, [])
    const hacker = actor('hacker', {
      specialAttributes: edge(0), matrix: {
        actions: {
          iAmTheFirewall: {
            test: {
              dicePool: 5
            }
          }
        }
      }
    }, ['owner'])
    register(ally, hacker)
  })
  it('is refused from a player who does not own the ally, without a card', async () => {
    await SR5_MiscellaneousHelpers._socketCreateItemEffect({
      data: {
        actorId: ally.uuid, effect: effect(3)
      }
    }, 'stranger')
    expect(ally.createEmbeddedDocuments).not.toHaveBeenCalled()
  })
  it("creates the hacker's support effect within the hits counted again on her dice, once", async () => {
    const support = card(users.owner, {
      test: {
        type: 'matrixAction', typeSub: 'iAmTheFirewall'
      }, owner: {
        actorId: 'hacker'
      }, roll: {
        hits: 50, r: dice(12)
      }
    })
    const ask = value => SR5_MiscellaneousHelpers._socketCreateItemEffect({
      data: {
        actorId: ally.uuid, effect: effect(value), messageId: support
      }
    }, 'owner')
    await ask(50)
    expect(ally.createEmbeddedDocuments).not.toHaveBeenCalled()
    await ask(5)
    await ask(5)
    expect(ally.createEmbeddedDocuments).toHaveBeenCalledTimes(1)
  })
})

describe('updateActorData', () => {
  it('is refused from a player who does not own the actor', async () => {
    const npc = actor('npc', {
      karma: 0
    }, [])
    register(npc)
    await SR5_MiscellaneousHelpers._socketUpdateActorData({
      data: {
        actorId: 'npc', dataToUpdate: {
          karma: 999
        }
      }
    }, 'stranger')
    expect(npc.update).not.toHaveBeenCalled()
  })
  it("lets the summoner's owner spend exactly one service of the spirit", async () => {
    const summoner = actor('summoner', {
    }, ['owner'])
    item('bound', summoner, 'itemSpirit', {
    })
    const spirit = actor('spirit', {
      creatorItemId: 'bound', services: {
        value: 3
      }
    }, [])
    register(summoner, spirit)
    const ask = (value, who = 'owner') => SR5_MiscellaneousHelpers._socketUpdateActorData({
      data: {
        actorId: 'spirit', use: 'spiritService', dataToUpdate: {
          services: {
            value
          }
        }
      }
    }, who)
    await ask(0)
    await ask(2, 'stranger')
    expect(spirit.update).not.toHaveBeenCalled()
    await ask(2)
    expect(spirit.update).toHaveBeenCalledTimes(1)
  })
  // Zélia's review, B2: a Perception at 0 hits took the anti-tamper off
  it('opens a maglock only through a Locksmith test that meets its threshold, aimed at it', async () => {
    const lock = actor('lock', {
      maglock: {
        caseRemoved: true, hasAntiTamper: true
      }
    }, [])
    const picker = actor('picker', {
      specialAttributes: edge(0), skills: {
        locksmith: {
          test: {
            dicePool: 6
          }
        }
      }
    }, ['owner'])
    register(lock, picker)
    const ask = messageId => SR5_MiscellaneousHelpers._socketUpdateActorData({
      data: {
        actorId: 'lock', use: 'maglock', messageId, dataToUpdate: {
          maglock: {
            hasAntiTamper: false
          }
        }
      }
    }, 'owner')
    await ask(card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'perception'
      }, owner: {
        actorId: 'picker'
      }, target: {
        actorId: 'lock'
      }, roll: {
        hits: 0, r: dice(0, 4)
      }
    }))
    await ask(card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'locksmith'
      }, owner: {
        actorId: 'picker'
      }, target: {
        actorId: 'lock'
      }, threshold: {
        value: 3
      }, roll: {
        hits: 3, r: dice(2, 4)
      }
    }))
    expect(lock.update).not.toHaveBeenCalled()
    const pick = card(users.owner, {
      test: {
        type: 'skillDicePool', typeSub: 'locksmith'
      }, owner: {
        actorId: 'picker'
      }, target: {
        actorId: 'lock'
      }, threshold: {
        value: 3
      }, roll: {
        hits: 3, r: dice(3, 3)
      }
    })
    await ask(pick)
    expect(lock.update).toHaveBeenCalledTimes(1)
  })
})
