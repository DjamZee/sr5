import {
  describe, it, expect, vi
} from 'vitest'

// The card a player's attack writes, and the DV the GM works out again from the weapon (attack-card.js), must agree
// on the rules of weapon-attack-rules.js: energy aura (SR5 p. 397), Hit 'em Where It Counts (Run & Gun p. 131),
// laser weapons (Run & Gun p. 64). A gap would be shown to the GM as a forged card, and the GM's value would win.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (testType, actionType, label) => ({
      testType, actionType, label
    }),
    updateChatButtonHelper: vi.fn(),
  },
}))

globalThis.game ??= {
}
globalThis.game.i18n ??= {
  localize: k => k
}

const {
  default: attackInfo
} = await import('../modules/rolls/roll-test-case/test-Attack.js')
const {
  weaponAttackDamage, laserVisibility, vetAttackCard
} = await import('../modules/rolls/roll-helpers/attack-card.js')
const {
  energyAuraApplies, jugularToxin, laserDamageReduction
} = await import('../modules/rolls/roll-helpers/weapon-attack-rules.js')
const {
  redDotSightBonus, redDotSightWorks, nonCumulativeAccessoryAccuracy
} = await import('../modules/entities/items/weapon-accessory-rules.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')

const weapon = (category, over = {
}) => ({
  category, damageValue: {
    value: 5
  }, armorPenetration: {
    value: -1, base: -1
  }, damageType: 'physical', damageElement: '', ammunition: {
    type: ''
  }, systemEffects: [], accessory: [], ...over,
})
const shooter = (over = {
}) => ({
  specialAttributes: {
    magic: {
      augmented: {
        value: 4
      }
    }
  }, specialProperties: {
  }, ...over,
})
const aura = shooter({
  specialProperties: {
    energyAura: 'fire'
  }
})

// What the attacker's side puts on the card: rollData-Weapon.js (aura), the roll dialog (called shot, laser
// reduction for the range picked) and test-Attack.js (reduction taken off)
async function card(w, actor, {
  calledShot = '', range = 'short', visibility = 0
} = {
}) {
  const magic = actor.specialAttributes.magic.augmented.value
  let base = w.damageValue.value
  if (actor.specialProperties.energyAura && energyAuraApplies(w.category)) base += magic
  const toxin = w.damageElement === 'toxin' ? (calledShot === 'hitEmWhereItCounts' ? jugularToxin(w.toxin) : {
    ...w.toxin
  }) : null
  const isLaser = w.accessory.some(a => a.name === 'laserWeapon')
  const data = {
    test: {
      typeSub: w.category
    }, roll: {
      hits: 1
    }, chatCard: {
      buttons: {
      }
    }, damage: {
      base, value: base, toxin
    }, combat: {
      choke: {
        damageModify: 0
      }, laser: {
        isLaser, damageModify: isLaser ? laserDamageReduction(range, visibility) : 0, visibility
      }, environmentalColumns: [visibility, 0, 0]
    }, target: {
      range
    },
  }
  await attackInfo(data)
  return data
}
const gm = (w, actor, cardData, calledShot = '') => weaponAttackDamage(w, actor, {
  calledShot, range: cardData.target.range, visibility: laserVisibility(cardData, null),
})

describe('Card and GM agree', () => {
  it('energy aura on a melee attack: Magic added on both sides', async () => {
    const knife = weapon('meleeWeapon')
    const c = await card(knife, aura)
    expect(c.damage.base).toBe(9)
    expect(gm(knife, aura, c).base).toBe(c.damage.base)
  })

  it('energy aura and a ranged attack: nothing added on either side', async () => {
    const pistol = weapon('rangedWeapon')
    const c = await card(pistol, aura)
    expect(c.damage.base).toBe(5)
    const d = gm(pistol, aura, c)
    expect(d.base).toBe(c.damage.base)
    expect(d.ap).toBe(-1)
    expect(d.element).toBe('')
  })

  it("Hit 'em Where It Counts: same toxin Power, DV unchanged", async () => {
    const dart = weapon('rangedWeapon', {
      damageValue: {
        value: 3
      }, damageElement: 'toxin', toxin: {
        power: 15, speed: 1
      }
    })
    const c = await card(dart, shooter(), {
      calledShot: 'hitEmWhereItCounts'
    })
    const d = gm(dart, shooter(), c, 'hitEmWhereItCounts')
    expect(c.damage.base).toBe(3)
    expect(d.base).toBe(3)
    expect(d.toxin.power).toBe(17)
    expect(c.damage.toxin.power).toBe(d.toxin.power)
    expect(c.damage.toxin.speed).toBe(d.toxin.speed)
  })

  it('laser weapon at each range band, clear air and moderate fog', async () => {
    const redline = weapon('rangedWeapon', {
      accessory: [{
        name: 'laserWeapon', isActive: true
      }]
    })
    const expected = {
      short: 5, medium: 4, long: 3, extreme: 2
    }
    for (const [range, dv] of Object.entries(expected)) {
      const c = await card(redline, shooter(), {
        range
      })
      expect(c.damage.base).toBe(dv)
      expect(gm(redline, shooter(), c).base).toBe(c.damage.base)
      const fog = await card(redline, shooter(), {
        range, visibility: 2
      })
      expect(fog.damage.base).toBe(Math.max(0, dv - 2))
      expect(gm(redline, shooter(), fog).base).toBe(fog.damage.base)
    }
  })

  it('a card cannot claim clearer air than its scene', () => {
    const scenes = {
      get: () => ({
        getFlag: () => 2
      })
    }
    expect(laserVisibility({
      combat: {
        laser: {
          visibility: 0
        }
      }, target: {
        sceneId: 'S'
      }
    }, scenes)).toBe(2)
    expect(laserVisibility({
      combat: {
        laser: {
          visibility: 3
        }
      }, target: {
        sceneId: 'S'
      }
    }, scenes)).toBe(3)
  })

  it("laser: the air's visibility counts, not what a thermographic shooter sees (Run & Gun p. 64)", async () => {
    //Moderate fog (row 2) on the scene; the shooter's thermographic vision takes a row off her own penalty
    const fogScene = {
      id: 'S', getFlag: (_m, key) => (key === 'environModVisibility' ? 2 : 0)
    }
    const thermoShooter = {
      items: [], system: shooter()
    }
    const air = SR5_CombatHelpers.airVisibilityRow(fogScene, thermoShooter, {
      visibility: 0
    })
    expect(air).toBe(2)
    const redline = weapon('rangedWeapon', {
      damageValue: {
        value: 9
      }, accessory: [{
        name: 'laserWeapon', isActive: true
      }]
    })
    const c = await card(redline, shooter(), {
      range: 'medium', visibility: air
    })
    expect(c.damage.base).toBe(6)
    const d = weaponAttackDamage(redline, shooter(), {
      range: 'medium', visibility: laserVisibility({
        ...c, target: {
          ...c.target, sceneId: 'S'
        }
      }, {
        get: () => fogScene
      })
    })
    expect(d.base).toBe(c.damage.base)
  })

  it('laser: a smoke template the shooter stands in thickens the air', () => {
    const smoke = {
      type: 'itemEffect', system: {
        type: 'areaEffect', ownerItem: 'Scene.S.MeasuredTemplate.t1', customEffects: [{
          target: 'system.itemsProperties.environmentalMod.visibility', value: 2
        }]
      }, flags: {
      }
    }
    const scene = {
      id: 'S', getFlag: () => 0
    }
    expect(SR5_CombatHelpers.airVisibilityRow(scene, {
      items: [smoke]
    }, {
      visibility: 1
    })).toBe(3)
  })
})

