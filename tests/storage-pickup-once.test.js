import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  SR5Actor
} from '../modules/entities/actors/entityActor.js'
import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

// Foundry's own Actor._preCreate is not there under test
Object.getPrototypeOf(SR5Actor.prototype)._preCreate ??= async () => {}
globalThis.CONST ??= {
  TOKEN_DISPLAY_MODES: {
    OWNER: 30
  }
}

const gear = (id, name) => ({
  _id: id, id, name, type: 'itemGear', system: {
    storedIn: ''
  },
  toObject() {
    return {
      _id: id, name, type: 'itemGear', system: {
        storedIn: ''
      }
    }
  },
})

// The character who put the bag down, and what comes back to them
const owner = () => {
  const bagItem = {
    id: 'bagItem', system: {
      isDeployed: true
    }, update: async () => {}
  }
  const actor = {
    received: [],
    getEmbeddedDocument: () => bagItem,
    createEmbeddedDocuments: async (_type, docs) => {
      actor.received.push(...docs)
    },
  }
  return actor
}

// The bag as the sheet hands it over: a plain copy of the actor in the
// sidebar, which still holds all that was put in it
const bag = () => ({
  _id: 'bagActor', type: 'actorStorage', system: {
    creatorId: 'ownerId', creatorItemId: 'bagItem'
  },
  items: [gear('pistol', 'Pistolet'), gear('jacket', 'Veste')],
})

const sceneWith = (...tokens) => ({
  tokens
})

describe('a storage put down on the map (SR5 p. 445: whoever holds a certified credstick holds its money)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.game.scenes
    globalThis.Actor.deleteDocuments = undefined
  })

  // What _preCreate() leaves in the actor's source, its updates laid on in turn
  const createdSource = async system => {
    const storage = Object.create(SR5Actor.prototype)
    Object.assign(storage, {
      type: 'actorStorage', name: 'Sac', system
    })
    const source = {
    }
    storage.updateSource = data => {
      for (const [key, value] of Object.entries(data)) {
        foundry.utils.setProperty(source, key, value === undefined ? value : foundry.utils.duplicate(value))
      }
    }
    await storage._preCreate({
    }, {
    }, {
    })
    return source
  }

  it('wears a token linked to its actor, so taking through the token takes from the actor', async () => {
    const source = await createdSource({
      creatorItemId: 'bagItem'
    })
    expect(source.prototypeToken.actorLink).toBe(true)
  })

  it('stays linked when it wears a token remembered from an unlinked bag', async () => {
    const source = await createdSource({
      creatorItemId: 'bagItem', sideKickPrototypeToken: {
        actorLink: false, width: 0.5
      }
    })
    expect(source.prototypeToken.actorLink).toBe(true)
    expect(source.prototypeToken.width).toBe(0.5)
  })

  it('gives back, when picked up, only what is still in its unlinked token', async () => {
    const character = owner()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(character)
    globalThis.Actor.deleteDocuments = async () => {}
    // Someone took the pistol through the token: only the jacket is left in it
    globalThis.game.scenes = [sceneWith({
      actorId: 'bagActor', actorLink: false, actor: {
        items: [gear('jacket', 'Veste')]
      }
    })]

    await SR5_ActorHelper.dimissSidekick(bag())

    expect(character.received.map(i => i.name)).toEqual(['Veste'])
    expect(character.received[0].system.storedIn).toBe('bagItem')
  })

  it('gives back everything when nothing was taken', async () => {
    const character = owner()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(character)
    globalThis.Actor.deleteDocuments = async () => {}
    globalThis.game.scenes = [sceneWith({
      actorId: 'bagActor', actorLink: false, actor: {
        items: [gear('pistol', 'Pistolet'), gear('jacket', 'Veste')]
      }
    })]

    await SR5_ActorHelper.dimissSidekick(bag())

    expect(character.received.map(i => i.name)).toEqual(['Pistolet', 'Veste'])
  })

  it('reads the actor itself when its token is linked, or gone from the map', async () => {
    const character = owner()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(character)
    globalThis.Actor.deleteDocuments = async () => {}
    globalThis.game.scenes = [sceneWith({
      actorId: 'bagActor', actorLink: true, actor: {
        items: []
      }
    })]

    await SR5_ActorHelper.dimissSidekick(bag())

    expect(character.received.map(i => i.name)).toEqual(['Pistolet', 'Veste'])
  })
})
