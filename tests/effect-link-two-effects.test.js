import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//A spell with two effects (Pauline's remainder a): a player's browser sent one linkEffectToSource per effect, and the
//GM's socket handled both at once. Each read the spell before the other was written: the second wrote it back without
//the first link, and dispelling or dropping the spell left the first effect behind. With the alpha's guard (active GM,
//a card spent once), the second request of a spell the player does not own was refused outright: the effects of one
//card now come in one request
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
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

const gm = {
  id: 'gm', isGM: true, name: 'MJ'
}
const player = {
  id: 'player', isGM: false, name: 'Joueuse'
}
const stranger = {
  id: 'stranger', isGM: false, name: 'Autre'
}

//`spellOwner`: who owns the actor holding the spell; the effects are on an actor the player owns
function world(spellOwner = 'player'){
  const caster = {
    uuid: 'Actor.mage', name: 'Mage', testUserPermission: u => u.isGM || u.id === spellOwner
  }
  const target = {
    uuid: 'Actor.cible', name: 'Cible', testUserPermission: u => u.isGM || u.id === 'player'
  }
  const stored = {
    duration: 'sustained', isActive: false, targetOfEffect: []
  }
  const spell = {
    uuid: 'Actor.mage.Item.spell', documentName: 'Item', type: 'itemSpell', parent: caster,
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
    uuid: `Actor.cible.Item.${id}`, documentName: 'Item', type: 'itemEffect', parent: target, system: {
      ownerItem: spell.uuid
    }
  }))
  const docs = Object.fromEntries([spell, ...effects].map(d => [d.uuid, d]))
  globalThis.fromUuid = async uuid => docs[uuid] ?? null
  return {
    spell, stored, effects, caster
  }
}

const ask = (data, sender = 'player') => SR5_ActorHelper._socketLinkEffectToSource({
  data: {
    actorId: 'mage', targetItem: 'Actor.mage.Item.spell', ...data
  }
}, sender)

beforeEach(() => {
  vi.restoreAllMocks()
  emitted.length = 0
  game.user = gm
  game.users = {
    activeGM: gm, get: id => [gm, player, stranger].find(u => u.id === id)
  }
})

describe('linkEffectToSource on the active GM', () => {
  it('keeps both links when the two requests come at once', async () => {
    const {
      stored, effects
    } = world()
    await Promise.all(effects.map(e => ask({
      effectUuid: e.uuid
    })))
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

  it('links both effects of a spell she does not own, the card spent once for the two', async () => {
    const {
      stored, effects, caster
    } = world('gm')
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue({
      id: 'card', data: {
        owner: {
          itemUuid: 'Actor.mage.Item.spell'
        }
      }, roller: caster
    })
    let spent = false
    const consume = vi.spyOn(SR5_MiscellaneousHelpers, 'consume').mockImplementation(async () => {
      if (spent) return false
      return (spent = true)
    })
    await ask({
      effectUuid: effects[0].uuid, effectUuids: effects.map(e => e.uuid), messageId: 'card'
    })
    expect(stored.targetOfEffect).toEqual(['Actor.cible.Item.A', 'Actor.cible.Item.B'])
    expect(consume).toHaveBeenCalledTimes(1)
    //Shown again, the card links nothing more
    await ask({
      effectUuid: effects[0].uuid, effectUuids: effects.map(e => e.uuid), messageId: 'card'
    })
    expect(stored.targetOfEffect).toHaveLength(2)
  })

  it('refuses the whole request when one effect is not of that source, or not hers', async () => {
    const {
      spell, effects
    } = world()
    effects[1].system.ownerItem = 'Actor.x.Item.other'
    await ask({
      effectUuid: effects[0].uuid, effectUuids: effects.map(e => e.uuid)
    })
    expect(spell.update).not.toHaveBeenCalled()
    await ask({
      effectUuid: effects[0].uuid
    }, 'stranger')
    expect(spell.update).not.toHaveBeenCalled()
  })
})

describe('applyExternalEffect, a spell with two effects, applied by a player', () => {
  it('asks the GM once for both effects it created, by their own uuids', async () => {
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
    game.user = player
    await SR5_ActorHelper.applyExternalEffect('cible', {
      owner: {
        itemUuid: 'Actor.mage.Item.spell', actorId: 'mage', speakerActor: 'Mage', messageId: 'card'
      },
      roll: {
        hits: 3, netHits: 3
      }, test: {
        type: 'spell'
      },
    }, 'customEffects')
    const sent = emitted.filter(m => m.type === 'linkEffectToSource')
    expect(sent).toHaveLength(1)
    expect([sent[0].data.effectUuids, sent[0].data.messageId]).toEqual([['Actor.cible.Item.e0', 'Actor.cible.Item.e1'], 'card'])
  })
})
