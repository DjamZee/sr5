import {
  describe, it, expect, beforeEach
} from 'vitest'

// An unlinked NPC is named on its cards by its token's id. getRealActorFromID looked for it on the scene the
// reader views first: a GM on another scene, where a copy of the scene keeps the same token ids, got the copy's
// NPC. The card now carries the uuid the roller found for each id (actorUuids), and the reader follows it

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

function token(sceneId, id, name) {
  const actor = {
    name, isToken: true
  }
  const doc = {
    id, documentName: 'Token', uuid: `Scene.${sceneId}.Token.${id}`, actor, parent: {
      id: sceneId
    }
  }
  actor.token = doc
  return doc
}

function scene(id, tokens) {
  const map = new Map(tokens.map(t => [t.id, t]))
  return {
    id, tokens: map
  }
}

let npcA, npcB, docs
beforeEach(() => {
  npcA = token('A', 'tok1', 'NPC on scene A')
  npcB = token('B', 'tok1', 'NPC on the copy B')
  const scenes = [scene('A', [npcA]), scene('B', [npcB])]
  docs = {
    [npcA.uuid]: npcA, [npcB.uuid]: npcB
  }
  globalThis.fromUuidSync = uuid => docs[uuid] ?? null
  globalThis.game = {
    actors: new Map(), scenes: Object.assign(scenes, {
      get: id => scenes.find(s => s.id === id)
    })
  }
  //The GM views the copy
  globalThis.canvas = {
    scene: {
      id: 'B'
    }, tokens: {
      get: id => (id === 'tok1' ? {
        scene: {
          id: 'B'
        }
      } : undefined)
    }
  }
})

describe('an unlinked NPC named on a card', () => {
  it('is the token the roller meant, not the one on the scene the GM views', () => {
    const uuids = {
      tok1: npcA.uuid
    }
    expect(SR5_EntityHelpers.getRealActorFromID('tok1', uuids)).toBe(npcA.actor)
  })

  it('is found on a scene nobody views', () => {
    globalThis.canvas = {
      scene: null
    }
    expect(SR5_EntityHelpers.getRealActorFromID('tok1', {
      tok1: npcA.uuid
    })).toBe(npcA.actor)
  })

  it('never follows a uuid that names another id', () => {
    docs['Scene.A.Token.other'] = {
      ...npcA, id: 'other'
    }
    expect(SR5_EntityHelpers.getRealActorFromID('tok1', {
      tok1: 'Scene.A.Token.other'
    })).toBe(npcB.actor)
  })

  it('is written on the card by the roller, and kept from the card it answers', () => {
    const roller = {
      isToken: false, uuid: 'Actor.pc'
    }
    const uuids = SR5_EntityHelpers.cardActorUuids({
      owner: {
        actorId: 'pc', speakerId: 'pc'
      }, target: {
        actorId: 'tok1'
      }, previousMessage: {
      }
    }, roller, {
      actorUuids: {
        tok1: npcA.uuid
      }
    })
    expect(uuids).toEqual({
      pc: 'Actor.pc', tok1: npcA.uuid
    })
  })
})
