import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  default: skill
} = await import('../modules/rolls/roll-prepare-case/rollData-Skill.js')

const mod = (source, type, value) => ({
  source, type, value
})
// A skill as the sheet prepares it, with a "[Limit] +2" bonus of its own:
// limit.value already holds the bonus (Social 5 + 2)
const skillWithBonus = limitType => ({
  linkedAttribute: 'charisma',
  rating: {
    value: 2
  },
  test: {
    modifiers: [mod('Attr', 'linkedAttribute', 4), mod('Skill', 'skillRating', 2)]
  },
  limit: {
    value: 7, base: limitType, modifiers: [mod('Qualité', 'quality', 2)]
  },
})
const actor = {
  id: 'actor', type: 'actorPc', name: 'Défenseuse', effects: [],
  system: {
    attributes: {
      charisma: {
        augmented: {
          value: 4
        }
      },
      willpower: {
        augmented: {
          value: 3
        }
      },
    },
    limits: {
      socialLimit: {
        value: 5
      }
    },
    skills: {
      intimidation: skillWithBonus('socialLimit'),
      performance: skillWithBonus('socialLimit'),
      negotiation: skillWithBonus('socialLimit'),
      con: skillWithBonus('socialLimit'),
      leadership: skillWithBonus('socialLimit'),
    },
  },
}
const rollData = () => ({
  test: {
  },
  dicePool: {
    composition: [], modifiers: []
  },
  limit: {
    modifiers: {
    }
  },
  threshold: {
    value: 0, type: null
  },
  combat: {
    actions: []
  },
  dialogSwitch: {
  },
  target: {
  },
  magic: {
  },
})
const limitOf = data => data.limit.base + Object.values(data.limit.modifiers).reduce((s, m) => s + m.value, 0)
const resist = typeSub => skill(rollData(), 'skillDicePool', typeSub, actor, {
  test: {
    isOpposed: true, typeSub
  },
  roll: {
    hits: 2
  },
})

describe('A skill limit bonus belongs to whoever uses the skill (SR5 p. 141-144)', () => {
  it.each(['intimidation', 'performance'])('%s resisted with Charisma + Willpower: no limit, no bonus left', async typeSub => {
    const data = await resist(typeSub)
    expect(data.limit.base).toBe(0)
    expect(data.limit.modifiers).toEqual({
    })
    expect(limitOf(data)).toBe(0)
  })

  it.each(['intimidation', 'performance'])('%s used by its owner keeps the bonus', async typeSub => {
    const data = await skill(rollData(), 'skillDicePool', typeSub, actor, null)
    expect(data.limit.base).toBe(5)
    expect(limitOf(data)).toBe(7)
  })

  it.each(['negotiation', 'con', 'leadership'])('%s resisted with the same skill keeps its limit bonus', async typeSub => {
    const data = await resist(typeSub)
    expect(data.limit.base).toBe(5)
    expect(limitOf(data)).toBe(7)
  })
})
