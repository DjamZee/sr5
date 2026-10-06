import {
  describe, it, expect
} from 'vitest'

// Security lot "VD des cartes d'attaque" (Honoré's finding, 06/10): the defense and the resistance read the attack card
// again, its damage worked out on the attacker's item, its hits counted again on the dice within the sheet's pool

const {
  weaponAttackDamage, spellAttackDamage, spellForceCap, vettedHits, vettedRamming, vetAttackCard, attackFamily, chokeDamageReduction,
} = await import('../modules/rolls/roll-helpers/attack-card.js')

const dice = (...results) => JSON.stringify({
  terms: [{
    results: results.map(result => ({
      result, active: true
    }))
  }]
})

const rifle = {
  damageValue: {
    value: 10
  }, armorPenetration: {
    value: -2, base: -2
  }, damageType: 'physical', damageElement: '', weaponSkill: {
    dicePool: 8
  }, ammunition: {
    type: ''
  }, systemEffects: [],
}
const grenade = {
  damageValue: {
    value: 16
  }, armorPenetration: {
    value: -2, base: -2
  }, damageType: 'physical', damageElement: '', weaponSkill: {
    dicePool: 6
  }, ammunition: {
    type: ''
  }, systemEffects: [], blast: {
    damageFallOff: -2
  },
}
const shooter = {
  specialAttributes: {
    edge: {
      augmented: {
        value: 2
      }
    }, magic: {
      augmented: {
        value: 5
      }
    }
  },
  specialProperties: {
  },
  magic: {
    masteries: {
    }
  },
  skills: {
    spellcasting: {
      spellCategory: {
        combat: {
          dicePool: 10
        }
      }
    }
  },
}

function actorWith(items, system = shooter, type = 'actorPc') {
  const map = new Map(items.map(i => [i.id, i]))
  return {
    id: 'pc', uuid: 'Actor.pc', name: 'Clo', type, system, items: {
      get: id => map.get(id), find: fn => items.find(fn)
    }
  }
}

function cardOfFor(roller, {
  byGM = false, roll = dice(6, 6, 5, 1, 2), data = {
  }
} = {
}) {
  return () => ({
    id: 'm1', roller, byGM, author: {
      name: byGM ? 'MJ' : 'Clo'
    }, data: {
      roll: {
        r: roll
      }, ...data
    }
  })
}

function attackCard(over = {
}) {
  return foundry.utils.deepClone({
    test: {
      type: 'attack', typeSub: 'rangedWeapon'
    },
    owner: {
      actorId: 'pc', itemId: 'w1', messageId: 'm1'
    },
    roll: {
      hits: 3
    },
    damage: {
      base: 10, value: 10, type: 'physical', element: '', source: '', toxin: {
      }
    },
    combat: {
      armorPenetration: -2, calledShot: {
        name: ''
      }, choke: {
        selected: ''
      }, firingMode: {
        selected: 'SA'
      }, grenade: {
        isGrenade: false, damageFallOff: 0
      }
    },
    magic: {
      force: 0, spell: {
      }
    },
    target: {
      range: 'short'
    },
    ...over,
  })
}

describe('weaponAttackDamage', () => {
  it('reads the DV, AP and type on the weapon (SR5 p. 171-173)', () => {
    const d = weaponAttackDamage(rifle, shooter, {
    })
    expect(d).toMatchObject({
      base: 10, ap: -2, type: 'physical', element: '', source: ''
    })
  })
  it('adds the called shots the dialog adds, and nothing else', () => {
    expect(weaponAttackDamage(rifle, shooter, {
      calledShot: 'vitals'
    }).base).toBe(12)
    expect(weaponAttackDamage(rifle, shooter, {
      calledShot: 'harderKnock'
    }).type).toBe('physical')
    expect(weaponAttackDamage(rifle, shooter, {
      calledShot: 'bullsEye', firingMode: 'BF'
    }).ap).toBe(-8)
  })
  it('takes the spread of a choke and the second target of Through and Into off', () => {
    expect(chokeDamageReduction('wide', 'medium')).toBe(5)
    expect(weaponAttackDamage(rifle, shooter, {
      choke: 'medium', range: 'short', secondTarget: true
    }).base).toBe(8)
  })
  it('adds Magic and the element of an energy aura (SR5 p. 397)', () => {
    const d = weaponAttackDamage(rifle, {
      ...shooter, specialProperties: {
        energyAura: 'fire'
      }
    }, {
    })
    expect(d).toMatchObject({
      base: 15, ap: -5, element: 'fire', type: 'physical'
    })
  })
  it('reads anti-vehicle rounds only against a drone', () => {
    const av = {
      ...rifle, ammunition: {
        type: 'av'
      }
    }
    expect(weaponAttackDamage(av, shooter, {
    }).ap).toBe(-2)
    expect(weaponAttackDamage(av, shooter, {
      targetIsDrone: true
    }).ap).toBe(-6)
  })
  it('lets the attacker pick the type only when the weapon has none', () => {
    expect(weaponAttackDamage({
      ...rifle, damageType: ''
    }, shooter, {
      chosenType: 'stun'
    }).type).toBe('stun')
    expect(weaponAttackDamage(rifle, shooter, {
      chosenType: 'stun'
    }).type).toBe('physical')
    expect(weaponAttackDamage({
      ...rifle, damageType: ''
    }, shooter, {
      chosenType: 'nuclear'
    }).type).toBe('physical')
  })
})

