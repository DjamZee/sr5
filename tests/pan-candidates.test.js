import {
  describe, it, expect
} from 'vitest'

// S1 (ticket 4 d'Adrore): the menus that slave a device list the actors of its scene, unlinked tokens included

const {
  sceneCandidates, panMasterChoices, hostChoices, slaveCandidates, freeSlaves
} = await import('../modules/system/pan-candidates.js')
const {
  hostMasterCandidates
} = await import('../modules/system/host-nodes.js')

const commlink = owner => ({
  type: 'itemDevice', name: 'Commlink', uuid: `${owner}.Item.c`, system: {
    isActive: true, type: 'commlink'
  }
})
const actor = (id, type, {
  uuid = `Actor.${id}`, deviceType, panMaster, items = []
} = {
}) => ({
  id, uuid, name: id, type, items, system: {
    matrix: {
      deviceType, panMaster
    }
  }
})

// The scene of the site: a guard linked, two unlinked cameras of one generic actor, a generic host posed unlinked
const guard = actor('guard', 'actorGrunt', {
  items: [commlink('Actor.guard')]
})
const camBase = actor('cam', 'actorDevice', {
  deviceType: 'device'
})
const hostBase = actor('host', 'actorDevice', {
  deviceType: 'host'
})
const cam1 = actor('cam', 'actorDevice', {
  uuid: 'Scene.s.Token.c1.Actor.cam', deviceType: 'device'
})
const cam2 = actor('cam', 'actorDevice', {
  uuid: 'Scene.s.Token.c2.Actor.cam', deviceType: 'device', panMaster: 'Scene.o.Token.h9.Actor.host'
})
const hostHere = actor('host', 'actorDevice', {
  uuid: 'Scene.s.Token.h1.Actor.host', deviceType: 'host'
})
const pcElsewhere = actor('pc', 'actorPc', {
  items: [commlink('Actor.pc')]
})
const hostWorld = actor('hostWorld', 'actorDevice', {
  deviceType: 'host'
})
const ice = actor('ice', 'actorDevice', {
  uuid: 'Scene.s.Token.i1.Actor.ice', deviceType: 'ice'
})
const tokens = [{
  id: 'tg', actorLink: true, actor: guard
}, {
  id: 'c1', name: 'Caméra hall', actorLink: false, actor: cam1
}, {
  id: 'c2', name: 'Caméra quai', actorLink: false, actor: cam2
}, {
  id: 'h1', name: 'Serveur Aztech', actorLink: false, actor: hostHere
}, {
  id: 'i1', name: 'Patrouilleuse', actorLink: false, actor: ice
}]
const worldActors = [guard, camBase, hostBase, pcElsewhere, hostWorld]

describe('the actors of a scene', () => {
  it('lists a linked token once, and each unlinked token under its token\'s name and id', () => {
    const list = sceneCandidates({
      tokens: [...tokens, {
        id: 'tg2', actorLink: true, actor: guard
      }], worldActors
    })
    expect(list.map(c => [c.ref, c.name])).toEqual([['guard', 'guard'], ['c1', 'Caméra hall'], ['c2', 'Caméra quai'],
      ['h1', 'Serveur Aztech'], ['i1', 'Patrouilleuse']])
  })
  it('"show everyone" adds the world\'s actors after them', () => {
    const list = sceneCandidates({
      tokens, worldActors, showAll: true
    })
    expect(list.filter(c => !c.onScene).map(c => c.ref)).toEqual(['cam', 'host', 'pc', 'hostWorld'])
  })
})

describe('the master of a camera', () => {
  const candidates = sceneCandidates({
    tokens, worldActors
  })
  it('offers the host posed on the scene and the commlink of the guard, not the character on another scene', () => {
    const {
      hosts, devices
    } = panMasterChoices(candidates, cam1)
    expect(hosts).toEqual([{
      value: 'Scene.s.Token.h1.Actor.host', label: 'Serveur Aztech'
    }])
    expect(devices).toEqual([{
      value: 'Actor.guard.Item.c', label: 'guard — Commlink'
    }])
  })
  it('offers the world\'s hosts and characters with "show everyone"', () => {
    const {
      hosts, devices
    } = panMasterChoices(sceneCandidates({
      tokens, worldActors, showAll: true
    }), cam1)
    expect(hosts.map(h => h.label)).toEqual(['host', 'hostWorld', 'Serveur Aztech'])
    expect(devices.map(d => d.label)).toContain('pc — Commlink')
  })
  it('the host of an IC is chosen among the hosts of its scene', () => {
    expect(hostChoices(candidates, ice).map(h => h.value)).toEqual(['Scene.s.Token.h1.Actor.host'])
  })
})

