import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//A spell with two effects (Pauline's remainder a): a player's browser sends one linkEffectToSource per effect, and the
//GM's socket handles both at once. Each read the spell before the other was written: the second wrote it back without
//the first link, and dispelling or dropping the spell left the first effect behind
const emitted = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: (type, data) => emitted.push({
      type, data
    }),
  },
}))

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

const player = {
  id: 'player', isGM: false, name: 'Joueuse'
}
const stranger = {
  id: 'stranger', isGM: false, name: 'Autre'
}

function world(){
  const caster = {
    name: 'Mage', testUserPermission: u => u.id === 'player'
  }
  const target = {
    name: 'Cible', testUserPermission: () => false
  }
  const stored = {
    duration: 'sustained', isActive: false, targetOfEffect: []
  }
  const spell = {
    uuid: 'Actor.mage.Item.spell', type: 'itemSpell', parent: caster,
    get system(){
      return stored
    },
    toObject: () => ({
      system: structuredClone(stored)
    }),
    //The write takes a while, as the server's round trip does
    update: vi.fn(async ({
      system
    }) => {
      await new Promise(r => setTimeout(r, 5))
      Object.assign(stored, structuredClone(system))
    }),
  }
  const effects = ['A', 'B'].map(id => ({
    uuid: `Actor.cible.Item.${id}`, type: 'itemEffect', parent: target, system: {
      ownerItem: spell.uuid
    }
  }))
  const docs = Object.fromEntries([spell, ...effects].map(d => [d.uuid, d]))
  globalThis.fromUuid = async uuid => docs[uuid] ?? null
  return {
    spell, stored, effects
  }
}

beforeEach(() => {
  emitted.length = 0
  game.users = {
    get: id => [player, stranger].find(u => u.id === id)
  }
})

describe('linkEffectToSource, two requests at once', () => {
  it('keeps both links on the spell', async () => {
    const {
      stored, effects
    } = world()
    await Promise.all(effects.map(e => SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        actorId: 'mage', targetItem: 'Actor.mage.Item.spell', effectUuid: e.uuid
      }
    }, 'player')))
    expect(stored.targetOfEffect).toEqual(['Actor.cible.Item.A', 'Actor.cible.Item.B'])
    expect(stored.isActive).toBe(true)
  })

  it('does not write the same link twice', async () => {
    const {
      stored, effects
    } = world()
    await SR5_ActorHelper.linkEffectToSource('mage', 'Actor.mage.Item.spell', effects[0].uuid)
    await SR5_ActorHelper.linkEffectToSource('mage', 'Actor.mage.Item.spell', effects[0].uuid)
    expect(stored.targetOfEffect).toEqual(['Actor.cible.Item.A'])
  })

  it('refuses a player who owns neither the spell nor the effect', async () => {
    const {
      spell, effects
    } = world()
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        actorId: 'mage', targetItem: spell.uuid, effectUuid: effects[0].uuid
      }
    }, 'stranger')
    expect(spell.update).not.toHaveBeenCalled()
  })
})

describe('applyExternalEffect, a spell with two effects', () => {
  it('links each effect it creates, by its own uuid', async () => {
    let n = 0
    const actor = {
      name: 'Cible', isToken: false, items: [],
      createEmbeddedDocuments: async (_, docs) => docs.map(d => {
        const created = {
          uuid: `Actor.cible.Item.e${n++}`, system: {
            ownerItem: d['system.ownerItem']
          }
        }
        //An item of the same source already there, listed after the new one
        actor.items.unshift(created)
        return created
      }),
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    vi.spyOn(SR5_EntityHelpers, 'getLabelByKey').mockReturnValue('label')
    globalThis.fromUuid = async () => ({
      name: 'Armure', type: 'itemSpell', system: {
        itemRating: 0, targetOfEffect: [], systemEffects: {
        },
        customEffects: {
          0: {
            category: 'characterAttributes', target: 'system.attributes.body.augmented', type: 'value', value: 1, transfer: true
          },
          1: {
            category: 'characterAttributes', target: 'system.attributes.agility.augmented', type: 'value', value: 1, transfer: true
          },
        }
      }
    })
    const was = game.user
    game.user = player
    try {
      await SR5_ActorHelper.applyExternalEffect('cible', {
        owner: {
          itemUuid: 'Actor.mage.Item.spell', actorId: 'mage', speakerActor: 'Mage'
        },
        roll: {
          hits: 3, netHits: 3
        }, test: {
          type: 'spell'
        },
      }, 'customEffects')
    } finally {
      game.user = was
    }
    expect(emitted.filter(m => m.type === 'linkEffectToSource').map(m => m.data.effectUuid))
      .toEqual(['Actor.cible.Item.e0', 'Actor.cible.Item.e1'])
  })
})
