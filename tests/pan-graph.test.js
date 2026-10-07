import {
  describe, it, expect
} from 'vitest'
import {
  buildPanGraph, slaveMode, ownMode, hasAntenna, droneOf
} from '../modules/canvas/pan-crown/pan-graph.js'

// The graph of a PAN (couronne du PAN, lot 1): master, slaves, drones by creatorItemId, and the silent mode a
// master passes on to its slaves (Kill Code p. 39, VO: "Slaved devices run silent when their master devices do").

let n = 0
function item(type, system = {
}, extra = {
}){
  const id = extra.id ?? `i${++n}`
  return {
    id, uuid: extra.uuid ?? `Actor.x.Item.${id}`, name: extra.name ?? id, type,
    system: {
      isWireless: true, wirelessTurnedOn: true, isActive: true, marks: [], ...system
    },
    flags: extra.flags ?? {
    },
  }
}
function actor(items, system = {
}, extra = {
}){
  const a = {
    id: extra.id ?? 'pc', name: extra.name ?? 'PC', type: extra.type ?? 'actorPc', isToken: false, items,
    system: {
      matrix: {
        runningSilent: false
      }, ...system
    },
  }
  for (const i of items) i.parent ??= a
  return a
}
function deckWith(slaves, system = {
}){
  return item('itemDevice', {
    type: 'commlink', deviceRating: 4, pan: {
      max: 12, current: slaves.length, content: slaves.map(s => ({
        name: s.name, uuid: s.uuid
      }))
    }, ...system
  })
}
const resolver = (...items) => uuid => items.find(i => i.uuid === uuid) ?? null

describe('pan graph: master and slaves (SR5 p. 233-234)', () => {
  it('links the persona to the master, and each slave to the master', () => {
    const gun = item('itemWeapon', {
      isSlavedToPan: true, panMaster: 'pc'
    })
    const deck = deckWith([gun])
    const pc = actor([deck, gun])
    const g = buildPanGraph(pc, {
      resolve: resolver(gun)
    })
    expect(g.master).toBe(deck.uuid)
    expect(g.nodes.map(x => [x.kind, x.mode])).toEqual([['master', 'active'], ['slave', 'active']])
    expect(g.links).toEqual([
      {
        from: 'owner', to: deck.uuid, kind: 'persona'
      },
      {
        from: deck.uuid, to: gun.uuid, kind: 'slave'
      },
    ])
  })

  it('passes the master\'s silent mode on to its slaves (KC p. 39)', () => {
    const gun = item('itemWeapon', {
      isSlavedToPan: true
    })
    const pc = actor([deckWith([gun]), gun], {
      matrix: {
        runningSilent: true
      }
    })
    const g = buildPanGraph(pc, {
      resolve: resolver(gun)
    })
    expect(g.nodes[0].mode).toBe('silent')
    expect(g.nodes[1]).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
  })

  it('lets a slave run silent on its own, under an active master', () => {
    const gun = item('itemWeapon', {
      isSlavedToPan: true, isSilent: true
    })
    const g = buildPanGraph(actor([deckWith([gun]), gun]), {
      resolve: resolver(gun)
    })
    expect(g.nodes[0].mode).toBe('active')
    expect(g.nodes[1]).toMatchObject({
      mode: 'silent', silentFrom: 'self'
    })
  })

  it('keeps a slave whose wireless is off out of the Matrix, even under a silent master', () => {
    expect(slaveMode('offline', 'silent')).toEqual({
      mode: 'offline', silentFrom: null
    })
    expect(ownMode(item('itemArmor', {
      wirelessTurnedOn: false
    }))).toBe('offline')
    expect(ownMode(item('itemArmor', {
      isWireless: false
    }))).toBe('offline')
  })

  it('passes nothing on from a master whose wireless is off', () => {
    const gun = item('itemWeapon', {
      isSlavedToPan: true
    })
    const g = buildPanGraph(actor([deckWith([gun], {
      wirelessTurnedOn: false
    }), gun]), {
      resolve: resolver(gun)
    })
    expect(g.nodes.map(x => x.mode)).toEqual(['offline', 'active'])
  })

  it('gives the PAN user a slave carried by another character, and lists a lost entry apart', () => {
    const other = actor([], {
    }, {
      id: 'mate'
    })
    const lent = item('itemArmor', {
      isSlavedToPan: true, panMaster: 'pc'
    })
    lent.parent = other
    const deck = deckWith([lent])
    deck.system.pan.content.push({
      name: 'gone', uuid: 'Actor.y.Item.gone'
    })
    const g = buildPanGraph(actor([deck]), {
      resolve: resolver(lent)
    })
    expect(g.nodes[1].holderIds).toEqual(['mate'])
    expect(g.nodes[1].ownerIds).toEqual(['mate', 'pc'])
    expect(g.missing).toEqual([{
      uuid: 'Actor.y.Item.gone', name: 'gone'
    }])
  })
})

