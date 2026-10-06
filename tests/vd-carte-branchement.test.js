import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Apollinaire's review of the lot "VD des cartes" (06/10): every roll that reads a player's card must stop when the
// card is refused, and roll with what was read again, never with the card's own values. The reading itself is tested in
// attack-card.test.js and matrix-card.test.js; here it is driven, to test the wiring of each roll

const attackCard = {
  trustedAttackCard: vi.fn(),
  trustedResistanceCard: vi.fn(),
}
const matrixCard = {
  trustedMatrixAction: vi.fn(),
  trustedComplexForm: vi.fn(),
  cardStandsFor: vi.fn(),
  tellMatrixCard: vi.fn(async () => {}),
}
vi.mock('../modules/rolls/roll-helpers/attack-card.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original, trustedAttackCard: (...a) => attackCard.trustedAttackCard(...a), trustedResistanceCard: (...a) => attackCard.trustedResistanceCard(...a),
  }
})
vi.mock('../modules/rolls/roll-helpers/matrix-card.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    trustedMatrixAction: (...a) => matrixCard.trustedMatrixAction(...a),
    trustedComplexForm: (...a) => matrixCard.trustedComplexForm(...a),
    cardStandsFor: (...a) => matrixCard.cardStandsFor(...a),
    tellMatrixCard: (...a) => matrixCard.tellMatrixCard(...a),
  }
})

