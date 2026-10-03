import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})

import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5_PrepareRollTest
} from '../modules/rolls/roll-prepare.js'

// An embedded collection: iterable, with find and get as Foundry's Collection has them
function collection(docs){
  const list = [...docs]
  list.get = (id) => list.find(d => d.id === id)
  return list
}

// An itemEffect as Foundry hands it over: its value field is a StringField, so a stored number comes back as text
function effectItem(type, value){
  return {
    id: type, type: 'itemEffect', name: type,
    system: {
      type, value: String(value), durationType: 'special', duration: 0
    },
    update: vi.fn(async () => {}),
  }
}

function combatActor(items){
  return {
    id: 'a1', name: 'Test', isToken: false, effects: [], items: collection(items),
    system: {
      conditionMonitors: {
      }, specialProperties: {
      }
    },
    update: vi.fn(async () => {}),
    takeDamage: vi.fn(async () => {}),
    rollTest: vi.fn(),
    updateEmbeddedDocuments: vi.fn(async () => {}),
  }
}

async function endTurn(actor){
  vi.spyOn(SR5Combat, 'getActorFromCombatant').mockReturnValue(actor)
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    damage: {
    }
  }))
  await SR5Combat.manageTurnEnd({
    name: 'Test'
  })
}

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('fire damage goes up by 1 each Combat Turn (SR5 p. 173)', () => {
  it('takes 3 then stores 4, not "31"', async () => {
    const fire = effectItem('fireDamage', 3)
    const actor = combatActor([fire])

    await endTurn(actor)

    expect(actor.takeDamage.mock.calls[0][0].damage.value).toBe(3)
    expect(fire.update.mock.calls[0][0].system.value).toBe(4)
  })

  it('takes 4 on the next turn', async () => {
    const fire = effectItem('fireDamage', 4)
    const actor = combatActor([fire])

    await endTurn(actor)

    expect(actor.takeDamage.mock.calls[0][0].damage.value).toBe(4)
    expect(fire.update.mock.calls[0][0].system.value).toBe(5)
  })
})

describe('acid damage drops by 1 each Combat Turn (SR5 p. 172)', () => {
  function armor(){
    return {
      id: 'armor', type: 'itemArmor', name: 'Veste',
      system: {
        isActive: true, isAccessory: false
      },
      toObject: () => ({
        _id: 'armor', system: {
          itemEffects: [{
            target: 'system.armorValue', type: 'value', value: -1
          }]
        }
      }),
    }
  }

  it('applies DV 5 after DV 6 and stores 5 for the next turn', async () => {
    const acid = effectItem('acidDamage', 6)
    const actor = combatActor([acid, armor()])

    await endTurn(actor)

    expect(actor.rollTest).toHaveBeenCalledTimes(1)
    expect(actor.rollTest.mock.calls[0][2].damage.value).toBe(5)
    expect(acid.update).toHaveBeenCalledWith({
      "system.value": 5
    })
    // and it eats one more point of armor
    expect(actor.updateEmbeddedDocuments.mock.calls[0][1][0].system.itemEffects[0].value).toBe(-2)
  })

  it('applies DV 4 on the turn after', async () => {
    const acid = effectItem('acidDamage', 5)
    const actor = combatActor([acid, armor()])

    await endTurn(actor)

    expect(actor.rollTest.mock.calls[0][2].damage.value).toBe(4)
    expect(acid.update).toHaveBeenCalledWith({
      "system.value": 4
    })
  })

  it('stops once its DV reaches 0: no damage, no more armor eaten', async () => {
    const acid = effectItem('acidDamage', 1)
    const actor = combatActor([acid, armor()])

    await endTurn(actor)

    expect(actor.rollTest).not.toHaveBeenCalled()
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
