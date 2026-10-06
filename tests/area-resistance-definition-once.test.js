import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// M5 D6 (mesuré par Elsa, 06/10) : la définition d'un sort de zone de joueuse, validée une fois pour le gabarit,
// était redemandée à « Appliquer l'effet » de chaque carte de résistance. La carte d'un acteur que le gabarit du MJ a
// fait résister reprend la décision du gabarit ; une carte que le MJ n'a pas fait résister reste demandée.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

const armor = value => ({
  0: {
    category: 'armors', target: 'system.itemsProperties.armor', type: 'value', value, transfer: true
  }
})

describe("M5 D6 : une décision par gabarit, cartes de résistance comprises", () => {
  let caster, aide, cible, spell
  beforeEach(() => {
    caster = {
      id: 'caster', name: 'Mage', documentName: 'Actor', testUserPermission: (u, level) => u.id === 'player' && level === 'OWNER',
    }
    const npc = (uuid) => ({
      uuid, name: uuid, isToken: false, items: [], testUserPermission: () => false
    })
    aide = npc('Actor.aide')
    cible = npc('Actor.cible')
    spell = {
      uuid: 'Actor.caster.Item.spell', name: 'Confusion de masse', type: 'itemSpell', parent: caster, system: {
        resisted: true, itemRating: 0, customEffects: armor(4)
      }
    }
    SR5_ActorHelper.DEFINITION_DECISIONS.clear()
    SR5_ActorHelper.AREA_REVIEW_KEYS.clear()
    vi.spyOn(SR5_ActorHelper, 'findReferenceItem').mockResolvedValue(null)
    globalThis.game.user = {
      id: 'gm', isGM: true
    }
    globalThis.game.users = [{
      id: 'gm', isGM: true
    }, {
      id: 'player', isGM: false
    }]
  })
  afterEach(() => vi.restoreAllMocks())

  const resistanceCard = () => ({
    owner: {
      itemUuid: spell.uuid, actorId: 'resister'
    }, previousMessage: {
      messageId: 'cast'
    }, test: {
      type: 'spellResistance'
    }
  })

  it("la carte de résistance d'un acteur du gabarit reprend la clé du gabarit", async () => {
    const templateReview = await SR5_ActorHelper.definitionReview(spell, aide, 'customEffects', {
      owner: {
        itemUuid: spell.uuid, actorId: 'template'
      }, areaTemplate: true
    })
    SR5_ActorHelper.AREA_REVIEW_KEYS.set(SR5_ActorHelper.areaReviewKey(aide, spell.uuid, 'cast'), templateReview.key)
    SR5_ActorHelper.AREA_REVIEW_KEYS.set(SR5_ActorHelper.areaReviewKey(cible, spell.uuid, 'cast'), templateReview.key)

    const forAide = await SR5_ActorHelper.definitionReview(spell, aide, 'customEffects', resistanceCard())
    const forCible = await SR5_ActorHelper.definitionReview(spell, cible, 'customEffects', resistanceCard())
    expect(forAide.key).toBe(templateReview.key)
    expect(forCible.key).toBe(templateReview.key)
    expect(forCible.area).toBe(true)

    // A single window for the whole template
    const ask = vi.fn(async () => true)
    await SR5_ActorHelper.definitionDecision(forAide, ask)
    await SR5_ActorHelper.definitionDecision(forCible, ask)
    expect(ask).toHaveBeenCalledOnce()
  })

  it("une carte que le gabarit du MJ n'a pas demandée garde sa propre décision", async () => {
    const review = await SR5_ActorHelper.definitionReview(spell, cible, 'customEffects', resistanceCard())
    expect(review.key).toBe(`${spell.uuid}|resister|${review.key.split('|').pop()}`)
    expect(review.area).toBe(false)
  })

  it("la définition changée sur la fiche depuis le gabarit est redemandée", async () => {
    const templateReview = await SR5_ActorHelper.definitionReview(spell, aide, 'customEffects', {
      owner: {
        itemUuid: spell.uuid, actorId: 'template'
      }, areaTemplate: true
    })
    SR5_ActorHelper.AREA_REVIEW_KEYS.set(SR5_ActorHelper.areaReviewKey(aide, spell.uuid, 'cast'), templateReview.key)
    spell.system.customEffects = armor(9)
    const review = await SR5_ActorHelper.definitionReview(spell, aide, 'customEffects', resistanceCard())
    expect(review.key).not.toBe(templateReview.key)
  })
})
