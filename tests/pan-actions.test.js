import {
  describe, it, expect
} from 'vitest'
import {
  actionsForNode, menuEntries, PAN_DEVICE_ACTIONS
} from '../modules/canvas/pan-crown/pan-actions.js'
import {
  buildPanGraph
} from '../modules/canvas/pan-crown/pan-graph.js'

// Lot R7 of the rigging plan: the rigger in the crown. The electronic warfare of Rigger 5.0 (p. 34-35) in the radial
// menu, and the rigger command console drawn as the master of the drones slaved to it (SR5 p. 269)

const graph = (extra = {
}) => ({
  master: 'rcc', viewer: {
    ids: ['hacker'], hasAntenna: true
  }, nodes: [], ...extra
})
const drone = {
  uuid: 'Actor.rigger.Item.veh', kind: 'drone', itemType: 'itemVehicle', ownerIds: ['rigger'], viewerMarks: 0
}
const gun = {
  uuid: 'Actor.guard.Item.gun', kind: 'slave', itemType: 'itemWeapon', ownerIds: ['guard'], viewerMarks: 0
}
const hacker = keys => ({
  actor: {
    system: {
      matrix: {
        actions: Object.fromEntries(keys.map(k => [k, {
          neededMarks: 0
        }]))
      }
    }
  }
})

describe('R7: electronic warfare in the radial menu (Rigger 5.0 p. 34-35)', () => {
  it('offers nothing of Rigger 5.0 when the world does not play its actions', () => {
    const keys = actionsForNode(drone, graph())
    expect(keys).not.toContain('targetDevice')
    expect(keys).not.toContain('confusePilot')
    expect(keys).not.toContain('breakTargetLock')
    expect(keys).toContain('jumpIntoRiggedDevice')
  })

  it('offers on a drone the three actions, beside Jump into Rigged Device', () => {
    const keys = actionsForNode(drone, graph(), {
      rigger5: true
    })
    const jump = keys.indexOf('jumpIntoRiggedDevice')
    expect(keys.slice(jump - 1, jump + 3)).toEqual(['targetDevice', 'jumpIntoRiggedDevice', 'confusePilot', 'breakTargetLock'])
  })

  it('offers them too in the drone\'s own crown, on the device that stands for the drone', () => {
    const own = {
      uuid: 'Actor.drone1.Item.dd', kind: 'device', itemType: 'itemDevice', holderIds: ['drone1'], ownerIds: ['drone1', 'rigger']
    }
    const droneCrown = graph({
      master: null, owner: {
        id: 'drone1', type: 'actorDrone'
      }
    })
    expect(actionsForNode(own, droneCrown, {
      rigger5: true
    })).toEqual(expect.arrayContaining(['jumpIntoRiggedDevice', 'confusePilot', 'breakTargetLock']))
    // The rigger's console, drawn in the same crown, is no drone
    expect(actionsForNode({
      ...own, uuid: 'Actor.rigger.Item.rcc', kind: 'rigger', holderIds: ['rigger']
    }, droneCrown, {
      rigger5: true
    })).not.toContain('confusePilot')
  })

  it('offers them on an autonomous drone, master of its own PAN (Lancelot, F11)', () => {
    const master = {
      uuid: 'Actor.drone1.Item.dd', kind: 'master', itemType: 'itemDevice', holderIds: ['drone1'], ownerIds: ['drone1']
    }
    const droneCrown = graph({
      master: master.uuid, owner: {
        id: 'drone1', type: 'actorDrone'
      }
    })
    expect(actionsForNode(master, droneCrown, {
      rigger5: true
    })).toEqual(expect.arrayContaining(['jumpIntoRiggedDevice', 'confusePilot', 'breakTargetLock']))
    // A character's master device is no drone
    expect(actionsForNode(master, graph({
      master: master.uuid, owner: {
        id: 'drone1', type: 'actorPc'
      }
    }), {
      rigger5: true
    })).not.toContain('confusePilot')
  })

  it('offers Target Device on any wireless device, but the autopilot and the lock only on a drone', () => {
    const keys = actionsForNode(gun, graph(), {
      rigger5: true
    })
    expect(keys).toEqual([...PAN_DEVICE_ACTIONS, 'targetDevice'])
  })

  it('offers nothing of a device on a sprite, nor on a file', () => {
    expect(actionsForNode({
      uuid: 's', kind: 'sprite'
    }, graph(), {
      rigger5: true
    })).not.toContain('targetDevice')
    expect(actionsForNode({
      uuid: 'f', kind: 'file'
    }, graph(), {
      rigger5: true
    })).not.toContain('targetDevice')
  })

  it('needs no mark (Rigger 5.0 p. 34-35: "Marks requises : Aucune")', () => {
    const entries = menuEntries(drone, graph(), hacker(['confusePilot', 'breakTargetLock', 'targetDevice']), {
      rigger5: true
    })
    for (const key of ['confusePilot', 'breakTargetLock', 'targetDevice']) {
      expect(entries.actions.find(a => a.key === key)).toMatchObject({
        enabled: true, reason: null
      })
    }
  })

  it('leaves the owner his switches, not the attacks on his own drone', () => {
    const entries = menuEntries(drone, graph({
      viewer: {
        ids: ['rigger'], hasAntenna: true
      }
    }), hacker(['confusePilot']), {
      rigger5: true
    })
    expect(entries.owner).toBe(true)
    expect(entries.actions).toEqual([])
  })
})

