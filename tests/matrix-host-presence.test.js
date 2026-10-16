import {
  describe, it, expect, vi
} from 'vitest'

// S3 (ticket 4 d'Adrore): being inside a host, SR5 p. 240, 248, 249

const {
  hostEntryCheck, enterHostUpdate, exitHostUpdate, exitHostInPlace, marksOnHost, hostSideOf, seenFromHost, markIdsOf
} = await import('../modules/system/matrix-host-presence.js')
const {
  converge, convergencePlan
} = await import('../modules/system/matrix-api.js')

const host = (uuid = 'Scene.s.Token.h1.Actor.h', marks = []) => ({
  uuid, type: 'actorDevice', isToken: true, token: {
    id: 'h1'
  }, items: [{
    type: 'itemDevice', uuid: `${uuid}.Item.d`, system: {
      marks
    }
  }], system: {
    matrix: {
      deviceType: 'host'
    }
  }
})
const decker = (matrix = {
}, isToken = false) => ({
  id: 'decker', uuid: 'Actor.decker', type: 'actorPc', isToken, token: isToken ? {
    id: 'td'
  } : null, items: [], system: {
    matrix: {
      userGrid: 'public', ...matrix
    }
  }
})

describe('entering a host (SR5 p. 240)', () => {
  it('is refused without a mark, granted with one, or to its owner or administrator', () => {
    const h = host()
    expect(hostEntryCheck({
      host: h, marks: 0
    })).toBe('noMark')
    expect(hostEntryCheck({
      host: h, marks: 1
    })).toBe('ok')
    expect(hostEntryCheck({
      host: h, marks: 0, owner: true
    })).toBe('ok')
    expect(hostEntryCheck({
      host: h, current: h.uuid, marks: 3
    })).toBe('already')
    expect(hostEntryCheck({
      host: decker(), marks: 3
    })).toBe('notHost')
  })
  it('reads the marks the host carries under the persona\'s id (its token\'s for an unlinked token), or its own record', () => {
    expect(marksOnHost(decker(), host(undefined, [{
      ownerId: 'decker', value: 2
    }]))).toBe(2)
    expect(marksOnHost(decker({
    }, true), host(undefined, [{
      ownerId: 'decker', value: 2
    }]))).toBe(0)
    expect(marksOnHost(decker({
    }, true), host(undefined, [{
      ownerId: 'td', value: 1
    }]))).toBe(1)
    expect(marksOnHost(decker({
      markedItems: [{
        uuid: 'Scene.s.Token.h1.Actor.h.Item.d', value: 1
      }]
    }), host())).toBe(1)
    expect(markIdsOf(decker({
    }, true))).toEqual(['td'])
  })
  it('puts it inside, its grid kept; entering B from A leaves A and keeps the grid of before', () => {
    const inA = enterHostUpdate({
      userGrid: 'public'
    }, 'A')
    expect(inA).toEqual({
      'system.matrix.currentHost': 'A', 'system.matrix.gridBeforeHost': 'public', 'system.matrix.userGrid': 'host'
    })
    expect(enterHostUpdate({
      userGrid: 'host', currentHost: 'A', gridBeforeHost: 'public'
    }, 'B')).toEqual({
      'system.matrix.currentHost': 'B', 'system.matrix.gridBeforeHost': 'public', 'system.matrix.userGrid': 'host'
    })
  })
})

describe('leaving a host', () => {
  it('goes back to the grid of before; nothing to do outside', () => {
    expect(exitHostUpdate({
      userGrid: 'host', currentHost: 'A', gridBeforeHost: 'global'
    })).toEqual({
      'system.matrix.currentHost': '', 'system.matrix.gridBeforeHost': '', 'system.matrix.userGrid': 'global'
    })
    expect(exitHostUpdate({
      userGrid: 'public', currentHost: ''
    })).toBeNull()
  })
  it('a reboot empties the field (rebootDeck writes its copy of the system)', () => {
    const matrix = {
      userGrid: 'host', currentHost: 'A', gridBeforeHost: 'local'
    }
    expect(exitHostInPlace(matrix)).toBe(true)
    expect(matrix).toEqual({
      userGrid: 'local', currentHost: '', gridBeforeHost: ''
    })
  })
})

describe('the convergence inside a host (SR5 p. 249, Adrore 16/10)', () => {
  it('does not eject: no reboot, three marks of the host', () => {
    expect(convergencePlan({
      inHost: true
    })).toEqual(expect.objectContaining({
      reboot: false, marks: 3
    }))
  })
  it('is made by the host the persona is in when none is named', async () => {
    globalThis.game.user = {
      isGM: true
    }
    const h = host()
    const persona = {
      ...decker({
        currentHost: h.uuid
      }), documentName: 'Actor'
    }
    globalThis.fromUuid = vi.fn(async uuid => uuid === h.uuid ? {
      ...h, documentName: 'Actor'
    } : null)
    const helpers = {
      converge: vi.fn(async () => true)
    }
    await converge(persona, {
    }, helpers)
    expect(helpers.converge).toHaveBeenCalledWith(persona, expect.objectContaining({
      uuid: h.uuid
    }))
  })
})

describe('what a persona sees (SR5 p. 248)', () => {
  const A = 'A'
  const hostA = {
    ...host(A)
  }
  const camera = {
    type: 'actorDevice', system: {
      matrix: {
        deviceType: 'device', panMaster: A
      }
    }
  }
  const resolve = uuid => uuid === A ? hostA : null
  it('inside A: the inside of A, the host and its devices; not the grid, nor another host\'s inside', () => {
    expect(seenFromHost(A, hostSideOf(decker({
      currentHost: A
    }), resolve))).toBe(true)
    expect(seenFromHost(A, hostSideOf({
      type: 'actorDevice', system: {
        matrix: {
          deviceType: 'ice', hostUuid: A
        }
      }
    }, resolve))).toBe(true)
    expect(seenFromHost(A, hostSideOf(hostA, resolve))).toBe(true)
    expect(seenFromHost(A, hostSideOf(camera, resolve))).toBe(true)
    expect(seenFromHost(A, hostSideOf(decker(), resolve))).toBe(false)
    expect(seenFromHost(A, hostSideOf(decker({
      currentHost: 'B'
    }), resolve))).toBe(false)
  })
  it('on the grid: the host and its devices, never what is inside', () => {
    expect(seenFromHost('', hostSideOf(hostA, resolve))).toBe(true)
    expect(seenFromHost('', hostSideOf(camera, resolve))).toBe(true)
    expect(seenFromHost('', hostSideOf(decker(), resolve))).toBe(true)
    expect(seenFromHost('', hostSideOf(decker({
      currentHost: A
    }), resolve))).toBe(false)
  })
})