describe('pan graph: devices outside the PAN', () => {
  it('draws the devices switched on and in use, linked to the token, and leaves out the rest', () => {
    const on = item('itemWeapon')
    const off = item('itemWeapon', {
      wirelessTurnedOn: false
    })
    const unused = item('itemGear', {
      isActive: false
    })
    const drug = item('itemDrug')
    const g = buildPanGraph(actor([on, off, unused, drug]))
    expect(g.master).toBeNull()
    expect(g.nodes.map(x => x.uuid)).toEqual([on.uuid])
    expect(g.links[0]).toEqual({
      from: 'owner', to: on.uuid, kind: 'device'
    })
  })

  it('needs an active device switched on for an antenna (Q2)', () => {
    expect(hasAntenna(actor([item('itemGear')]))).toBe(false)
    expect(hasAntenna(actor([deckWith([])]))).toBe(true)
    expect(hasAntenna(actor([deckWith([], {
      wirelessTurnedOn: false
    })]))).toBe(false)
    expect(hasAntenna(actor([deckWith([], {
      isActive: false
    })]))).toBe(false)
  })
})

describe('pan graph: drones (creatorItemId)', () => {
  function rig(droneSystem = {
  }, creatorId = 'pc'){
    const vehicle = item('itemVehicle', {
      isSlavedToPan: true, isCreated: true
    }, {
      id: 'veh'
    })
    const pc = actor([deckWith([vehicle]), vehicle])
    const drone = {
      id: 'drone1', type: 'actorDrone', isToken: false, items: [], system: {
        creatorId, creatorItemId: 'veh', wirelessTurnedOn: true, matrix: {
          runningSilent: false, marks: []
        }, ...droneSystem
      }
    }
    return {
      vehicle, pc, drone
    }
  }

  it('turns a deployed vehicle into a drone node, linked to the rigger\'s master', () => {
    const {
      vehicle, pc, drone
    } = rig()
    const g = buildPanGraph(pc, {
      resolve: resolver(vehicle), actors: [drone]
    })
    expect(g.nodes[1]).toMatchObject({
      kind: 'drone', droneId: 'drone1', mode: 'active'
    })
    expect(g.links[1].kind).toBe('drone')
  })

  it('reads the switches on the drone while it is out (N83)', () => {
    const {
      vehicle, pc, drone
    } = rig({
      wirelessTurnedOn: false
    })
    expect(buildPanGraph(pc, {
      resolve: resolver(vehicle), actors: [drone]
    }).nodes[1].mode).toBe('offline')
  })

  it('does not take the drone of a duplicated rigger', () => {
    const {
      vehicle, pc
    } = rig({
    }, 'someone-else')
    expect(droneOf(vehicle, pc, [{
      type: 'actorDrone', system: {
        creatorId: 'someone-else', creatorItemId: 'veh'
      }
    }])).toBeNull()
  })

  it('links a drone\'s own crown to its rigger', () => {
    const g = buildPanGraph({
      id: 'drone1', type: 'actorDrone', items: [], system: {
        creatorId: 'pc', creatorItemId: 'veh'
      }
    })
    expect(g.rigger).toEqual({
      actorId: 'pc', itemId: 'veh'
    })
  })
})