// Red dot sight (Street Lethal p. 49): the GM counts the hits again within the pool and the limit of the sheet, plus
// what the sight adds at the range of the card, as the roll dialog adds it (Côme's review: a fair shot was flagged)
describe('Red dot sight: card and GM count the same hits', () => {
  const sight = {
    _id: 'rd', name: 'Viseur point rouge', isActive: true, system: {
      itemEffects: [], weaponAccessory: {
        specialEffect: ''
      }
    }
  }
  const rifleData = {
    category: 'rangedWeapon', isActive: true, damageValue: {
      value: 8
    }, armorPenetration: {
      value: -1, base: -1
    }, damageType: 'physical', damageElement: '', ammunition: {
      type: ''
    }, systemEffects: [], accessory: [sight], weaponSkill: {
      dicePool: 4
    }, accuracy: {
      value: 2, modifiers: []
    },
  }
  const rifle = {
    id: 'w1', name: 'Warhawk', type: 'itemWeapon', system: rifleData
  }
  const roller = {
    id: 'pc', uuid: 'Actor.pc', name: 'Clo', type: 'actorPc', system: {
      ...shooter(), specialAttributes: {
        magic: {
          augmented: {
            value: 0
          }
        }, edge: {
          augmented: {
            value: 0
          }
        }
      }
    },
    items: {
      get: id => (id === 'w1' ? rifle : null), find: fn => [rifle].find(fn)
    },
    testUserPermission: () => true,
  }
  const dice = results => JSON.stringify({
    terms: [{
      results: results.map(result => ({
        result, active: true
      }))
    }]
  })
  // What the dialog puts on the roll: the sheet's pool and Accuracy, plus the sight at that range
  const dialog = range => {
    const bonus = redDotSightBonus(range)
    const works = redDotSightWorks(rifleData, false)
    return {
      pool: 4 + (works ? bonus.dice : 0), limit: 2 + (works ? Math.max(0, bonus.accuracy - nonCumulativeAccessoryAccuracy(rifleData)) : 0)
    }
  }

  for (const range of ['short', 'medium', 'long', 'extreme']) {
    it(`same hits at ${range} range, every die a hit`, async () => {
      const {
        pool, limit
      } = dialog(range)
      const hits = Math.min(pool, limit)
      const chatData = {
        test: {
          type: 'attack', typeSub: 'rangedWeapon'
        }, owner: {
          actorId: 'pc', itemId: 'w1', messageId: 'm1'
        }, roll: {
          hits
        }, damage: {
          base: 8, value: 8, type: 'physical', element: '', source: ''
        }, combat: {
          armorPenetration: -1, calledShot: {
            name: ''
          }, choke: {
            selected: ''
          }, firingMode: {
            selected: 'SA'
          }, grenade: {
            isGrenade: false
          }
        }, target: {
          range
        }, magic: {
          spell: {
          }
        },
      }
      const r = await vetAttackCard(chatData, {
        messageId: 'm1', helpers: {
          cardOf: () => ({
            id: 'm1', roller, byGM: false, author: {
              name: 'Clo'
            }, data: {
              ...chatData, roll: {
                hits, r: dice(Array(pool).fill(6))
              }
            }
          })
        }
      })
      expect(r.data.roll.hits).toBe(hits)
      expect(r.mismatches).toEqual([])
      expect(r.overPool).toBe(null)
    })
  }

  it('the last die of the pool counts at short range (Côme: 12th die)', () => {
    expect(dialog('short')).toEqual({
      pool: 5, limit: 3
    })
    expect(dialog('long')).toEqual({
      pool: 4, limit: 2
    })
  })
})

