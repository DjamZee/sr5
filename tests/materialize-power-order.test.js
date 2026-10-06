import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {}
  }
})

import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'

// M4 D1 (mesuré par Tilda, 06/10) : esprit en jeton non lié, en combat : la case de matérialisation et le pouvoir
// Matérialisation se désaccordaient. Le pouvoir était basculé après la bascule d'initiative, sans attendre, et la
// dépense d'actions réécrivait le jeton avec l'ancienne liste d'objets. Le pouvoir suit désormais l'initiative
// (actif en physique), écrit et attendu avant la bascule.

let order, power
const sheet = () => ({
  actor: {
    items: [power]
  }
})
const click = binding => ({
  currentTarget: {
    dataset: {
      binding
    }
  }, target: {
    id: 'materializeIcon'
  }, preventDefault(){}, stopPropagation(){}
})

beforeEach(() => {
  vi.restoreAllMocks()
  order = []
  power = {
    system: {
      isActive: false, systemEffects: [{
        value: 'materialization'
      }]
    },
    update: vi.fn(async data => {
      order.push(['power', data['system.isActive']])
      power.system.isActive = data['system.isActive']
    }),
  }
  vi.spyOn(SR5_CharacterUtility, 'canSwitchToInitiative').mockReturnValue(true)
  vi.spyOn(SR5_CharacterUtility, 'switchToInitiative').mockImplementation(async (_a, init) => {
    order.push(['switch', init])
    return true
  })
})

describe('M4 D1 : le pouvoir Matérialisation suit la case', () => {
  it('matérialiser : pouvoir actif, écrit avant la bascule en physique', async () => {
    await ActorSheetSR5.prototype._onInitiativeSwitch.call(sheet(), click('physicalInit'))
    expect(order).toEqual([['power', true], ['switch', 'physicalInit']])
  })

  it('dématérialiser : pouvoir inactif, même s\'il avait été laissé actif', async () => {
    power.system.isActive = true
    await ActorSheetSR5.prototype._onInitiativeSwitch.call(sheet(), click('astralInit'))
    expect(order).toEqual([['power', false], ['switch', 'astralInit']])
  })

  it('pouvoir déjà d\'accord : rien d\'écrit, la case et le pouvoir ne divergent plus', async () => {
    power.system.isActive = true
    await ActorSheetSR5.prototype._onInitiativeSwitch.call(sheet(), click('physicalInit'))
    expect(order).toEqual([['switch', 'physicalInit']])
  })

  it('bascule refusée : le pouvoir revient comme avant', async () => {
    SR5_CharacterUtility.switchToInitiative.mockResolvedValue(false)
    await ActorSheetSR5.prototype._onInitiativeSwitch.call(sheet(), click('physicalInit'))
    expect(power.system.isActive).toBe(false)
  })
})