describe('spells', () => {
  it('caps the Force at Magic x 2 (SR5 p. 281)', () => {
    expect(spellForceCap(5)).toBe(10)
  })
  it('works out an indirect spell from its Force, a direct one from its hits (SR5 p. 283-284)', () => {
    expect(spellAttackDamage({
      indirect: true, force: 6, bonus: 1
    })).toEqual({
      base: 7, value: 7, ap: -6
    })
    expect(spellAttackDamage({
      indirect: false, hits: 4, bonus: 1
    })).toEqual({
      base: 5, value: 5, ap: 0
    })
  })
})

describe('vettedHits', () => {
  it('takes a GM card as written', () => {
    expect(vettedHits({
      byGM: true, claimed: 9, rollJSON: null, pool: 0
    })).toBe(9)
  })
  it('counts a player card again within the pool, never above what it announces', () => {
    expect(vettedHits({
      byGM: false, claimed: 20, rollJSON: dice(6, 6, 6, 6, 6, 6, 6, 6), pool: 3
    })).toBe(3)
    expect(vettedHits({
      byGM: false, claimed: 1, rollJSON: dice(6, 6, 6), pool: 3
    })).toBe(1)
    expect(vettedHits({
      byGM: false, claimed: 5, rollJSON: null, pool: 3
    })).toBe(0)
  })
})

describe('vettedRamming', () => {
  it('bounds the speeds by the sheets and keeps the driver choices', () => {
    const r = vettedRamming({
      angle: 'front', gait: 'run', attackerSpeed: 50, targetSpeed: 40, relativeSpeed: 9999
    }, {
      attackerSpeed: 3, attackerLocomotion: 'ground', targetIsVehicle: true, targetSpeed: 2, targetLocomotion: 'ground',
      metersPerTurn: (s, g) => (g === 'run' ? 10 : 5) * 2 ** (s - 1),
    })
    expect(r).toMatchObject({
      angle: 'front', gait: 'run', attackerSpeed: 3, targetSpeed: 2, relativeSpeed: 40
    })
  })
})

