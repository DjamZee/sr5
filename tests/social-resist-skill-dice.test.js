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
// A skill as the sheet prepares it: an effect "+2 dice" of its own, and the
// wound penalty that every test of a wounded character carries
const skillWithBonus = () => ({
  linkedAttribute: 'charisma',
  rating: {
    value: 2
  },
  test: {
    modifiers: [
      mod('Attr', 'linkedAttribute', 4), mod('Skill', 'skillRating', 2),
      mod('Effet', 'itemEffect', 2), mod('Blessures', 'penaltycondition', -2),
    ]
  },
  limit: {
    value: 5, base: 'socialLimit', modifiers: []
  },
})
const actor = {
  id: 'actor', type: 'actorPc', name: 'Cible', effects: [],
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
      intimidation: skillWithBonus(),
      performance: skillWithBonus(),
      con: skillWithBonus(),
      negotiation: skillWithBonus(),
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
const resist = typeSub => skill(rollData(), 'skillDicePool', typeSub, actor, {
  test: {
    isOpposed: true, typeSub
  },
  roll: {
    hits: 2
  },
})
const types = data => data.dicePool.modifiers.map(m => m.type)

describe('A skill dice bonus belongs to whoever uses the skill (SR5 p. 141-144)', () => {
  it.each(['intimidation', 'performance'])('%s resisted with Charisma + Willpower: the skill bonus goes, the wound penalty stays', async typeSub => {
    const data = await resist(typeSub)
    expect(types(data)).toEqual(['penaltycondition'])
  })

  it.each(['intimidation', 'performance'])('%s used by its owner keeps its bonus', async typeSub => {
    const data = await skill(rollData(), 'skillDicePool', typeSub, actor, null)
    expect(types(data)).toEqual(['itemEffect', 'penaltycondition'])
  })

  it('con resisted with Con keeps its bonus, and its card says Opposed test (SR5 p. 143)', async () => {
    const data = await resist('con')
    expect(types(data)).toEqual(['itemEffect', 'penaltycondition'])
    expect(data.test.title.startsWith('SR5.OpposedTest')).toBe(true)
  })
})
