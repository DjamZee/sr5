import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {}
  }
})

import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'

// An actor's type is actor.type; system.type is another field (a drone's
// "drone" or "vehicle", a spirit's kind), never "actorDrone" or "actorPc"

function monitor(max, damage = 0){
  return {
    value: max, base: max, modifiers: [], actual: {
      value: damage, base: damage, modifiers: []
    }
  }
}

function fakeActor(type, system){
  const actor = {
    id: 'a1', type, name: 'Test', effects: [], system,
    toObject: () => JSON.parse(JSON.stringify({
      type, system: actor.system
    })),
    update: vi.fn(async () => {}),
  }
  return actor
}

const droneData = () => ({
  type: 'drone',
  controlMode: 'autopilot',
  conditionMonitors: {
    condition: monitor(8),
    matrix: monitor(9),
  },
})

const pcData = () => ({
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
    physical: monitor(10),
    stun: monitor(10),
    overflow: monitor(4),
  },
})

function hit(element, type = 'physical'){
  return {
    damage: {
      value: 4, type, element, matrix: {
        value: 0
      }
    },
    combat: {
      ammo: {
      }
    },
    threshold: {
    },
  }
}

describe('electricity and anticoagulant side effects read the actor type (SR5 p. 172-173)', () => {
  let actor
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => actor)
    vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
    vi.spyOn(SR5_ActorHelper, 'createKoEffect').mockImplementation(async () => {})
    vi.spyOn(SR5_ActorHelper, 'createProneEffect').mockImplementation(async () => {})
    vi.spyOn(SR5_ActorHelper, 'electricityDamageEffect').mockImplementation(async () => {})
    vi.spyOn(SR5_ActorHelper, 'anticoagulantDamageEffect').mockImplementation(async () => {})
  })

  it('a drone takes matrix damage from electricity, not the dice and Initiative penalty', async () => {
    actor = fakeActor('actorDrone', droneData())
    await SR5_ActorHelper.takeDamage('a1', hit('electricity'))
    expect(SR5_ActorHelper.electricityDamageEffect).not.toHaveBeenCalled()
    expect(actor.update.mock.calls[0][0]['system.conditionMonitors.matrix.actual.base']).toBe(2)
  })

  it('a vehicle is damaged by electricity but suffers no side effect, matrix damage included', async () => {
    actor = fakeActor('actorDrone', {
      ...droneData(), type: 'vehicle'
    })
    await SR5_ActorHelper.takeDamage('a1', hit('electricity'))
    expect(SR5_ActorHelper.electricityDamageEffect).not.toHaveBeenCalled()
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.condition.actual.base']).toBe(4)
    expect(update['system.conditionMonitors.matrix.actual.base']).toBe(0)
  })

  it('a drone does not bleed from an anticoagulant', async () => {
    actor = fakeActor('actorDrone', droneData())
    await SR5_ActorHelper.takeDamage('a1', hit('anticoagulant'))
    expect(SR5_ActorHelper.anticoagulantDamageEffect).not.toHaveBeenCalled()
  })

  it('a character still gets both effects', async () => {
    actor = fakeActor('actorPc', pcData())
    await SR5_ActorHelper.takeDamage('a1', hit('electricity', 'stun'))
    await SR5_ActorHelper.takeDamage('a1', hit('anticoagulant'))
    expect(SR5_ActorHelper.electricityDamageEffect).toHaveBeenCalledTimes(1)
    expect(SR5_ActorHelper.anticoagulantDamageEffect).toHaveBeenCalledTimes(1)
  })
})

describe('the drone controller list offers characters and linked grunts', () => {
  const sidebarActor = (id, type, actorLink = false, hasPlayerOwner = false, isOwner = hasPlayerOwner) => ({
    id, name: id, type, hasPlayerOwner, isOwner,
    prototypeToken: {
      actorLink
    },
    system: {
      type: type === 'actorDrone' ? 'drone' : undefined
    },
  })

  async function controllersOffered(isGM){
    let offered
    globalThis.game.user = {
      isGM
    }
    globalThis.game.actors = [
      sidebarActor('runner', 'actorPc'),
      sidebarActor('playerRunner', 'actorPc', true, true),
      sidebarActor('otherPlayersRunner', 'actorPc', true, true, false),
      sidebarActor('linkedGrunt', 'actorGrunt', true),
      sidebarActor('mookGrunt', 'actorGrunt', false),
      sidebarActor('otherDrone', 'actorDrone'),
    ]
    globalThis.foundry.applications.handlebars = {
      renderTemplate: async (_path, data) => {
        offered = Object.keys(data.controlerList)
        return ''
      }
    }
    globalThis.foundry.applications.api.DialogV2 = {
      wait: async () => null
    }
    await ActorSheetSR5.prototype._onChooseControler.call({
      actor: {
        update: async () => {}
      }
    })
    return offered
  }

  it('the GM sees every character and the grunts whose token is linked', async () => {
    expect(await controllersOffered(true)).toEqual(['runner', 'playerRunner', 'otherPlayersRunner', 'linkedGrunt'])
  })

  // l. 367: another player's character is not offered to a player
  it('a player only sees the characters they own', async () => {
    expect(await controllersOffered(false)).toEqual(['playerRunner'])
  })
})
