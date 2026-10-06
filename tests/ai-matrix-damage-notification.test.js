import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// N76: matrix damage on an AI core (single condition monitor, Data Trails p. 161) has no
// Physical or Stun type: the notification read "10undefined appliqué(s)".

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

function monitor(max, damage = 0){
  return {
    value: max, base: max, modifiers: [], actual: {
      value: damage, base: damage, modifiers: []
    }
  }
}

function aiActor(){
  const system = {
    limits: {
      physicalLimit: {
        value: 6
      }
    },
    itemsProperties: {
      armor: {
        value: 0
      }
    },
    conditionMonitors: {
      condition: monitor(12),
    },
  }
  const actor = {
    id: 'a1', type: 'actorPc', name: 'IA', effects: [], system,
    toObject: () => JSON.parse(JSON.stringify({
      type: 'actorPc', system
    })),
    update: vi.fn(async () => {}),
  }
  return actor
}

let actor, infos
beforeEach(() => {
  infos = []
  globalThis.ui = {
    notifications: {
      info: m => infos.push(m), warn: () => {}
    }
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => actor)
  vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
  vi.spyOn(SR5_ActorHelper, 'createKoEffect').mockImplementation(async () => {})
  vi.spyOn(SR5_ActorHelper, 'createProneEffect').mockImplementation(async () => {})
})

describe('matrix damage on an AI core', () => {
  it('names no undefined damage type in the notification', async () => {
    actor = aiActor()
    await SR5_ActorHelper.takeDamage('a1', {
      damage: {
        value: 0, type: undefined, matrix: {
          value: 10
        }, element: '', isAttack: true
      },
      combat: {
        ammo: {
        }
      },
      threshold: {
      },
    })
    expect(infos.length).toBeGreaterThan(0)
    expect(infos.join(' ')).not.toContain('undefined')
    expect(infos[0]).toContain(' 10 ')
    // C6 c: the core names the damage as a device does ("10 Dommages matriciels appliqués")
    expect(infos[0]).toContain('SR5.AppliedMatrixDamage')
  })
})