describe('the slaves a host can take', () => {
  const candidates = sceneCandidates({
    tokens, worldActors
  })
  it('never the host itself, nor an IC, nor another host without the setting; another master is kept to be greyed', () => {
    const list = slaveCandidates(candidates, hostHere, {
      hostKeys: [hostHere.uuid]
    })
    expect(list.map(c => [c.ref, c.master])).toEqual([['c1', null], ['c2', 'Scene.o.Token.h9.Actor.host']])
    expect(freeSlaves(list).map(c => c.ref)).toEqual(['c1'])
  })
  it('a slave of this host is known as such', () => {
    const mine = {
      ...cam1, system: {
        matrix: {
          deviceType: 'device', panMaster: hostHere.uuid
        }
      }
    }
    const list = slaveCandidates([{
      ref: 'c1', actor: mine, name: 'Caméra hall', onScene: true
    }], hostHere, {
      hostKeys: [hostHere.uuid]
    })
    expect(list[0].mine).toBe(true)
    expect(freeSlaves(list)).toEqual([])
  })
  it('a host with the setting sr5HostNodes', () => {
    const other = actor('host', 'actorDevice', {
      uuid: 'Scene.s.Token.h2.Actor.host', deviceType: 'host'
    })
    const list = slaveCandidates([{
      ref: 'h2', actor: other, name: 'Nœud', onScene: true
    }], hostHere, {
      nodes: true
    })
    expect(list.map(c => c.ref)).toEqual(['h2'])
  })
})

describe('two instances of one generic host as masters of each other', () => {
  it('are told apart by their uuid, though they share an id', () => {
    const a = actor('host', 'actorDevice', {
      uuid: 'Scene.s.Token.h1.Actor.host', deviceType: 'host'
    })
    const b = actor('host', 'actorDevice', {
      uuid: 'Scene.s.Token.h2.Actor.host', deviceType: 'host'
    })
    expect(hostMasterCandidates(a, [a, b])).toEqual([b])
  })
})

// Lucas#2058, S2: the cameras of the Mégapack are drones with no rigger, which no host could take
describe('a drone with no rigger is a device of the scenery', () => {
  const drone = (id, rigger = '', panMaster = '') => ({
    id, uuid: `Actor.${id}`, name: id, type: 'actorDrone', items: [], system: {
      vehicleOwner: {
        id: rigger
      }, matrix: {
        panMaster
      }
    }
  })
  const host = actor('host', 'actorDevice', {
    deviceType: 'host'
  })
  host.system.matrix.actions = {
    dataSpike: {
      defense: {
        dicePool: 8
      }
    }
  }
  const camera = drone('camera')
  const riggerDrone = drone('rotodrone', 'rigger')

  it('a camera can be slaved, a rigger\'s drone cannot', async () => {
    const {
      isSceneryDevice
    } = await import('../modules/system/pan-candidates.js')
    expect(isSceneryDevice(camera)).toBe(true)
    expect(isSceneryDevice(riggerDrone)).toBe(false)
    const candidates = sceneCandidates({
      tokens: [camera, riggerDrone, host].map(a => ({
        id: a.id, actorLink: true, actor: a
      }))
    })
    expect(freeSlaves(slaveCandidates(candidates, host)).map(c => c.ref)).toEqual(['camera'])
  })

  it('slaved to a host, it defends with the host and belongs to its owner; its rigger wins over its panMaster', async () => {
    const {
      wanMasterOf
    } = await import('../modules/rolls/roll-helpers/direct-connection.js')
    const {
      ownerOf
    } = await import('../modules/system/matrix-ownership.js')
    const slaved = drone('camera', '', 'Actor.host')
    const resolve = uuid => (uuid === 'Actor.host' ? host : null)
    expect(wanMasterOf(slaved, resolve)).toBe(host)
    expect(ownerOf(slaved, {
      resolve
    }).host).toBe(host)
    const taken = drone('camera', 'rigger', 'Actor.host')
    expect(wanMasterOf(taken, resolve)).toBe(null)
    expect(ownerOf(taken, {
      resolve
    }).host).toBe(null)
  })
})
