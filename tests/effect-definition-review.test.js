import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// A player's spell defines its own effects on her sheet: unticking "resisted" applied it without a resistance
// test, and its value, multiplier and target were hers to write (found by Xanthe). Applied by the GM to an actor
// she does not own, he now sees what will be applied, against the reference item, and may decline

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  compareDefinitions, transferEntries, definitionsMatch, entryValue
} = await import('../modules/entities/actors/effect-definition.js')

const armor = (value, type = 'value') => ({
  0: {
    category: 'armors', target: 'system.itemsProperties.armor', type, value, transfer: true
  }
})

describe('a player sheet spell applied by the GM to an NPC', () => {
  let created, confirm, caster, target, spell, reference
  beforeEach(() => {
    created = undefined
    caster = {
      id: 'caster', name: 'Mage', documentName: 'Actor', testUserPermission: (u, level) => u.id === 'player' && level === 'OWNER',
    }
    target = {
      name: 'Garde', isToken: false, items: [], testUserPermission: () => false, createEmbeddedDocuments: async (_, docs) => {
        created = docs[0]; throw new Error('stop')
      }
    }
    spell = {
      uuid: 'Actor.caster.Item.spell', name: 'Armure', type: 'itemSpell', parent: caster, system: {
        resisted: false, itemRating: 0, targetOfEffect: [], systemEffects: {
        }, customEffects: armor(4)
      }
    }
    reference = {
      uuid: 'Compendium.sr5.spells.Item.ref', pack: 'sr5.spells', name: 'Armure', type: 'itemSpell', system: {
        resisted: true, customEffects: armor(2)
      }
    }
    SR5_ActorHelper.DEFINITION_OK.clear()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'caster' ? caster : target)
    vi.spyOn(SR5_EntityHelpers, 'getLabelByKey').mockReturnValue('Armure')
    globalThis.fromUuid = async uuid => uuid === reference.uuid ? reference : spell
    confirm = vi.fn(async () => true)
    globalThis.foundry.applications.api = {
      ...(globalThis.foundry.applications.api ?? {
      }), DialogV2: {
        confirm
      }
    }
    globalThis.game.user = {
      id: 'gm', isGM: true
    }
    globalThis.game.users = [{
      id: 'gm', isGM: true
    }, {
      id: 'player', isGM: false
    }]
    globalThis.game.i18n.format = k => k
    globalThis.game.messages = {
      get: () => ({
        author: {
          id: 'player', isGM: false, name: 'Joueuse'
        }
      })
    }
    const pack = {
      documentName: 'Item', metadata: {
        label: 'Sorts'
      }, getIndex: async () => [{
        _id: 'ref', name: 'Armure', type: 'itemSpell'
      }], getDocument: async () => reference
    }
    globalThis.game.packs = Object.assign([pack], {
      get: () => pack
    })
    globalThis.game.items = []
  })
  afterEach(() => vi.restoreAllMocks())

  const card = () => ({
    owner: {
      itemUuid: spell.uuid, actorId: 'caster', speakerActor: 'Mage', messageId: 'msg'
    }, roll: {
      hits: 3, netHits: 3
    }, test: {
      type: 'spell'
    }
  })

  it('shows the missing resistance and the differences before applying', async () => {
    await SR5_ActorHelper.applyExternalEffect('target', card(), 'customEffects').catch(() => {})
    expect(confirm).toHaveBeenCalledOnce()
    const html = confirm.mock.calls[0][0].content
    expect(html).toContain('SR5.EffectDefinitionNoResistance')
    expect(html).toContain('SR5.EffectDefinitionRefResisted')
    expect(html).toContain('SR5.EffectDefinitionChanged')
    expect(created['system.value']).toBe(4)
  })

  it('applies nothing when the GM declines', async () => {
    confirm.mockResolvedValueOnce(false)
    await SR5_ActorHelper.applyExternalEffect('target', card(), 'customEffects')
    expect(created).toBeUndefined()
  })

  it('says when no reference is found', async () => {
    globalThis.game.packs = Object.assign([], {
      get: () => null
    })
    await SR5_ActorHelper.applyExternalEffect('target', card(), 'customEffects').catch(() => {})
    expect(confirm.mock.calls[0][0].content).toContain('SR5.EffectDefinitionNoReference')
  })

  it('asks nothing for the GM\'s own NPC, nor for a target the player owns', async () => {
    globalThis.game.users = [{
      id: 'gm', isGM: true
    }]
    await SR5_ActorHelper.applyExternalEffect('target', card(), 'customEffects').catch(() => {})
    globalThis.game.users = [{
      id: 'gm', isGM: true
    }, {
      id: 'player', isGM: false
    }]
    target.testUserPermission = u => u.id === 'player'
    await SR5_ActorHelper.applyExternalEffect('target', card(), 'customEffects').catch(() => {})
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('compareDefinitions', () => {
  it('finds a changed value, an added and a missing entry', () => {
    const sheet = {
      resisted: false, entries: transferEntries({
        ...armor(4), 1: {
          transfer: true, category: 'limits', target: 'x', type: 'hits'
        }
      })
    }
    const ref = {
      resisted: false, entries: transferEntries({
        ...armor(2), 2: {
          transfer: true, category: 'skills', target: 'y', type: 'netHits'
        }
      })
    }
    const d = compareDefinitions(sheet, ref)
    expect([d.changed.length, d.added.length, d.missing.length, d.resistedDiffers]).toEqual([1, 1, 1, false])
    expect(definitionsMatch(compareDefinitions(ref, ref))).toBe(true)
  })
  it('ignores the value field of an entry that reads the hits', () => {
    const a = transferEntries(armor(9, 'hits')), b = transferEntries(armor(0, 'hits'))
    expect(definitionsMatch(compareDefinitions({
      entries: a
    }, {
      entries: b
    }))).toBe(true)
  })
  it('computes an entry value as applyExternalEffect does', () => {
    expect(entryValue({
      type: 'netHitsReplace', multiplier: 2
    }, {
      netHits: 3
    })).toBe(6)
    expect(entryValue({
      type: 'rating'
    }, {
    }, 4)).toBe(4)
  })
})