describe('vetAttackCard', () => {
  const weapon = {
    id: 'w1', name: 'Fusil', type: 'itemWeapon', system: rifle
  }
  const roller = actorWith([weapon])

  it('tells the families apart', () => {
    expect(attackFamily({
      test: {
        type: 'attack'
      }
    })).toBe('weapon')
    expect(attackFamily({
      test: {
        type: 'skillDicePool', typeSub: 'astralCombat'
      }
    })).toBe('astral')
    expect(attackFamily({
      test: {
        type: 'defense'
      }
    })).toBe(null)
  })

  it('refuses a card no GM nor owner of the attacker wrote', async () => {
    expect(await vetAttackCard(attackCard(), {
      messageId: 'm1', helpers: {
        cardOf: () => null
      }
    })).toBe(null)
  })

  it('refuses a card whose weapon is not on the attacker', async () => {
    expect(await vetAttackCard(attackCard({
      owner: {
        actorId: 'pc', itemId: 'other'
      }
    }), {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(roller, {
          data: {
            test: {
              type: 'attack'
            }, owner: {
              itemId: 'other'
            }
          }
        })
      }
    })).toBe(null)
  })

  it('leaves a GM card as written', async () => {
    const card = attackCard({
      damage: {
        base: 50, value: 50, type: 'physical'
      }
    })
    const r = await vetAttackCard(card, {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(roller, {
          byGM: true, data: {
            test: {
              type: 'attack'
            }
          }
        })
      }
    })
    expect(r.data).toBe(card)
    expect(r.mismatches).toEqual([])
  })

  it('changes nothing on an honest card', async () => {
    const r = await vetAttackCard(attackCard(), {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(roller, {
          data: {
            test: {
              type: 'attack'
            }, owner: {
              itemId: 'w1'
            }
          }
        })
      }
    })
    expect(r.mismatches).toEqual([])
    expect(r.data.damage.base).toBe(10)
    expect(r.data.roll.hits).toBe(3)
  })

  it('works a forged grenade out again on the grenade: DV, AP, blast and hits', async () => {
    const g = {
      id: 'w1', name: 'Grenade', type: 'itemWeapon', system: grenade
    }
    const card = attackCard({
      damage: {
        base: 50, value: 50, type: 'physical', element: 'fire', source: 'magical'
      },
      roll: {
        hits: 30
      },
    })
    card.combat.grenade = {
      isGrenade: true, damageFallOff: 5
    }
    card.combat.armorPenetration = -40
    const r = await vetAttackCard(card, {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(actorWith([g]), {
          roll: dice(6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6), data: {
            test: {
              type: 'attack'
            }, owner: {
              itemId: 'w1'
            }
          }
        })
      }
    })
    expect(r.data.damage).toMatchObject({
      base: 16, value: 16, element: '', source: ''
    })
    expect(r.data.combat.armorPenetration).toBe(-2)
    expect(r.data.combat.grenade.damageFallOff).toBe(-2)
    //pool 6 + Chance 2
    expect(r.data.roll.hits).toBe(8)
    expect(r.mismatches.map(m => m.key)).toEqual(expect.arrayContaining(['base', 'ap', 'element', 'source', 'hits', 'damageFallOff']))
  })

  it('caps a forged direct spell: DV from the hits counted again (SR5 p. 283)', async () => {
    const spell = {
      id: 's1', name: 'Éclair mana', type: 'itemSpell', system: {
        category: 'combat', subCategory: 'direct', damageType: 'physical', damageElement: ''
      }
    }
    const card = attackCard({
      test: {
        type: 'spell', typeSub: 'direct'
      }, owner: {
        actorId: 'pc', itemId: 's1'
      },
      roll: {
        hits: 40
      }, damage: {
        base: 0, value: 40, type: 'physical'
      },
      magic: {
        force: 30, spell: {
          damageBonus: 0
        }
      },
    })
    const r = await vetAttackCard(card, {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(actorWith([spell]), {
          roll: dice(5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5), data: {
            test: {
              type: 'spell'
            }, owner: {
              itemId: 's1'
            }
          }
        })
      }
    })
    //pool 10 + Chance 2
    expect(r.data.roll.hits).toBe(12)
    expect(r.data.damage.value).toBe(12)
    expect(r.data.magic.force).toBe(10)
    expect(r.direct).toBe(true)
  })

  it('works a ramming out again with the speeds of the sheets (await of the lookup, measured in game)', async () => {
    const drone = {
      ...actorWith([], {
        ...shooter, rammingTest: {
          test: {
            dicePool: 4
          }
        }
      }, 'actorDrone')
    }
    const card = attackCard({
      test: {
        type: 'ramming', typeSub: ''
      }, damage: {
        base: 60, value: 60, type: 'physical'
      }, roll: {
        hits: 25
      },
    })
    card.combat.armorPenetration = -30
    card.combat.ramming = {
      attackerSpeed: 12, relativeSpeed: 99999
    }
    const r = await vetAttackCard(card, {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(drone, {
          data: {
            test: {
              type: 'ramming'
            }
          }
        }),
        ramming: async (roller, defender, ramming) => ({
          ramming: {
            ...ramming, attackerSpeed: 3, relativeSpeed: 20
          }, base: 6
        }),
      }
    })
    expect(r.data.damage.base).toBe(6)
    expect(r.data.combat.armorPenetration).toBe(-6)
    expect(r.data.combat.ramming.relativeSpeed).toBe(20)
    //the three hits its dice show
    expect(r.data.roll.hits).toBe(3)
  })

  it('caps the Force of an indirect spell at Magic x 2 (SR5 p. 281)', async () => {
    const spell = {
      id: 's1', name: 'Boule de feu', type: 'itemSpell', system: {
        category: 'combat', subCategory: 'indirect', damageType: 'physical', damageElement: 'fire'
      }
    }
    const card = attackCard({
      test: {
        type: 'spell', typeSub: 'indirect'
      }, owner: {
        actorId: 'pc', itemId: 's1'
      },
      damage: {
        base: 25, value: 25, type: 'physical', element: 'fire', source: 'magical'
      },
      magic: {
        force: 25, spell: {
        }
      },
    })
    card.combat.armorPenetration = -25
    const r = await vetAttackCard(card, {
      messageId: 'm1', helpers: {
        cardOf: cardOfFor(actorWith([spell]), {
          data: {
            test: {
              type: 'spell'
            }, owner: {
              itemId: 's1'
            }
          }
        })
      }
    })
    expect(r.data.damage.base).toBe(10)
    expect(r.data.combat.armorPenetration).toBe(-10)
  })
})
