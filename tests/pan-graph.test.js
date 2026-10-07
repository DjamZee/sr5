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

  it('goes up from the drone\'s crown to its rigger\'s master, and inherits its silent mode (lot 7, KC p. 39)', () => {
    const {
      vehicle, pc
    } = rig()
    pc.system.matrix.runningSilent = true
    const droneDevice = item('itemDevice', {
      type: 'baseDevice'
    }, {
      id: 'dd'
    })
    const drone = actor([droneDevice], {
      creatorId: 'pc', creatorItemId: 'veh', wirelessTurnedOn: true
    }, {
      id: 'drone1', type: 'actorDrone'
    })
    const g = buildPanGraph(drone, {
      resolve: resolver(vehicle), actors: [pc, drone]
    })
    // No device is master and slave at once (SR5 p. 234): the drone's own device is no master
    expect(g.master).toBeNull()
    const up = g.nodes.find(n => n.kind === 'rigger')
    expect(up).toMatchObject({
      uuid: pc.items[0].uuid, holderIds: ['pc'], mode: 'silent'
    })
    expect(g.links).toContainEqual({
      from: 'owner', to: up.uuid, kind: 'rigger'
    })
    expect(g.nodes.find(n => n.uuid === droneDevice.uuid)).toMatchObject({
      kind: 'device', mode: 'silent', silentFrom: 'master'
    })
  })

  it('keeps the drone\'s crown whole when its rigger is not found', () => {
    const drone = actor([item('itemDevice', {
      type: 'baseDevice'
    })], {
      creatorId: 'gone', creatorItemId: 'veh'
    }, {
      id: 'drone1', type: 'actorDrone'
    })
    const g = buildPanGraph(drone, {
      actors: [drone]
    })
    expect(g.nodes.some(n => n.kind === 'rigger')).toBe(false)
    expect(g.master).toBe(drone.items[0].uuid)
  })
})

describe('pan graph: an unlinked token (synthetic uuids)', () => {
  it('draws each slave once: the PAN lists the world actor\'s uuids, the token carries its own copies', () => {
    const worldGun = item('itemWeapon', {
      isSlavedToPan: true
    }, {
      id: 'gun', uuid: 'Actor.guard.Item.gun'
    })
    const world = actor([worldGun], {
    }, {
      id: 'guard', type: 'actorGrunt'
    })
    const gun = item('itemWeapon', {
      // the copy may lose the flag (utilityItem: an empty panMaster resets it)
      isSlavedToPan: false
    }, {
      id: 'gun', uuid: 'Scene.s.Token.t.Actor.guard.Item.gun'
    })
    const deck = deckWith([worldGun])
    const token = actor([deck, gun], {
    }, {
      id: 'guard', type: 'actorGrunt'
    })
    token.isToken = true
    token.token = {
      id: 't'
    }
    const g = buildPanGraph(token, {
      resolve: uuid => (uuid === worldGun.uuid ? worldGun : null)
    })
    expect(world.items[0].parent).toBe(world)
    expect(g.nodes.map(n => n.uuid)).toEqual([deck.uuid, gun.uuid])
    expect(g.nodes[1]).toMatchObject({
      kind: 'slave', holderIds: ['guard', 't']
    })
  })
})

