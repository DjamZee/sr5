import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5_SpiritTypes
} = await import('../modules/entities/items/spirit-types.js')
const {
  SR5
} = await import('../modules/config.js')

// Every spirit gets Astral Combat, Assensing and Perception at its Force, but some extraplanar entities do not
// (Howling Shadows p. 130-155): no Astral Combat for the Anarch, the Blackjack, the two Chindi and Vucub Caquix,
// no Assensing for the two Chindi. Their type can say "none" for each of the three.

function spirit(type, force) {
  const skills = {
  }
  for (const key of Object.keys(SR5.skills)) skills[key] = {
    rating: {
      base: 0, modifiers: []
    },
    test: {
      base: 0, modifiers: []
    },
  }
  return {
    type: 'actorSpirit',
    system: {
      type, force: {
        value: force
      }, skills, magic: {
        tradition: ''
      }
    },
  }
}

function customType(key, system = {
}) {
  return {
    name: key,
    uuid: `Item.${key}`,
    type: 'itemSpiritType',
    system: {
      key, basedOn: '', skills: [], halfSkills: [], baseSkillsRatio: '', ...system
    },
  }
}

const BASE = ['astralCombat', 'assensing', 'perception']

describe('spirit types: "none" for a base skill', () => {
  beforeEach(() => {
    vi.spyOn(SR5_CharacterUtility, 'applyPenalty').mockImplementation(() => {})
    SR5_SpiritTypes._officialKeys = new Set(Object.keys(SR5.spiritTypes))
    SR5_SpiritTypes.registry = new Map()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    SR5_SpiritTypes.registry = new Map()
  })

  it('leaves the official spirits their three base skills at Force', () => {
    const actor = spirit('air', 5)
    SR5_CharacterUtility.generateSpiritSkills(actor)
    for (const key of BASE) expect(actor.system.skills[key].rating.value).toBe(5)
  })

  it('gives the official Anarch no Astral Combat, as its block (Howling Shadows p. 130)', () => {
    const actor = spirit('anarch', 5)
    SR5_CharacterUtility.generateSpiritSkills(actor)
    expect(actor.system.skills.astralCombat.rating.value ?? 0).toBe(0)
    expect(actor.system.skills.assensing.rating.value).toBe(5)
    expect(actor.system.skills.perception.rating.value).toBe(5)
  })

  it('leaves a custom type that says nothing its three base skills at Force', () => {
    SR5_SpiritTypes.registry.set('erinye', customType('erinye'))
    const actor = spirit('erinye', 6)
    SR5_CharacterUtility.generateSpiritSkills(actor)
    for (const key of BASE) expect(actor.system.skills[key].rating.value).toBe(6)
  })

  it('removes Astral Combat and Assensing from a Chindi, and keeps its Perception', () => {
    SR5_SpiritTypes.registry.set('chindi', customType('chindi', {
      noBaseSkills: ['astralCombat', 'assensing']
    }))
    const actor = spirit('chindi', 6)
    SR5_CharacterUtility.generateSpiritSkills(actor)
    expect(actor.system.skills.astralCombat.rating.value ?? 0).toBe(0)
    expect(actor.system.skills.assensing.rating.value ?? 0).toBe(0)
    expect(actor.system.skills.perception.rating.value).toBe(6)
  })

  it('wins over the ratio, and the type can still list the skill on purpose', () => {
    SR5_SpiritTypes.registry.set('blackjack', customType('blackjack', {
      baseSkillsRatio: 'half', noBaseSkills: ['astralCombat', 'perception'], skills: ['perception']
    }))
    const actor = spirit('blackjack', 5)
    SR5_CharacterUtility.generateSpiritSkills(actor)
    expect(actor.system.skills.astralCombat.rating.value ?? 0).toBe(0)
    expect(actor.system.skills.assensing.rating.value).toBe(3)
    expect(actor.system.skills.perception.rating.value).toBe(5)
  })

  it('ignores a key that is not one of the three', () => {
    expect(SR5_SpiritTypes.noBaseSkills(customType('x', {
      noBaseSkills: ['unarmedCombat', 'assensing']
    }))).toEqual(['assensing'])
    expect(SR5_SpiritTypes.noBaseSkills(customType('y'))).toEqual([])
  })
})
