import {
  describe, it, expect
} from 'vitest'
import {
  hiddenFromPlayers, nodeVisibility, pickViewer, PAN_SPOT_RANGE_METERS, viewerMarksOn
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

// Lot 3: the world setting "the gamemaster decides", the reveal, the observer's own marks, the gamemaster's ring
describe('the gamemaster decides (lot 3)', () => {
  const gm = extra => viewer({
    gmDecides: true, ...extra
  })
  const near = {
    distance: 5
  }

  it('hides an active device within 100 m from a player', () => {
    expect(sees(node(), gm(), near)).toEqual({
      visible: false, reason: 'gmDecides'
    })
  })

  it('hides a device the player marked or spotted', () => {
    expect(sees(node({
      marks: [{
        ownerId: 'decker', value: 2
      }]
    }), gm(), near).visible).toBe(false)
    expect(sees(node(), gm({
      spotted: new Set(['gun'])
    }), near).visible).toBe(false)
  })

  it('still shows the player her own crown', () => {
    expect(sees(node({
      mode: 'offline'
    }), gm({
      ids: ['guard'], hasAntenna: false
    })).reason).toBe('owner')
  })

  it('shows what the gamemaster revealed, to the whole table', () => {
    expect(sees(node({
      revealed: true
    }), gm({
      hasAntenna: false
    }))).toEqual({
      visible: true, reason: 'revealed'
    })
  })

  it('leaves the gamemaster seeing everything', () => {
    expect(sees(node(), gm({
      isGM: true
    })).reason).toBe('gm')
  })

  it('applies the book again once the setting is back to the book', () => {
    expect(sees(node(), viewer({
      gmDecides: false
    }), near).reason).toBe('inRange')
  })
})

describe('reveal under the book rules (lot 3)', () => {
  it('shows a revealed device even offline, far, silent or without antenna', () => {
    for (const mode of ['offline', 'silent']){
      expect(sees(node({
        mode, revealed: true
      }), viewer({
        hasAntenna: false
      }), {
        distance: 500
      }).reason).toBe('revealed')
    }
  })
})

describe('marks of the observer (SR5 p. 238)', () => {
  it('counts only the marks the observer put', () => {
    const n = node({
      marks: [{
        ownerId: 'decker', value: 2
      }, {
        ownerId: 'other', value: 3
      }]
    })
    expect(viewerMarksOn(n, ['decker'])).toBe(2)
    expect(viewerMarksOn(n, ['other'])).toBe(3)
    expect(viewerMarksOn(n, ['nobody'])).toBe(0)
  })

  it('reads the token id of an unlinked observer as well', () => {
    expect(viewerMarksOn(node({
      marks: [{
        ownerId: 'tokenId', value: 1
      }]
    }), ['actorId', 'tokenId'])).toBe(1)
  })
})

describe('what no player sees, for the gamemaster (lot 3)', () => {
  it('is hidden when no player sees it, or when there is no player', () => {
    expect(hiddenFromPlayers([{
      visible: false
    }, {
      visible: false
    }])).toBe(true)
    expect(hiddenFromPlayers([])).toBe(true)
  })

  it('is not hidden when one player sees it', () => {
    expect(hiddenFromPlayers([{
      visible: false
    }, {
      visible: true
    }])).toBe(false)
  })
})