describe('pan graph: devices of the scenery (lot 7, SR5 p. 234)', () => {
  function host(id = 'host1'){
    return actor([item('itemDevice', {
      type: 'baseDevice', deviceRating: 5
    }, {
      id: `${id}-dev`, uuid: `Actor.${id}.Item.${id}-dev`
    })], {
      matrix: {
        runningSilent: false, deviceType: 'host'
      }
    }, {
      id, type: 'actorDevice', name: 'Serveur'
    })
  }
  function decor(id, panMaster, deviceType = 'maglock', extra = {
  }){
    const a = actor([item('itemDevice', {
      type: 'baseDevice', deviceRating: 3
    }, {
      id: `${id}-dev`, uuid: `${extra.uuidRoot ?? `Actor.${id}`}.Item.${id}-dev`
    })], {
      matrix: {
        runningSilent: false, deviceType, panMaster
      }
    }, {
      id, type: 'actorDevice', name: id
    })
    a.uuid = `Actor.${id}`
    if (extra.token) {
      a.isToken = true
      a.token = {
        id: extra.token
      }
    }
    return a
  }

  it('links a maglock to its host, and the host to the maglock', () => {
    const h = host()
    h.uuid = 'Actor.host1'
    const door = decor('door', 'Actor.host1')
    const resolve = uuid => (uuid === h.uuid ? h : null)
    const g = buildPanGraph(door, {
      resolve, actors: [h, door]
    })
    const up = g.nodes.find(n => n.kind === 'wan')
    expect(up).toMatchObject({
      uuid: h.items[0].uuid, icon: 'host', holderIds: ['host1']
    })
    expect(g.wan).toEqual({
      uuid: 'Actor.host1', actorId: 'host1', isHost: true
    })
    expect(g.master).toBeNull()

    const hg = buildPanGraph(h, {
      resolve, actors: [h, door]
    })
    const slave = hg.nodes.find(n => n.kind === 'decor')
    expect(slave).toMatchObject({
      uuid: door.items[0].uuid, icon: 'maglock', holderIds: ['door']
    })
    expect(hg.links).toContainEqual({
      from: h.items[0].uuid, to: slave.uuid, kind: 'decor'
    })
  })

  it('gives a host no ceiling (p. 234)', () => {
    const h = host()
    h.uuid = 'Actor.host1'
    const doors = Array.from({
      length: 40
    }, (_, i) => decor(`door${i}`, 'Actor.host1'))
    const g = buildPanGraph(h, {
      actors: [h, ...doors]
    })
    expect(g.nodes.filter(n => n.kind === 'decor')).toHaveLength(40)
    expect(g.capacity).toBeNull()
  })

  it('counts the devices of the scenery against a commlink\'s ceiling (rating x 3, p. 233)', () => {
    const deck = deckWith([], {
      deviceRating: 1, pan: {
        max: 3, current: 0, content: []
      }
    })
    const guard = actor([deck], {
    }, {
      id: 'guard', type: 'actorGrunt'
    })
    const cams = [1, 2].map(i => decor(`cam${i}`, deck.uuid, 'device'))
    const g = buildPanGraph(guard, {
      actors: [guard, ...cams]
    })
    expect(g.nodes.filter(n => n.kind === 'decor')).toHaveLength(2)
    expect(g.capacity).toEqual({
      max: 3, used: 2
    })
  })

  it('passes the host\'s silent mode on to its devices (KC p. 39)', () => {
    const h = host()
    h.uuid = 'Actor.host1'
    h.system.matrix.runningSilent = true
    const door = decor('door', 'Actor.host1')
    const g = buildPanGraph(h, {
      actors: [h, door]
    })
    expect(g.nodes.find(n => n.kind === 'decor')).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
    const dg = buildPanGraph(door, {
      resolve: () => h, actors: [h, door]
    })
    expect(dg.nodes.find(n => n.kind === 'device')).toMatchObject({
      mode: 'silent', silentFrom: 'master'
    })
  })

  it('takes the token actors of the scene for their world actor: two doors stay two', () => {
    const h = host()
    h.uuid = 'Actor.host1'
    const world = decor('door', 'Actor.host1')
    const t1 = decor('door', 'Actor.host1', 'maglock', {
      token: 'tok1', uuidRoot: 'Scene.s.Token.tok1.Actor.door'
    })
    const t2 = decor('door', 'Actor.host1', 'maglock', {
      token: 'tok2', uuidRoot: 'Scene.s.Token.tok2.Actor.door'
    })
    const g = buildPanGraph(h, {
      actors: [h, world, t1, t2]
    })
    const slaves = g.nodes.filter(n => n.kind === 'decor')
    expect(slaves.map(n => n.holderIds[0])).toEqual(['tok1', 'tok2'])
  })

  it('never slaves a host, and reports a master that is gone', () => {
    const h = host()
    h.system.matrix.panMaster = 'Actor.other'
    expect(buildPanGraph(h, {
      actors: [h]
    }).nodes.some(n => n.kind === 'wan')).toBe(false)
    const door = decor('door', 'Actor.gone')
    const g = buildPanGraph(door, {
      actors: [door]
    })
    expect(g.missing).toEqual([{
      uuid: 'Actor.gone', name: ''
    }])
    expect(g.master).toBe(door.items[0].uuid)
  })
})
