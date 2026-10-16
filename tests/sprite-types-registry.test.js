import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'fs'
import {
  SR5
} from '../modules/config.js'
import {
  spriteTypeDefinition, registerSpriteType, isBuiltInSpriteType, spriteTypeKeys, spriteSkills,
  spriteMatrixModifiers, spriteInitiativeDice, spriteGivenPowers, DEFAULT_INITIATIVE_DICE
} from '../modules/entities/actors/sprite-types.js'
import {
  SR5_CompendiumUtility
} from '../modules/entities/actors/utilityCompendium.js'

// The sprite types are a registry (lot « crochets techno » for the module technomancers-plus-sr5):
// the book's seven keep their values, a module adds its own without touching the system.

describe('the book types keep their values (SR5 p. 261, Kill Code p. 110)', () => {
  const book = {
    courier: [['computer', 'hacking'], {
      sleaze: 3, dataProcessing: 1, firewall: 2 
    }],
    crack: [['computer', 'hacking', 'electronicWarfare'], {
      sleaze: 3, dataProcessing: 2, firewall: 1 
    }],
    data: [['computer', 'electronicWarfare'], {
      attack: -1, dataProcessing: 4, firewall: 2 
    }],
    fault: [['computer', 'cybercombat', 'hacking'], {
      attack: 3, dataProcessing: 1, firewall: 2 
    }],
    machine: [['computer', 'electronicWarfare', 'hardware'], {
      attack: 1, dataProcessing: 3, firewall: 2 
    }],
    companion: [['computer', 'electronicWarfare'], {
      attack: -1, sleaze: 1, firewall: 4 
    }],
    generalist: [['computer', 'electronicWarfare', 'hacking'], {
      attack: 1, sleaze: 1, dataProcessing: 1, firewall: 1, initiative: 1 
    }],
  }
  for (const [type, [skills, matrix]] of Object.entries(book)) {
    it(type, () => {
      expect(spriteSkills(type)).toEqual(skills)
      expect(spriteMatrixModifiers(type)).toEqual(matrix)
      expect(spriteInitiativeDice(type)).toBe(4)
      expect(isBuiltInSpriteType(type)).toBe(true)
    })
  }
  it('every key of SR5.spriteTypes has a definition, and the other way round at start', () => {
    for (const key of Object.keys(SR5.spriteTypes)) expect(spriteTypeDefinition(key)).not.toBeNull()
    expect(spriteTypeKeys().slice(0, 7)).toEqual(Object.keys(book))
  })
})

describe('a module registers a type', () => {
  it('adds it to the registry and to the lists of the sheets', () => {
    const entry = registerSpriteType('tpHotspike', {
      label: 'TECHNOPLUS.SpriteHotspike', description: 'TECHNOPLUS.SpriteHotspikeDescription',
      skills: ['cybercombat', 'notASkill'], matrix: {
        attack: 2, sleaze: -1, firewall: -1, initiative: 3, luck: 9 
      },
      initiativeDice: 5, powers: ['Compendium.technomancers-plus-sr5.items.Item.abc', 7],
    })
    expect(entry.skills).toEqual(['cybercombat'])
    expect(entry.matrix).toEqual({
      attack: 2, sleaze: -1, firewall: -1, initiative: 3 
    })
    expect(spriteInitiativeDice('tpHotspike')).toBe(5)
    expect(spriteGivenPowers('tpHotspike')).toEqual(['Compendium.technomancers-plus-sr5.items.Item.abc'])
    expect(SR5.spriteTypes.tpHotspike).toBe('TECHNOPLUS.SpriteHotspike')
    expect(SR5.spriteTypesDescription.tpHotspike).toBe('TECHNOPLUS.SpriteHotspikeDescription')
    expect(isBuiltInSpriteType('tpHotspike')).toBe(false)
  })
  it('keeps the book default dice when none is given', () => {
    registerSpriteType('tpRom', {
      label: 'ROM', skills: ['hacking'] 
    })
    expect(spriteInitiativeDice('tpRom')).toBe(DEFAULT_INITIATIVE_DICE)
    expect(spriteMatrixModifiers('tpRom')).toEqual({
    })
  })
  it('refuses to replace a book type, a key that is not a word, a type without label', () => {
    expect(registerSpriteType('fault', {
      label: 'x', skills: ['hardware'] 
    })).toBeNull()
    expect(spriteSkills('fault')).toEqual(['computer', 'cybercombat', 'hacking'])
    expect(registerSpriteType('bad key', {
      label: 'x' 
    })).toBeNull()
    expect(registerSpriteType('noLabel', {
      skills: [] 
    })).toBeNull()
    expect(spriteTypeDefinition('noLabel')).toBeNull()
  })
  it('an unknown type gets nothing but the book dice', () => {
    expect(spriteTypeDefinition('nope')).toBeNull()
    expect(spriteSkills('nope')).toEqual([])
    expect(spriteMatrixModifiers('nope')).toEqual({
    })
    expect(spriteInitiativeDice('nope')).toBe(4)
  })
})

describe('the powers a registered type names', () => {
  it('are read by UUID, skipped when unreadable or already given by name', async () => {
    registerSpriteType('tpCode', {
      label: 'Code', powers: ['u1', 'u2', 'u3', 'u4'] 
    })
    const docs = {
      u1: {
        name: 'Watermark', toObject: () => ({
          name: 'Watermark', system: {
          } 
        }) 
      },
      u2: {
        name: 'Camouflage', toObject: () => ({
          name: 'Camouflage', system: {
          } 
        }) 
      },
      u4: {
        name: 'Camouflage', toObject: () => ({
          name: 'Camouflage', system: {
          } 
        }) 
      },
    }
    const given = await SR5_CompendiumUtility.givenSpritePowers('tpCode', [{
      name: 'Watermark' 
    }], {
      resolve: async uuid => { if (uuid === 'u3') throw new Error('gone'); return docs[uuid] ?? null }
    })
    expect(given.map(i => i.name)).toEqual(['Camouflage'])
  })
  it('a book type names none', async () => {
    expect(await SR5_CompendiumUtility.givenSpritePowers('courier', [], {
      resolve: async () => { throw new Error('never') } 
    })).toEqual([])
  })
})

describe('the character utility reads the registry, no switch left', () => {
  const src = readFileSync(new URL('../modules/entities/actors/utilityActor.js', import.meta.url), 'utf8')
  it('skills, matrix modifiers and initiative dice', () => {
    const skills = src.slice(src.indexOf('static generateSpriteSkills'), src.indexOf('static generateSpriteSkills') + 900)
    expect(skills).toContain('spriteSkills(actorData.type)')
    expect(skills).not.toContain('case "courier"')
    const matrix = src.slice(src.indexOf('static generateSpriteMatrix'), src.indexOf('static generateSpriteMatrix') + 1500)
    expect(matrix).toContain('spriteMatrixModifiers(actorData.type)')
    expect(matrix).not.toContain('case "generalist"')
    expect(src).toContain('spriteInitiativeDice(actorData.type))')
  })
  it('the API is handed to the modules', () => {
    const init = readFileSync(new URL('../modules/hooks/init.js', import.meta.url), 'utf8')
    expect(init).toContain('spriteTypes: spriteTypesApi')
  })
})
