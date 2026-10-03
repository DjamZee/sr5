import {
  describe, it, expect, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

// Every roll made, and the faces each one shows, in order
let rolls = []
let queue = []

globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula
    rolls.push(formula)
  }
  async evaluate() {
    const count = Number(this.formula.split('d')[0])
    this.dice = [{
      results: queue.splice(0, count).map(result => ({
        result, active: true
      }))
    }]
    return this
  }
}

globalThis.fromUuid = async () => ({
  name: 'Ares Predator V',
  system: {
    availability: {
      value: 5
    },
    price: {
      value: 725
    },
  },
})
globalThis.foundry.applications.handlebars = {
  renderTemplate: async () => ''
}
globalThis.foundry.documents.ChatMessage = {
  create: async () => null,
  getSpeaker: () => ({
  }),
}
globalThis.game.settings.get = () => 25

const {
  SR5ShopAvailability
} = await import('../modules/interface/shop-availability.js')

const line = [{
  uuid: 'Compendium.x.y.z', quantity: 1, name: 'Ares Predator V'
}]

// Negotiation 3 + Charisma 5 = 8 dice, Social limit 3
const buyer = {
  id: 'buyer', name: 'Acheteur', items: [],
  system: {
    attributes: {
      charisma: {
        augmented: {
          value: 5
        }
      }
    },
    skills: {
      negotiation: {
        rating: {
          value: 3
        },
        test: {
          base: 8, dicePool: 8, modifiers: []
        },
      }
    },
    limits: {
      socialLimit: {
        value: 3
      }
    },
  },
}

beforeEach(() => {
  rolls = []
  queue = []
})

describe('A limit left empty is the computed limit', () => {
  // Eight hits on eight dice, none against them
  const eightHits = () => [5, 5, 5, 5, 5, 5, 5, 5, 1, 2, 2, 3, 4]

  it('an imposed pool with an empty limit keeps the Social limit', async () => {
    queue = eightHits()
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      overridePool: 8, overrideLimit: ''
    })
    expect(card.limit).toBe(3)
    expect(card.results[0].hits).toBe(3)
  })

  it('a typed limit replaces the computed one', async () => {
    queue = eightHits()
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      overridePool: 8, overrideLimit: 6
    })
    expect(card.limit).toBe(6)
    expect(card.results[0].hits).toBe(6)
  })

  it('a typed limit applies without an imposed pool', async () => {
    queue = eightHits()
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      overridePool: '', overrideLimit: 5
    })
    expect(card.pool).toBe(8)
    expect(card.results[0].hits).toBe(5)
  })

  it('there is no limit of 0: it falls back to the computed one', async () => {
    queue = eightHits()
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      overridePool: 8, overrideLimit: 0
    })
    expect(card.results[0].hits).toBe(3)
  })
})

describe('An imposed pool of 0 is 0 dice, not "no override"', () => {
  it('typedNumber tells an empty field from a 0', () => {
    expect(SR5ShopAvailability.typedNumber('')).toBe(null)
    expect(SR5ShopAvailability.typedNumber(undefined)).toBe(null)
    expect(SR5ShopAvailability.typedNumber(null)).toBe(null)
    expect(SR5ShopAvailability.typedNumber('0')).toBe(0)
    expect(SR5ShopAvailability.typedNumber(0)).toBe(0)
    expect(SR5ShopAvailability.typedNumber('4.7')).toBe(4)
    expect(SR5ShopAvailability.typedNumber(-3)).toBe(0)
  })

  it('availability: an imposed 0 is "no test", nothing rolled', async () => {
    queue = [5, 5, 5, 5, 5, 5, 5, 5, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      overridePool: 0
    })
    expect(rolls).toEqual([])
    expect(card.pool).toBe(0)
    expect(card.overridden).toBe(true)
    expect(card.results[0].outcome).toBe('noPool')
  })

  it('availability: an empty pool field still computes the pool', async () => {
    queue = [5, 5, 5, 5, 5, 5, 5, 5, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      overridePool: ''
    })
    expect(card.pool).toBe(8)
    expect(card.overridden).toBe(false)
  })

  it('availability: an imposed 0 plus a surcharge die is a one-die test', async () => {
    queue = [5, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 25, {
      overridePool: 0
    })
    expect(rolls).toEqual(['1d6', '5d6'])
    expect(card.results[0].outcome).toBe('success')
  })

  it('fence: an imposed 0 searches with no die, and says so', async () => {
    const {
      SR5ShopFence
    } = await import('../modules/interface/shop-fence.js')
    const gun = {
      id: 'gun', name: 'Ares Predator V', system: {
        price: {
          value: 725
        }, quantity: 1
      }
    }
    const seller = {
      ...buyer,
      items: {
        get: id => (id === 'gun' ? gun : undefined)
      },
    }
    seller.system = {
      ...buyer.system,
      skills: {
        etiquette: {
          rating: {
            value: 4
          }, test: {
            dicePool: 9
          }
        },
        negotiation: buyer.system.skills.negotiation,
      },
    }
    queue = [5, 5, 5, 5, 5, 5, 5, 5, 5]
    const card = await SR5ShopFence.sellOnMarket(seller, [{
      itemId: 'gun', quantity: 1
    }], {
      useAvailability: false, overridePool: 0
    })
    expect(rolls).toEqual([])
    expect(card.searchFailed).toBe(true)
    expect(card.searchImpossible).toBe(true)
    expect(card.delayLabel).toBe('—')
    expect(card.overridden).toBe(true)
    expect(card.canSell).toBeFalsy()
  })
})

describe('Delays take the singular: 1 jour, not 1 jours', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../lang/${name}.json`, import.meta.url), 'utf8'))
  const delay = (lang, hours) => {
    const i18n = globalThis.game.i18n
    const saved = {
      lang: i18n.lang, format: i18n.format
    }
    const strings = read(lang)
    i18n.lang = lang
    i18n.format = (key, data) => strings[key].replace('{value}', data.value)
    try {
      return SR5ShopAvailability.formatDelay(hours)
    } finally {
      Object.assign(i18n, saved)
    }
  }

  it('French', () => {
    expect(delay('fr', 24)).toBe('1 jour')
    expect(delay('fr', 36)).toBe('1.5 jour')
    expect(delay('fr', 48)).toBe('2 jours')
    expect(delay('fr', 24 * 7)).toBe('1 semaine')
    expect(delay('fr', 24 * 14)).toBe('2 semaines')
    expect(delay('fr', 24 * 30)).toBe('1 mois')
    expect(delay('fr', 6)).toBe('6 h')
  })

  it('English', () => {
    expect(delay('en', 24)).toBe('1 day')
    expect(delay('en', 36)).toBe('1.5 days')
    expect(delay('en', 48)).toBe('2 days')
    expect(delay('en', 24 * 7)).toBe('1 week')
    expect(delay('en', 24 * 30)).toBe('1 month')
    expect(delay('en', 24 * 60)).toBe('2 months')
  })
})
