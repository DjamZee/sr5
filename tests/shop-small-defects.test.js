import {
  describe, it, expect, beforeEach
} from 'vitest'

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
