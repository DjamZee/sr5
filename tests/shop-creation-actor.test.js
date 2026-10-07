import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Lot C0 of the character creator (DjamZ's ruling Q2, 2026-10-08): a character the gamemaster put "in creation"
// (flags.sr5.creation = {active, by}) shops under the creation caps (SR5 p. 66, p. 420) and pays for what he buys,
// so the creation nuyen count themselves. The world setting keeps its meaning: every actor, free of charge.
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async () => {}, emitForPlayer: async () => {}
  }
}))

const {
  SR5Shop
} = await import('../modules/interface/shop.js')
const {
  CREATION_FLAG, actorInCreation, creationModeFor, refusedCreationChanges, stripCreationOnCreate
} = await import('../modules/system/creation-actor.js')
const {
  sr5CreationFlagRefused
} = await import('../modules/hooks/actor.js')
const {
  installationFlags
} = await import('../modules/system/implant-essence.js')

const gm = {
  id: 'gm', isGM: true
}
const player = {
  id: 'pl', isGM: false
}
const weapon = (id, availability) => ({
  name: `Arme ${availability}`, type: 'itemWeapon', isEmbedded: false, pack: 'sr5.weapons', parent: null,
  uuid: `Compendium.sr5.weapons.Item.${id}`,
  system: {
    price: {
      value: 500, base: 500
    }, availability: {
      value: availability
    }
  },
  toObject() {
    return JSON.parse(JSON.stringify({
      _id: 'x', name: this.name, type: this.type, system: this.system
    }))
  },
})
const docs = {
  'Compendium.sr5.weapons.Item.a14': weapon('a14', 14),
  'Compendium.sr5.weapons.Item.a8': weapon('a8', 8),
}
let created, world
const inCreation = {
  [CREATION_FLAG]: {
    active: true, by: 'gm'
  }
}
function character(flags = {
}) {
  return {
    id: 'buyer', name: 'Clo', type: 'actorPc', isOwner: true, flags: {
      sr5: flags
    },
    system: {
      nuyen: {
        modifiers: [{
          value: 10000
        }]
      }
    },
    items: {
      get: () => null, filter: () => []
    },
    testUserPermission: u => u.isGM || u.id === 'pl',
    createEmbeddedDocuments: async (_t, data) => {
      created.push(...data)
      return data
    },
  }
}
const buy = (actor, id) => SR5Shop.checkout(actor, [{
  uuid: `Compendium.sr5.weapons.Item.${id}`, quantity: 1
}])
const debits = () => created.filter(d => d.type === 'itemNuyen' && d.system.type === 'loss')

beforeEach(() => {
  created = []
  world = false
  vi.restoreAllMocks()
  globalThis.fromUuid = async uuid => docs[uuid] ?? null
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.game.user = player
  globalThis.game.users = {
    activeGM: gm, get: id => ({
      gm, pl: player
    })[id]
  }
  globalThis.game.settings.get = (_s, key) => ({
    sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: world, sr5ShopExcludedPacks: [],
    sr5ShopCreationLevel: 'standard', sr5ShopCreationMaxAvailability: 12, sr5ShopCreationMaxRating: 6,
  })[key] ?? null
  globalThis.game.i18n = {
    format: k => k, localize: k => k, lang: 'fr'
  }
  globalThis.game.time = {
    worldTime: 0
  }
  globalThis.foundry.documents = {
    ...globalThis.foundry.documents, ChatMessage: {
      create: vi.fn(async () => {}), getSpeaker: () => ({
      })
    }
  }
  vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
})

describe('C0: the creation flag, read on the actor', () => {
  it('reads the flag, and the world mode covers every actor', () => {
    expect(actorInCreation(character(inCreation))).toBe(true)
    expect(actorInCreation(character())).toBe(false)
    expect(actorInCreation(character({
      [CREATION_FLAG]: {
        active: false
      }
    }))).toBe(false)
    expect(creationModeFor(character())).toBe(false)
    world = true
    expect(creationModeFor(character())).toBe(true)
    expect(creationModeFor(null)).toBe(true)
  })
})

