import {
  describe, it, expect
} from 'vitest'
import {
  isTechnomancer, personaOf, personaRepairPlan, canDeletePersona, changesPersonaType, personaPanMax, matrixFusionOf,
  personaMayBeSlaved
} from '../modules/entities/actors/living-persona.js'

// The living persona kept by the system (way B, decision of DjamZ, 07/10): every technomancer has one, created when
// missing, never deleted, never turned into another device (SR5 p. 236, 253).

const device = (type, system = {
}, id = type) => ({
  id, type: 'itemDevice', system: {
    type, ...system
  }
})
const quality = (effects = []) => ({
  id: 'q', type: 'itemQuality', system: {
    systemEffects: effects
  }
})
const actor = (items = [], special = 'resonance', type = 'actorPc') => {
  const a = {
    type, system: {
      activeSpecialAttribute: special
    }, items
  }
  for (const i of items) i.parent = a
  return a
}

describe('living persona: who is a technomancer', () => {
  it('a character or a grunt whose special attribute is Resonance', () => {
    expect(isTechnomancer(actor([]))).toBe(true)
    expect(isTechnomancer(actor([], 'resonance', 'actorGrunt'))).toBe(true)
    expect(isTechnomancer(actor([], 'magic'))).toBe(false)
    expect(isTechnomancer(actor([], 'depth'))).toBe(false)
    expect(isTechnomancer(actor([], 'resonance', 'actorSprite'))).toBe(false)
    expect(isTechnomancer(null)).toBe(false)
  })
})

describe('living persona: repair plan', () => {
  it('creates the persona of a technomancer who has none (Rosalie, 07/10), switched on', () => {
    const plan = personaRepairPlan(actor([]), 'Persona incarné')
    expect(plan.update).toBe(null)
    expect(plan.create).toEqual({
      name: 'Persona incarné', type: 'itemDevice', system: {
        type: 'livingPersona', managed: true, isActive: true, wirelessTurnedOn: true
      }
    })
  })

  it('creates it switched off when a commlink is in use: her cover stays her choice (SR5 p. 253, DT p. 63)', () => {
    const plan = personaRepairPlan(actor([device('commlink', {
      isActive: true
    })]))
    expect(plan.create.system.isActive).toBe(false)
  })

  it('marks an existing persona as managed, and creates nothing', () => {
    const plan = personaRepairPlan(actor([device('livingPersona', {
      isActive: true
    }, 'p1')]))
    expect(plan.create).toBe(null)
    expect(plan.update).toEqual({
      _id: 'p1', 'system.managed': true
    })
  })

  it('does nothing when the persona is already managed, nor for anybody else', () => {
    expect(personaRepairPlan(actor([device('livingPersona', {
      managed: true
    })]))).toEqual({
      create: null, update: null
    })
    expect(personaRepairPlan(actor([], 'magic'))).toEqual({
      create: null, update: null
    })
  })

  it('takes the managed persona before another one', () => {
    const a = actor([device('livingPersona', {
    }, 'p1'), device('livingPersona', {
      managed: true
    }, 'p2')])
    expect(personaOf(a).id).toBe('p2')
  })
})

describe('living persona: what cannot be done to it', () => {
  it('a managed persona is not deleted while its actor is a technomancer', () => {
    const a = actor([device('livingPersona', {
      managed: true
    })])
    expect(canDeletePersona(a.items[0])).toBe(false)
    a.system.activeSpecialAttribute = 'magic'
    expect(canDeletePersona(a.items[0])).toBe(true)
  })

  it('a persona the system does not keep, and any other device, are deleted as before', () => {
    expect(canDeletePersona(actor([device('livingPersona')]).items[0])).toBe(true)
    expect(canDeletePersona(actor([device('commlink', {
      managed: true
    })]).items[0])).toBe(true)
  })

  it('a managed persona is not turned into another device, flat or nested', () => {
    const p = device('livingPersona', {
      managed: true
    })
    expect(changesPersonaType(p, {
      'system.type': 'commlink'
    })).toBe(true)
    expect(changesPersonaType(p, {
      system: {
        type: 'cyberdeck'
      }
    })).toBe(true)
    expect(changesPersonaType(p, {
      system: {
        type: 'livingPersona'
      }
    })).toBe(false)
    expect(changesPersonaType(p, {
      name: 'Mon persona'
    })).toBe(false)
    expect(changesPersonaType(device('livingPersona'), {
      'system.type': 'commlink'
    })).toBe(false)
  })
})

describe('living persona: PAN', () => {
  it('takes no slave by the book (SR5 p. 253)', () => {
    expect(personaPanMax(actor([quality()]), 6)).toBe(0)
  })
})

const fusion = value => ({
  category: 'specialCase', value
})

describe('living persona: Fusion avec la matrice (Kill Code p. 107)', () => {
  it('reads the quality on the actor: 8 Karma, master of Resonance x 3', () => {
    const a = actor([quality([fusion('matrixFusionMaster')]), device('livingPersona', {
      managed: true
    })])
    expect(matrixFusionOf(a)).toEqual({
      slave: false, master: true
    })
    expect(personaPanMax(a, 5)).toBe(15)
  })

  it('2 Karma: may be slaved, takes no slave; 10 Karma carries both', () => {
    const slave = actor([quality([fusion('matrixFusionSlave')])])
    expect(matrixFusionOf(slave)).toEqual({
      slave: true, master: false
    })
    expect(personaPanMax(slave, 5)).toBe(0)
    expect(matrixFusionOf(actor([quality([fusion('matrixFusionSlave'), fusion('matrixFusionMaster')])]))).toEqual({
      slave: true, master: true
    })
  })

  it('falls back on the choice made by hand on the persona', () => {
    expect(matrixFusionOf(actor([device('livingPersona', {
      managed: true, matrixFusion: 'both'
    })]))).toEqual({
      slave: true, master: true
    })
    expect(matrixFusionOf(actor([device('livingPersona', {
      managed: true, matrixFusion: 'master'
    })])).slave).toBe(false)
  })

  it('ignores an effect of another category, or on an item that is no quality', () => {
    expect(matrixFusionOf(actor([quality([{
      category: 'tradition', value: 'matrixFusionMaster'
    }])])).master).toBe(false)
    expect(matrixFusionOf(actor([{
      type: 'itemGear', system: {
        systemEffects: [fusion('matrixFusionMaster')]
      }
    }])).master).toBe(false)
  })

  it('offers the persona as a slave only when it is neither slaved nor a master (KC p. 39)', () => {
    const a = actor([quality([fusion('matrixFusionSlave')]), device('livingPersona', {
      managed: true, pan: {
        content: []
      }
    })])
    const persona = a.items[1]
    expect(personaMayBeSlaved(a, persona)).toBe(true)
    persona.system.pan.content = [{
      uuid: 'x'
    }]
    expect(personaMayBeSlaved(a, persona)).toBe(false)
    persona.system.pan.content = []
    persona.system.isSlavedToPan = true
    expect(personaMayBeSlaved(a, persona)).toBe(false)
    expect(personaMayBeSlaved(actor([device('livingPersona')]), device('livingPersona'))).toBe(false)
  })
})
