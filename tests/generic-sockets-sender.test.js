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

let docs, actors, messages
beforeEach(() => {
  vi.restoreAllMocks()
  docs = new Map()
  actors = new Map()
  messages = new Map()
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors.get(id) ?? null)
  game.user = users.gm
  game.users = {
    get: id => users[id]
  }
  game.messages = messages
  game.actors = {
    find: fn => [...actors.values()].find(fn)
  }
})

function register(...list) {
  for (const doc of list) {
    docs.set(doc.uuid, doc)
    if (doc.documentName === 'Actor') actors.set(doc.id, doc)
  }
}

function card(id, author, data) {
  messages.set(id, {
    id, author, flags: {
      sr5data: data
    }
  })
}

describe('updateItem', () => {
  let target, device, attacker
  beforeEach(() => {
    target = actor('target', {
    }, ['other'])
    attacker = actor('attacker', {
      specialAttributes: {
        edge: {
          augmented: {
            value: 1
          }
        }
      }
    }, ['owner'])
    device = item('deck', target, 'itemDevice', {
      isActive: true, conditionMonitors: {
        matrix: {
          value: 10, actual: {
            base: 2, value: 2
          }
        }
      }
    })
    register(target, attacker, device)
  })

  it('is refused from a player who does not own the item, without a card', async () => {
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: device.uuid, info: {
          isActive: false
        }
      }
    }, 'stranger')
    expect(device.update).not.toHaveBeenCalled()
  })

  it('is applied for an owner of the actor holding the item', async () => {
    target.testUserPermission = ownedBy('owner')
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: device.uuid, info: {
          isActive: false
        }
      }
    }, 'owner')
    expect(device.update).toHaveBeenCalledWith({
      system: {
        isActive: false
      }
    })
  })

  it('matrix damage backed by its card fills the monitor by the card at most', async () => {
    card('m1', users.owner, {
      owner: {
        actorId: 'attacker'
      }, target: {
        actorId: 'target'
      }, damage: {
        matrix: {
          value: 3
        }
      }
    })
    const ask = value => SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: device.uuid, use: 'matrixDamage', messageId: 'm1', info: {
          conditionMonitors: {
            matrix: {
              actual: {
                base: value, value
              }
            }
          }
        }
      }
    }, 'owner')
    await ask(9)
    expect(device.update).not.toHaveBeenCalled()
    await ask(6)
    expect(device.update).toHaveBeenCalledTimes(1)
  })

  it('a card written by someone who does not own its roller stands behind nothing', async () => {
    card('m2', users.stranger, {
      owner: {
        actorId: 'attacker'
      }, target: {
        actorId: 'target'
      }, damage: {
        matrix: {
          value: 3
        }
      }
    })
    await SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: device.uuid, use: 'matrixDamage', messageId: 'm2', info: {
          isActive: false
        }
      }
    }, 'stranger')
    expect(device.update).not.toHaveBeenCalled()
  })

  it('a focus goes off only through the disenchanting card that aims at it', async () => {
    const focus = item('focus', target, 'itemFocus', {
      isActive: true
    })
    register(focus)
    card('m3', users.owner, {
      test: {
        type: 'enchantmentResistance'
      }, owner: {
        actorId: 'attacker'
      }, target: {
        itemUuid: device.uuid
      }
    })
    const ask = messageId => SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: focus.uuid, use: 'deactivateFocus', messageId, info: {
          isActive: false
        }
      }
    }, 'owner')
    await ask('m3')
    expect(focus.update).not.toHaveBeenCalled()
    card('m4', users.owner, {
      test: {
        type: 'enchantmentResistance'
      }, owner: {
        actorId: 'attacker'
      }, target: {
        itemUuid: focus.uuid
      }
    })
    await ask('m4')
    expect(focus.update).toHaveBeenCalledTimes(1)
  })

  it("dispelling takes away the card's net hits, bounded by the dispeller's Counterspelling pool", async () => {
    attacker.system.skills = {
      counterspelling: {
        test: {
          dicePool: 4
        }
      }
    }
    const spell = item('spell', target, 'itemSpell', {
      hits: 8, targetOfEffect: []
    })
    register(spell)
    card('m5', users.owner, {
      test: {
        type: 'dispellResistance'
      }, owner: {
        actorId: 'attacker'
      }, target: {
        itemUuid: spell.uuid
      }, roll: {
        netHits: 40
      }
    })
    const ask = hits => SR5_MiscellaneousHelpers._socketUpdateItem({
      data: {
        item: spell.uuid, use: 'reduceEffect', messageId: 'm5', info: {
          hits
        }
      }
    }, 'owner')
    await ask(0)
    expect(spell.update).not.toHaveBeenCalled()
    await ask(3)
    expect(spell.update).toHaveBeenCalledTimes(1)
  })
})