// The console's world: a rigger, her console, a vehicle item and its deployed drone
let n = 0
function item(type, system = {
}, id = `i${++n}`){
  return {
    id, uuid: `Actor.rigger.Item.${id}`, name: id, type, flags: {
    },
    system: {
      isWireless: true, wirelessTurnedOn: true, isActive: true, marks: [], ...system
    },
  }
}
function rig({
  type = 'riggerCommandConsole', slaved = true, content = []
} = {
}){
  const vehicle = item('itemVehicle', {
    isCreated: true, slaved
  }, 'veh')
  const console = item('itemDevice', {
    type, deviceRating: 4, pan: {
      max: 12, content
    }
  }, 'rcc')
  const rigger = {
    id: 'rigger', name: 'Rigger', type: 'actorPc', isToken: false, items: [console, vehicle], system: {
      matrix: {
        runningSilent: false, deviceType: type
      }
    }
  }
  for (const i of rigger.items) i.parent = rigger
  const droneDevice = item('itemDevice', {
    type: 'baseDevice'
  }, 'dd')
  const droneActor = {
    id: 'drone1', name: 'Drone', type: 'actorDrone', isToken: false, items: [droneDevice], system: {
      creatorId: 'rigger', creatorItemId: 'veh', wirelessTurnedOn: true, slaved, matrix: {
        runningSilent: false, marks: []
      }
    }
  }
  droneDevice.parent = droneActor
  return {
    vehicle, console, rigger, droneActor
  }
}

describe('R7: the rigger command console, master of its drones (SR5 p. 269)', () => {
  it('links a drone slaved to the console to it, with no line in its PAN list', () => {
    const {
      rigger, console, droneActor
    } = rig()
    const g = buildPanGraph(rigger, {
      resolve: () => null, actors: [droneActor]
    })
    const node = g.nodes.find(x => x.kind === 'drone')
    expect(node).toMatchObject({
      droneId: 'drone1', mode: 'active'
    })
    expect(g.links).toContainEqual({
      from: console.uuid, to: node.uuid, kind: 'drone'
    })
    expect(g.capacity.used).toBe(1)
  })

  it('passes the console\'s silent mode on to its drones (KC p. 39)', () => {
    const {
      rigger, droneActor
    } = rig()
    rigger.system.matrix.runningSilent = true
    const node = buildPanGraph(rigger, {
      resolve: () => null, actors: [droneActor]
    }).nodes.find(x => x.kind === 'drone')
    expect(node).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
  })

  it('leaves a drone that is not slaved hanging from the rigger herself', () => {
    const {
      rigger, droneActor
    } = rig({
      slaved: false
    })
    droneActor.system.slaved = false
    const g = buildPanGraph(rigger, {
      resolve: () => null, actors: [droneActor]
    })
    const node = g.nodes.find(x => x.kind === 'drone')
    expect(g.links).toContainEqual({
      from: 'owner', to: node.uuid, kind: 'drone'
    })
  })

  // Any master takes a drone ticked "Asservi", as the matrix defense does (SR5 p. 234; decision of DjamZ, 2026-10-08)
  for (const type of ['commlink', 'cyberdeck']) it(`makes a ${type} the master of a drone ticked "Asservi", silent mode and room included`, () => {
    const {
      rigger, console: master, droneActor
    } = rig({
      type
    })
    rigger.system.matrix.runningSilent = true
    const g = buildPanGraph(rigger, {
      resolve: () => null, actors: [droneActor]
    })
    const node = g.nodes.find(x => x.kind === 'drone')
    expect(g.links).toContainEqual({
      from: master.uuid, to: node.uuid, kind: 'drone'
    })
    expect(node).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
    expect(g.capacity).toEqual({
      max: 12, used: 1
    })
  })

  it('in the drone\'s own crown, goes up to a commlink as a slave when ticked "Asservi"', () => {
    const {
      rigger, droneActor
    } = rig({
      type: 'commlink'
    })
    rigger.system.matrix.runningSilent = true
    const g = buildPanGraph(droneActor, {
      resolve: () => null, actors: [rigger, droneActor]
    })
    expect(g.nodes.find(x => x.uuid === 'Actor.rigger.Item.dd')).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
  })

  it('draws a drone both listed and slaved only once', () => {
    const {
      rigger, vehicle, droneActor
    } = rig({
      content: [{
        name: 'veh', uuid: 'Actor.rigger.Item.veh'
      }]
    })
    const g = buildPanGraph(rigger, {
      resolve: uuid => uuid === vehicle.uuid ? vehicle : null, actors: [droneActor]
    })
    expect(g.nodes.filter(x => x.kind === 'drone')).toHaveLength(1)
    expect(g.capacity.used).toBe(1)
  })

  it('in the drone\'s own crown, goes up to the console as a slave and inherits its silent mode', () => {
    const {
      rigger, droneActor
    } = rig()
    rigger.system.matrix.runningSilent = true
    const g = buildPanGraph(droneActor, {
      resolve: () => null, actors: [rigger, droneActor]
    })
    expect(g.nodes.find(x => x.kind === 'rigger')).toMatchObject({
      icon: 'rigger-console', mode: 'silent'
    })
    expect(g.nodes.find(x => x.uuid === 'Actor.rigger.Item.dd')).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
  })
})
