import {
  describe, it, expect
} from 'vitest'
import {
  nodeVisibility, pickViewer, PAN_SPOT_RANGE_METERS
} from '../modules/canvas/pan-crown/pan-visibility.js'

// What an observer sees of a crown (couronne du PAN, lot 1): SR5 p. 236-238, and the rulings of DjamZ Q2-Q4 (07/10)

const node = (extra = {
}) => ({
  uuid: 'gun', mode: 'active', ownerIds: ['guard'], marks: [], revealed: false, ...extra
})
const viewer = (extra = {
}) => ({
  isGM: false, ids: ['decker'], hasAntenna: true, spotted: new Set(), ...extra
})
const sees = (n, v, where) => nodeVisibility(n, v, where)

describe('pan visibility (SR5 p. 236-238)', () => {
  it('shows everything to the gamemaster', () => {
    expect(sees(node({
      mode: 'offline'
    }), viewer({
      isGM: true, hasAntenna: false
    }))).toEqual({
      visible: true, reason: 'gm'
    })
  })

  it('shows the owner her own devices, offline and without antenna included', () => {
    expect(sees(node({
      mode: 'offline'
    }), viewer({
      ids: ['guard'], hasAntenna: false
    })).reason).toBe('owner')
  })

  it('spots an active device within 100 m, measured from the antenna', () => {
    expect(sees(node(), viewer(), {
      distance: 40
    })).toEqual({
      visible: true, reason: 'inRange'
    })
    expect(sees(node(), viewer(), {
      distance: PAN_SPOT_RANGE_METERS
    }).visible).toBe(true)
  })

  it('does not spot an active device beyond 100 m, nor on another scene', () => {
    expect(sees(node(), viewer(), {
      distance: 100.5
    })).toEqual({
      visible: false, reason: 'outOfRange'
    })
    expect(sees(node(), viewer(), {
      distance: null
    }).reason).toBe('outOfRange')
  })

  it('does not spot a silent device, even close by', () => {
    expect(sees(node({
      mode: 'silent'
    }), viewer(), {
      distance: 3
    })).toEqual({
      visible: false, reason: 'silent'
    })
  })

  it('keeps a spotted icon spotted, even silent and far away (p. 236)', () => {
    expect(sees(node({
      mode: 'silent'
    }), viewer({
      spotted: new Set(['gun'])
    }), {
      distance: 5000
    }).reason).toBe('spotted')
  })

  it('sees an icon one has marked, at any distance (p. 236)', () => {
    expect(sees(node({
      mode: 'silent', marks: [{
        ownerId: 'decker', value: 1
      }]
    }), viewer(), {
      distance: 5000
    }).reason).toBe('marked')
    // Someone else's mark shows nothing
    expect(sees(node({
      mode: 'silent', marks: [{
        ownerId: 'other', value: 3
      }]
    }), viewer(), {
      distance: 5
    }).visible).toBe(false)
  })

  it('never shows a device whose wireless is off', () => {
    expect(sees(node({
      mode: 'offline', marks: [{
        ownerId: 'decker', value: 2
      }]
    }), viewer(), {
      distance: 1
    })).toEqual({
      visible: false, reason: 'offline'
    })
  })

  it('shows only one\'s own crown without a device switched on (Q2)', () => {
    expect(sees(node(), viewer({
      hasAntenna: false
    }), {
      distance: 1
    })).toEqual({
      visible: false, reason: 'noAntenna'
    })
  })

  it('shows a device the gamemaster revealed to the whole table (Q4)', () => {
    expect(sees(node({
      mode: 'silent', revealed: true
    }), viewer({
      hasAntenna: false
    }), {
      distance: 900
    }).reason).toBe('revealed')
  })

  it('spots a host without distance, unless it runs silent (p. 236)', () => {
    expect(sees(node(), viewer(), {
      distance: null, isHost: true
    }).reason).toBe('host')
    expect(sees(node({
      mode: 'silent'
    }), viewer(), {
      isHost: true
    }).visible).toBe(false)
  })
})

describe('who looks (Q3)', () => {
  const character = {
    name: 'assigned'
  }
  it('takes the controlled token first', () => {
    const token = {
      actor: {
        name: 'controlled'
      }
    }
    expect(pickViewer({
      controlled: [token], character
    })).toEqual({
      actor: token.actor, token
    })
  })
  it('falls back on the assigned character, then on nobody', () => {
    expect(pickViewer({
      controlled: [], character
    })).toEqual({
      actor: character, token: null
    })
    expect(pickViewer({
    })).toBeNull()
  })
})