describe('deleteItem', () => {
  it('is refused without a card, and deletes an effect a dispelled spell held up', async () => {
    const caster = actor('caster', {
    }, ['other'])
    const victim = actor('victim', {
    }, ['other'])
    const dispeller = actor('dispeller', {
      skills: {
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
    await SR5_MiscellaneousHelpers._socketDeleteItem({
      data: {
        item: effect.uuid
      }
    }, 'owner')
    expect(effect.delete).not.toHaveBeenCalled()
    card('d1', users.gm, {
      test: {
        type: 'dispellResistance'
      }, owner: {
        actorId: 'dispeller'
      }, target: {
        itemUuid: spell.uuid
      }, roll: {
        netHits: 3
      }
    })
    await SR5_MiscellaneousHelpers._socketDeleteItem({
      data: {
        item: effect.uuid, use: 'dispelledEffect', messageId: 'd1'
      }
    }, 'owner')
    expect(effect.delete).toHaveBeenCalledTimes(1)
  })
})

describe('createItemEffect', () => {
  const effect = (value, ownerID = 'hacker') => ({
    name: 'Firewall', type: 'itemEffect', 'system.type': 'iAmTheFirewall', 'system.ownerID': ownerID, 'system.value': value,
  })
  let ally
  beforeEach(() => {
    ally = actor('ally', {
    }, ['other'])
    const hacker = actor('hacker', {
      matrix: {
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
    card('k1', users.owner, {
      test: {
        typeSub: 'iAmTheFirewall'
      }, owner: {
        actorId: 'hacker'
      }, roll: {
        hits: 30
      }
    })
  })
  it('is refused from a player who does not own the ally, without a card', async () => {
    await SR5_MiscellaneousHelpers._socketCreateItemEffect({
      data: {
        actorId: ally.uuid, effect: effect(3)
      }
    }, 'stranger')
    expect(ally.createEmbeddedDocuments).not.toHaveBeenCalled()
  })
  it("creates the hacker's support effect within the hacker's pool, never above", async () => {
    const ask = value => SR5_MiscellaneousHelpers._socketCreateItemEffect({
      data: {
        actorId: ally.uuid, effect: effect(value), messageId: 'k1'
      }
    }, 'owner')
    await ask(30)
    expect(ally.createEmbeddedDocuments).not.toHaveBeenCalled()
    await ask(5)
    expect(ally.createEmbeddedDocuments).toHaveBeenCalledTimes(1)
  })
})

describe('updateActorData', () => {
  it('is refused from a player who does not own the actor', async () => {
    const npc = actor('npc', {
      karma: 0
    }, ['other'])
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
    }, ['other'])
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
  it('opens a maglock through the card that aims at it', async () => {
    const lock = actor('lock', {
      maglock: {
        caseRemoved: false, hasAntiTamper: true
      }
    }, ['other'])
    const picker = actor('picker', {
    }, ['owner'])
    register(lock, picker)
    card('g1', users.owner, {
      owner: {
        actorId: 'picker'
      }, target: {
        actorId: 'lock'
      }
    })
    const ask = dataToUpdate => SR5_MiscellaneousHelpers._socketUpdateActorData({
      data: {
        actorId: 'lock', use: 'maglock', messageId: 'g1', dataToUpdate
      }
    }, 'owner')
    await ask({
      maglock: {
        caseRemoved: true
      }, karma: 50
    })
    expect(lock.update).not.toHaveBeenCalled()
    await ask({
      maglock: {
        caseRemoved: true
      }
    })
    expect(lock.update).toHaveBeenCalledTimes(1)
  })
})
