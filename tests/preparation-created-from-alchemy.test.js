import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ThirdPartyHelpers
} = await import('../modules/rolls/roll-helpers/thirdparty.js')

// G9, relecture d'Octave (06/10) : par le vrai chemin (jet d'Alchimie, « Créer préparation »), la préparation sortait
// avec Potentiel 0, Potentiel de départ 0 et sans heure de création, et « Lancer » la refusait aussitôt : les valeurs
// étaient posées en clés « system.xxx » sur le modèle vivant du sort de la fiche, qui en était modifié en mémoire.

// The sheet's spell: its system is a live model (here a class instance), its plain copy comes from toObject()
class SpellModel {
  constructor(){
    this.category = 'illusion'; this.force = 0; this.potency = 0; this.drainValue = {
      value: 3, base: 3, modifiers: []
    }
  }
}

let spell, actor, created
beforeEach(() => {
  spell = {
    uuid: 'Actor.a1.Item.s1', name: 'Ténèbres', type: 'itemSpell', system: new SpellModel(),
    toObject(){
      return {
        name: this.name, type: this.type, system: JSON.parse(JSON.stringify(this.system))
      }
    },
  }
  created = null
  actor = {
    name: 'Abbi', items: [spell], createEmbeddedDocuments: vi.fn(async (_type, docs) => {
      created = docs[0]; return docs
    })
  }
  globalThis.game.time = {
    worldTime: 5000
  }
  globalThis.game.i18n = {
    localize: k => k, format: k => k
  }
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
})

const card = () => ({
  owner: {
    itemUuid: 'Actor.a1.Item.s1'
  }, previousMessage: {
    hits: 6
  }, roll: {
    hits: 0
  }, magic: {
    force: 5, preparationTrigger: 'command'
  },
})

describe("G9 : préparation créée par le jet d'Alchimie", () => {
  it('sort avec son Potentiel, son Potentiel de départ et son heure de création, rangés dans system', async () => {
    await SR5_ThirdPartyHelpers.buildItem(card(), 'createPreparation', actor)
    expect(created.type).toBe('itemPreparation')
    expect(created.system).toMatchObject({
      potency: 6, initialPotency: 6, createdAt: 5000, fullPotencyMultiplier: 2, decayRate: 'hour',
      force: 5, trigger: 'command', freeSustain: true, hits: 0, category: 'illusion'
    })
    expect(Object.keys(created).filter(k => k.startsWith('system.'))).toEqual([])
  })

  it('ne touche jamais au sort de la fiche', async () => {
    await SR5_ThirdPartyHelpers.buildItem(card(), 'createPreparation', actor)
    expect(created.system).not.toBe(spell.system)
    expect(spell.system).toEqual(new SpellModel())
  })
})
