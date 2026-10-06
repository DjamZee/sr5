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
  weaponAttackDamage, laserVisibility
} = await import('../modules/rolls/roll-helpers/attack-card.js')
const {
  energyAuraApplies, jugularToxin, laserDamageReduction
} = await import('../modules/rolls/roll-helpers/weapon-attack-rules.js')

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
        isLaser, damageModify: isLaser ? laserDamageReduction(range, visibility) : 0
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
        environmentalColumns: [0]
      }, target: {
        sceneId: 'S'
      }
    }, scenes)).toBe(2)
    expect(laserVisibility({
      combat: {
        environmentalColumns: [3]
      }, target: {
        sceneId: 'S'
      }
    }, scenes)).toBe(3)
  })
})
