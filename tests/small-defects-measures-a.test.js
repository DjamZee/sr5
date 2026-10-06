import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

const updateChatButtonHelper = vi.fn()
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    updateChatButtonHelper: (...args) => updateChatButtonHelper(...args),
    generateChatButton: (...args) => args,
  },
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
    getRealActorFromID: () => ({
      system: {
      }
    }),
  },
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
    getCombatantFromActor: () => null
  },
}))
vi.mock('../modules/entities/actors/entityActor-helpers.js', () => ({
  SR5_ActorHelper: {
  },
}))
vi.mock('../modules/rolls/roll-helpers/combat.js', () => ({
  SR5_CombatHelpers: {
  },
}))

const {
  default: resistanceInfo
} = await import('../modules/rolls/roll-test-case/test-Resistance.js')

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

const toxinCard = messageId => ({
  previousMessage: {
    messageId
  },
  test: {
    typeSub: "toxinDamage"
  },
  damage: {
    value: 0, toxin: {
      power: 0
    }
  },
  roll: {
    hits: 0
  },
  combat: {
    calledShot: {
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

// S6: a drug crash is resisted without any previous card; asking to remove a button of message "undefined"
// went to the GM by socket, and without a GM warned "No GM connected ... not applied" for nothing.
describe('Resistance without a previous card', () => {
  beforeEach(() => {
    updateChatButtonHelper.mockClear()
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }, messages: {
        get: () => undefined
      }
    }
  })

  it('relays nothing when there is no previous message', async () => {
    await resistanceInfo(toxinCard(undefined), "actor")
    expect(updateChatButtonHelper).not.toHaveBeenCalled()
  })

  it('still removes the button of a previous card', async () => {
    await resistanceInfo(toxinCard("msg1"), "actor")
    expect(updateChatButtonHelper).toHaveBeenCalledWith("msg1", "resistanceToxin")
  })
})

// S13: a non-active GM refused on a radiation card was told about the "disease ledger"
describe('Radiation refusal wording', () => {
  it('uses its own key, translated in both languages', () => {
    const source = read('../modules/system/radiation.js')
    expect(source).not.toMatch(/DISEASE_ActiveGMOnly/)
    expect(source).toMatch(/RADIATION_ActiveGMOnly/)
    for (const lang of ['fr', 'en']) {
      const strings = JSON.parse(read(`../lang/${lang}.json`))
      expect(strings["SR5.RADIATION_ActiveGMOnly"]).toMatch(/radiation/i)
    }
  })
})

// S14: the blast line read grenade.*, the card carries the data under combat.grenade: it showed "m" alone
describe('Attack card: grenade blast line', () => {
  it('reads the radius and fall-off under combat.grenade', () => {
    const template = read('../templates/rolls/rollCardPartial/attackRoll.hbs')
    expect(template).toMatch(/{{combat\.grenade\.blastRadius}}m/)
    expect(template).toMatch(/combat\.grenade\.damageFallOff/)
    expect(template).not.toMatch(/[^.]grenade\.blastRadius/)
  })

  it('also shows it for a grenade or missile launcher (combat.grenade.isGrenade)', () => {
    const template = read('../templates/rolls/rollCardPartial/attackRoll.hbs')
    expect(template).toMatch(/{{#if \(or \(eq test\.typeSub 'grenade'\) combat\.grenade\.isGrenade\)}}/)
  })
})