describe('C0: the shop for a character in creation', () => {
  it('refuses an availability 14 weapon at the Standard level', async () => {
    expect(await buy(character(inCreation), 'a14')).toBe(false)
    expect(created).toHaveLength(0)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_ShopCreationLimit_availability')
  })

  it('sells an availability 8 weapon, and charges it', async () => {
    expect(await buy(character(inCreation), 'a8')).toBe(true)
    expect(created.filter(d => d.type === 'itemWeapon')).toHaveLength(1)
    expect(debits()).toHaveLength(1)
    expect(debits()[0].system.amount).toBe(500)
  })

  it('without the flag, no creation cap: the availability 14 weapon is sold and charged', async () => {
    expect(await buy(character(), 'a14')).toBe(true)
    expect(debits()).toHaveLength(1)
  })

  it('the world mode stays free for every actor, flagged or not, under the caps', async () => {
    world = true
    expect(await buy(character(), 'a8')).toBe(true)
    expect(await buy(character(inCreation), 'a8')).toBe(true)
    expect(debits()).toHaveLength(0)
    expect(await buy(character(inCreation), 'a14')).toBe(false)
  })

  it('a character in creation is offered the creation grades: no gamma, no beta', () => {
    globalThis.game.settings.get = (_s, key) => ({
      sr5ShopGradeGamma: true
    })[key] ?? false
    const system = {
      type: 'cyberware'
    }
    const flagged = SR5Shop.gradesFor('itemAugmentation', system, {
      actor: character(inCreation)
    })
    const free = SR5Shop.gradesFor('itemAugmentation', system, {
      actor: character()
    })
    expect(flagged).not.toContain('gamma')
    expect(flagged).not.toContain('beta')
    expect(free).toContain('gamma')
  })

  it('Prototype de transhumain: the bioware of a flagged character is marked as given', () => {
    const quality = {
      type: 'itemQuality', system: {
        isActive: true, systemEffects: [{
          value: 'transhumanPrototype'
        }], transhumanEssence: 1
      }
    }
    const actor = character(inCreation)
    actor.items = [quality]
    const flags = installationFlags(actor, {
      type: 'bioware'
    }, {
      creation: creationModeFor(actor)
    })
    expect(flags.transhumanGift).toBe(true)
    const off = installationFlags(actor, {
      type: 'bioware'
    }, {
      creation: creationModeFor(character())
    })
    expect(off.transhumanGift).toBe(false)
  })
})

describe('C0: the flag is the gamemaster\'s', () => {
  const actor = (flags = {
  }) => ({
    _source: {
      flags: {
        sr5: flags
      }
    }
  })

  it('a player setting the flag, flat or nested, is refused', () => {
    expect(refusedCreationChanges(actor(), {
      'flags.sr5.creation': {
        active: true, by: 'pl'
      }
    })).not.toHaveLength(0)
    expect(refusedCreationChanges(actor(), {
      flags: {
        sr5: {
          creation: {
            active: true
          }
        }
      }
    })).not.toHaveLength(0)
    expect(refusedCreationChanges(actor(), {
      'flags.sr5.creation.active': true
    })).not.toHaveLength(0)
  })

  it('a player lifting the flag, by a deletion or a false, is refused', () => {
    expect(refusedCreationChanges(actor(inCreation), {
      'flags.sr5.-=creation': null
    })).not.toHaveLength(0)
    expect(refusedCreationChanges(actor(inCreation), {
      'flags.sr5.creation.active': false
    })).not.toHaveLength(0)
  })

  it('an update that leaves the flag as it is goes through', () => {
    expect(refusedCreationChanges(actor(inCreation), {
      'system.nuyen.value': 3
    })).toHaveLength(0)
    expect(refusedCreationChanges(actor(inCreation), {
      flags: {
        sr5: {
          creation: {
            active: true, by: 'gm'
          }, other: 1
        }
      }
    })).toHaveLength(0)
  })

  it('the hook refuses the player, never the gamemaster', () => {
    const changes = {
      'flags.sr5.creation.active': true
    }
    globalThis.game.user = player
    expect(sr5CreationFlagRefused(actor(), {
      ...changes
    })).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_CreationFlagGMOnly')
    globalThis.game.user = gm
    expect(sr5CreationFlagRefused(actor(), {
      ...changes
    })).toBe(false)
  })

  it('an actor a player creates arrives without the flag; a gamemaster\'s keeps it', () => {
    const doc = {
      updateSource: vi.fn()
    }
    stripCreationOnCreate(doc, {
      flags: {
        sr5: inCreation
      }
    }, {
    }, 'pl')
    expect(doc.updateSource).toHaveBeenCalledWith({
      'flags.sr5.-=creation': null
    })
    const kept = {
      updateSource: vi.fn()
    }
    stripCreationOnCreate(kept, {
      flags: {
        sr5: inCreation
      }
    }, {
    }, 'gm')
    expect(kept.updateSource).not.toHaveBeenCalled()
  })
})
