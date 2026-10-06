import {
  describe, it, expect, vi
} from 'vitest'

// An agent uses the matrix attributes of the device it is loaded on, its own rating, and Computer,
// Hacking and Cybercombat equal to its rating (SR5 p. 248). Without a creator the whole computation
// was skipped: attributes and skills fell to 0 with the matrix attributes.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5
} = await import('../modules/config.js')

const value = () => ({
  base: 0, value: 0, modifiers: []
})
const pool = () => ({
  base: 0, dicePool: 0, modifiers: []
})

function agent(creatorData) {
  const attributes = {
  }, skills = {
  }, matrixAttributes = {
  }
  for (const key of Object.keys(SR5.characterAttributes)) attributes[key] = {
    augmented: {
      value: 0
    }
  }
  for (const key of Object.keys(SR5.agentSkills)) skills[key] = {
    rating: value(), test: pool()
  }
  for (const key of Object.keys(SR5.deckerAttributes)) matrixAttributes[key] = value()
  return {
    type: 'actorAgent',
    system: {
      rating: 4, creatorData, attributes, skills,
      matrix: {
        attributes: matrixAttributes, noise: value(), deviceRating: 0
      },
    },
  }
}

describe('agent without a creator (SR5 p. 248)', () => {
  it('keeps its rating for attributes and skills, with no matrix attributes', () => {
    const a = agent(undefined)
    SR5_CharacterUtility.generateAgentMatrix(a, {
      marks: [], markedItems: []
    })
    expect(a.system.attributes.logic.augmented.value).toBe(4)
    expect(a.system.skills.cybercombat.rating.value).toBe(4)
    expect(a.system.skills.cybercombat.test.dicePool).toBe(4)
    expect(a.system.matrix.attributes.attack.value).toBe(0)
  })

  it('takes the matrix attributes of its creator when it has one', () => {
    const a = agent({
      system: {
        matrix: {
          deviceRating: 5, userGrid: 'local', attributes: {
            attack: {
              value: 6
            }, dataProcessing: {
              value: 5
            }, firewall: {
              value: 4
            }, sleaze: {
              value: 3
            }
          }
        }
      }
    })
    SR5_CharacterUtility.generateAgentMatrix(a, {
      marks: [], markedItems: []
    })
    expect(a.system.matrix.attributes.attack.value).toBe(6)
    expect(a.system.matrix.deviceRating).toBe(5)
    expect(a.system.skills.hacking.rating.value).toBe(4)
  })
})
