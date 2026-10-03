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

const buyer = {
  id: 'buyer', name: 'Acheteur', items: [], system: {
  }
}
const line = [{
  uuid: 'Compendium.x.y.z', quantity: 1, name: 'Ares Predator V'
}]

// A contact who never learnt Negotiation and has Charisma 1: defaulting,
// Charisma - 1 = 0 die (SR5 p. 55)
const defaultingContact = (charisma = 1) => ({
  name: 'Contact en défausse',
  system: {
    connection: 2,
    type: 'Barman',
    attributes: {
      charisma: {
        natural: {
          base: charisma
        }
      }
    },
    skills: {
    },
  },
})

// An untrained Negotiation as the sheet leaves it: base 0, then Charisma,
// defaulting and wounds as modifiers, the total floored at 0
const untrained = (...values) => ({
  rating: {
    value: 0
  },
  test: {
    base: 0,
    dicePool: Math.max(0, values.reduce((sum, v) => sum + v, 0)),
    modifiers: values.map(value => ({
      value, isMultiplier: false
    })),
  },
})

beforeEach(() => {
  rolls = []
  queue = []
})

describe('Shop availability with no dice (SR5 p. 58)', () => {
  it('a contact defaulting at Charisma 1 has no die', () => {
    const searcher = SR5ShopAvailability.contactPool(defaultingContact())
    expect(searcher.defaulting).toBe(true)
    expect(searcher.pool).toBe(0)
  })

  it('no die means no test: nothing is rolled and nothing is found', async () => {
    // Availability dice that would tie at 0 hits if they were rolled
    queue = [1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(buyer, defaultingContact(), line)
    expect(rolls).toEqual([])
    expect(card.results[0].outcome).toBe('noPool')
    expect(card.results[0].obtained).toBe(false)
    expect(card.results[0].delayLabel).toBe('—')
    expect(card.canBuy).toBe(false)
  })

  it('a die bought by a surcharge opens the test again', async () => {
    // One die from +25 %, a 5 against an availability that rolls no hit
    queue = [5, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(buyer, defaultingContact(), line, 25)
    expect(card.pool).toBe(1)
    expect(rolls).toEqual(['1d6', '5d6'])
    expect(card.results[0].outcome).toBe('success')
  })

  it('a single die is still a test, even a losing one', async () => {
    queue = [2, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(buyer, defaultingContact(2), line)
    expect(card.pool).toBe(1)
    expect(rolls).toEqual(['1d6', '5d6'])
    expect(card.results[0].outcome).toBe('tie')
  })

  it('the buyer\'s pool is the one the sheet computed, defaulting and wounds included', () => {
    // Charisma 3, no Negotiation, a -1 wound: the sheet says 3 - 1 - 1 = 1
    const actor = {
      name: 'Blessé', system: {
        attributes: {
          charisma: {
            augmented: {
              value: 3
            }
          }
        },
        skills: {
          negotiation: untrained(3, -1, -1)
        },
        limits: {
          socialLimit: {
            value: 4
          }
        },
      }
    }
    expect(SR5ShopAvailability.buyerPool(actor).pool).toBe(1)
  })

  it('a buyer whose sheet computes no die gets no die back', async () => {
    // Charisma 1, no Negotiation: defaulting leaves 0 (SR5 p. 55)
    const actor = {
      id: 'b', name: 'Charisme 1', items: [], system: {
        attributes: {
          charisma: {
            augmented: {
              value: 1
            }
          }
        },
        skills: {
          negotiation: untrained(1, -1)
        },
        limits: {
          socialLimit: {
            value: 2
          }
        },
      }
    }
    expect(SR5ShopAvailability.buyerPool(actor).pool).toBe(0)
    queue = [1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(actor, null, line)
    expect(rolls).toEqual([])
    expect(card.results[0].outcome).toBe('noPool')
  })

  it('a surcharge die does not lift a pool that is below zero (SR5 p. 58)', async () => {
    // Charisma 1, defaulting -1, wounds -2: -2 on the sheet, floored to 0
    // there. One surcharge die makes -1, still no test.
    const actor = {
      id: 'c', name: 'Charisme 1 blessé', items: [], system: {
        attributes: {
          charisma: {
            augmented: {
              value: 1
            }
          }
        },
        skills: {
          negotiation: untrained(1, -1, -2)
        },
        limits: {
          socialLimit: {
            value: 2
          }
        },
      }
    }
    queue = [5, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(actor, null, line, 25)
    expect(rolls).toEqual([])
    expect(card.pool).toBe(0)
    expect(card.results[0].outcome).toBe('noPool')
  })

  it('a surcharge die still opens the test on a pool at exactly zero', async () => {
    const actor = {
      id: 'd', name: 'Charisme 1', items: [], system: {
        attributes: {
          charisma: {
            augmented: {
              value: 1
            }
          }
        },
        skills: {
          negotiation: untrained(1, -1)
        },
        limits: {
          socialLimit: {
            value: 2
          }
        },
      }
    }
    queue = [5, 1, 2, 2, 3, 4]
    const card = await SR5ShopAvailability.testLines(actor, null, line, 25)
    expect(card.pool).toBe(1)
    expect(rolls).toEqual(['1d6', '5d6'])
    expect(card.results[0].outcome).toBe('success')
  })

  it('goods without availability are still bought with no die', async () => {
    const free = globalThis.fromUuid
    globalThis.fromUuid = async () => ({
      name: 'Soykaf', system: {
        price: {
          value: 5
        }
      }
    })
    try {
      const card = await SR5ShopAvailability.testLines(buyer, defaultingContact(), line)
      expect(rolls).toEqual([])
      expect(card.results[0].outcome).toBe('common')
      expect(card.canBuy).toBe(true)
    } finally {
      globalThis.fromUuid = free
    }
  })
})

describe('Fence pools read off the sheet', () => {
  it('the search pool is the sheet\'s Etiquette pool, wounds included', async () => {
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
    // Charisma 3, no Etiquette, a -1 wound: the sheet says 3 - 1 - 1 = 1,
    // where the raw defaulting would say 2
    const actor = {
      id: 'seller', name: 'Blessé',
      items: {
        get: id => (id === 'gun' ? gun : undefined)
      },
      system: {
        attributes: {
          charisma: {
            augmented: {
              value: 3
            }
          }
        },
        skills: {
          etiquette: {
            rating: {
              value: 0
            }, test: {
              dicePool: 1
            }
          },
          negotiation: {
            rating: {
              value: 0
            }, test: {
              dicePool: 1
            }
          },
        },
        limits: {
          socialLimit: {
            value: 4
          }
        },
      },
    }
    queue = [2]
    const card = await SR5ShopFence.sellOnMarket(actor, [{
      itemId: 'gun', quantity: 1
    }], {
      useAvailability: false
    })
    expect(card.searchPool).toBe(1)
    expect(rolls).toEqual(['1d6'])
  })

  it('a buyer found, but no die to haggle with: nothing rolled, nothing sold (SR5 p. 58)', async () => {
    const {
      SR5ShopFence
    } = await import('../modules/interface/shop-fence.js')
    // Threshold 1 so one hit finds a buyer, and a buyer who rolls no die:
    // haggling on zero dice would tie and sell at the base 25 %
    const table = {
      sr5ShopFenceThreshold: 1, sr5ShopFenceBuyerPool: 0
    }
    const settings = globalThis.game.settings.get
    globalThis.game.settings.get = (_scope, key) => (key in table ? table[key] :
      (/^sr5Shop(Fence|Contact)/.test(key) ? undefined : 25))
    const gun = {
      id: 'gun', name: 'Ares Predator V', system: {
        price: {
          value: 725
        }, quantity: 1
      }
    }
    // Charisma 1, Etiquette 1, no Negotiation: defaulting leaves 0
    const actor = {
      id: 'seller', name: 'Charisme 1',
      items: {
        get: id => (id === 'gun' ? gun : undefined)
      },
      system: {
        attributes: {
          charisma: {
            augmented: {
              value: 1
            }
          }
        },
        skills: {
          etiquette: {
            rating: {
              value: 1
            }, test: {
              dicePool: 2
            }
          },
          negotiation: {
            rating: {
              value: 0
            }, test: {
              dicePool: 0
            }
          },
        },
        limits: {
          socialLimit: {
            value: 2
          }
        },
      },
    }
    try {
      queue = [5, 2]
      const card = await SR5ShopFence.sellOnMarket(actor, [{
        itemId: 'gun', quantity: 1
      }], {
        useAvailability: false
      })
      expect(card.searchFailed).toBe(false)
      expect(card.canSell).toBe(false)
      expect(card.total).toBe(0)
      expect(rolls).toEqual(['2d6'])
      expect(card.haggleImpossible).toBe(true)
    } finally {
      globalThis.game.settings.get = settings
    }
  })
})