const {
  default: defense
} = await import('../modules/rolls/roll-prepare-case/rollData-Defense.js')
const {
  default: rammingDefense
} = await import('../modules/rolls/roll-prepare-case/rollData-RammingDefense.js')
const {
  default: resistance
} = await import('../modules/rolls/roll-prepare-case/rollData-Resistance.js')
const {
  default: matrixDefense
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixDefense.js')
const {
  default: matrixResistance
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixResistance.js')
const {
  default: complexFormDefense
} = await import('../modules/rolls/roll-prepare-case/rollData-ComplexFormDefense.js')

const pool = (value = 0) => ({
  base: 0, value, dicePool: value, modifiers: []
})

function rollData() {
  return {
    test: {
    }, dicePool: {
      modifiers: []
    }, limit: {
      modifiers: {
      }
    }, combat: {
      activeDefenses: {
      }, firingMode: {
      }, ammo: {
      }, calledShot: {
      }
    }, previousMessage: {
    }, damage: {
      matrix: {
      }, toxin: {
      }
    }, target: {
    }, dialogSwitch: {
    }, magic: {
      spell: {
      }
    }, matrix: {
    }, owner: {
    }, threshold: {
    }, various: {
    }
  }
}

function attack(over = {
}) {
  return {
    test: {
      type: 'attack', typeSub: 'rangedWeapon'
    },
    owner: {
      actorId: 'pc', messageId: 'm1', itemUuid: 'Actor.pc.Item.cf'
    },
    roll: {
      hits: 30
    },
    damage: {
      value: 50, base: 50, type: 'physical', element: '', source: '', toxin: {
      }, matrix: {
        value: 50
      }, resistanceType: 'physicalDamage'
    },
    combat: {
      armorPenetration: -40, calledShot: {
      }, firingMode: {
      }, ammo: {
      }, grenade: {
      }, choke: {
      }
    },
    target: {
    },
    magic: {
      spell: {
      }
    },
    matrix: {
      actionType: 'attack'
    },
    various: {
      defenseFirstAttribute: 'willpower', defenseSecondAttribute: 'firewall'
    },
    previousMessage: {
    },
    ...over,
  }
}

function defender(type = 'actorPc') {
  return {
    type, name: 'PNJ', items: [], getFlag: () => undefined, setFlag: () => {},
    system: {
      defenses: {
        defend: {
          modifiers: []
        }
      },
      specialProperties: {
        fullDefenseValue: 0, hardenedArmors: {
          normalWeapon: {
            value: 0
          }
        }
      },
      skills: {
      },
      limits: {
        physicalLimit: {
          value: 5, modifiers: []
        }
      },
      visions: {
        astral: {
          isActive: false
        }, lowLight: {
          isActive: false
        }
      },
      itemsProperties: {
        armor: {
          value: 9
        }, environmentalMod: {
          visibility: pool(), light: pool(), glare: pool(), wind: pool()
        }
      },
      resistances: {
        physicalDamage: {
          modifiers: [], dicePool: 9
        }
      },
      attributes: {
        willpower: {
          augmented: {
            value: 4
          }
        }
      },
      matrix: {
        deviceRating: 3,
        attributes: {
          firewall: {
            value: 5
          }
        },
        actions: {
          dataSpike: {
            defense: pool(5)
          }
        },
        resistances: {
          matrixDamage: {
            modifiers: [], dicePool: 8
          }
        },
      },
    },
  }
}

beforeEach(() => {
  for (const fn of [...Object.values(attackCard), ...Object.values(matrixCard)]) fn.mockReset()
  matrixCard.tellMatrixCard.mockImplementation(async () => {})
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.fromUuid = vi.fn(async () => ({
    name: 'Pic de résonance', system: {
      systemEffects: [], customEffects: {
      }, itemEffects: {
      }
    }
  }))
  game.scenes = new Map()
})

describe('defense()', () => {
  it('stops when the attack card is refused', async () => {
    attackCard.trustedAttackCard.mockResolvedValue(null)
    expect(await defense(rollData(), defender(), attack())).toBeUndefined()
  })
  it('defends against what was read again, not the card', async () => {
    attackCard.trustedAttackCard.mockImplementation(async card => ({
      ...card, roll: {
        hits: 4
      }, damage: {
        ...card.damage, value: 8, base: 8
      }, combat: {
        ...card.combat, armorPenetration: -1
      }
    }))
    const data = await defense(rollData(), defender(), attack())
    expect(data.previousMessage.hits).toBe(4)
    expect(data.damage.value).toBe(8)
    expect(data.combat.armorPenetration).toBe(-1)
  })
})

describe('rammingDefense()', () => {
  it('stops when the ramming card is refused', async () => {
    attackCard.trustedAttackCard.mockResolvedValue(null)
    expect(await rammingDefense(rollData(), defender(), attack({
      test: {
        type: 'ramming'
      }
    }))).toBeUndefined()
  })
  it('defends against what was read again', async () => {
    attackCard.trustedAttackCard.mockImplementation(async card => ({
      ...card, roll: {
        hits: 3
      }, damage: {
        ...card.damage, value: 6, base: 6
      }, combat: {
        ...card.combat, armorPenetration: -6
      }
    }))
    const data = rollData()
    await rammingDefense(data, defender(), attack({
      test: {
        type: 'ramming'
      }
    }))
    expect(data.previousMessage.hits).toBe(3)
    expect(data.damage.base).toBe(6)
    expect(data.combat.armorPenetration).toBe(-6)
  })
})

describe('resistance()', () => {
  it('stops when an attack card resisted without defense is refused', async () => {
    attackCard.trustedAttackCard.mockResolvedValue(null)
    expect(await resistance(rollData(), 'resistanceCard', defender(), attack())).toBeUndefined()
  })
  it('stops when any other card does not stand for the resister (whitelist, D1)', async () => {
    attackCard.trustedResistanceCard.mockResolvedValue(false)
    expect(await resistance(rollData(), 'resistanceCard', defender(), attack({
      test: {
        type: 'falseTest'
      }
    }))).toBeUndefined()
    expect(attackCard.trustedResistanceCard).toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.ResistanceCardRefused')
  })
  it('resists the DV read again', async () => {
    attackCard.trustedAttackCard.mockImplementation(async card => ({
      ...card, roll: {
        hits: 2
      }, damage: {
        ...card.damage, value: 7, base: 7
      }, combat: {
        ...card.combat, armorPenetration: -2
      }
    }))
    const data = await resistance(rollData(), 'resistanceCard', defender(), attack())
    expect(data.damage.base).toBe(7)
    expect(data.combat.armorPenetration).toBe(-2)
    expect(data.previousMessage.hits).toBe(2)
  })
})

describe('matrixDefense()', () => {
  it('stops when the hacker card is refused', async () => {
    matrixCard.trustedMatrixAction.mockResolvedValue(null)
    expect(await matrixDefense(rollData(), 'dataSpike', defender(), attack({
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }
    }))).toBeUndefined()
  })
  it('defends against the hits and action type read again', async () => {
    matrixCard.trustedMatrixAction.mockResolvedValue({
      hits: 5, actionType: 'attack', card: {
      }
    })
    const data = await matrixDefense(rollData(), 'dataSpike', defender(), attack({
      test: {
        type: 'matrixAction', typeSub: 'dataSpike'
      }, matrix: {
        actionType: 'sleaze'
      }
    }))
    expect(data.previousMessage.hits).toBe(5)
    expect(data.matrix.actionType).toBe('attack')
  })
})

describe('matrixResistance()', () => {
  it('stops when the card does not stand for the resister', async () => {
    matrixCard.cardStandsFor.mockResolvedValue(false)
    expect(await matrixResistance(rollData(), defender(), attack({
      test: {
        type: 'matrixDefense'
      }
    }))).toBeUndefined()
  })
  it('stops when a DSP grenade card is refused, and resists what was read again', async () => {
    attackCard.trustedAttackCard.mockResolvedValue(null)
    expect(await matrixResistance(rollData(), defender(), attack())).toBeUndefined()
    attackCard.trustedAttackCard.mockImplementation(async card => ({
      ...card, damage: {
        ...card.damage, value: 4, matrix: {
          value: 50
        }
      }
    }))
    const data = await matrixResistance(rollData(), defender(), attack())
    expect(data.damage.matrix.base).toBe(4)
  })
})

describe('complexFormDefense()', () => {
  it('stops when the technomancer card is refused', async () => {
    matrixCard.trustedComplexForm.mockResolvedValue(null)
    expect(await complexFormDefense(rollData(), defender(), attack({
      test: {
        type: 'complexForm', typeSub: 'resonanceSpike'
      }
    }))).toBeUndefined()
  })
  it('defends against the hits, sub type and defense read on the form', async () => {
    matrixCard.trustedComplexForm.mockResolvedValue({
      hits: 3, typeSub: '', defenseFirstAttribute: 'willpower', defenseSecondAttribute: 'firewall', item: {
        uuid: 'Actor.pc.Item.cf'
      }, card: {
      }
    })
    const data = await complexFormDefense(rollData(), defender(), attack({
      test: {
        type: 'complexForm', typeSub: 'resonanceSpike'
      }, various: {
        defenseFirstAttribute: 'body', defenseSecondAttribute: 'firewall'
      }
    }))
    expect(data.previousMessage.hits).toBe(3)
    expect(data.test.typeSub).toBe('')
  })
})
