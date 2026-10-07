import {
  describe, it, expect
} from 'vitest'
import {
  answerOf, checkChoices, forgetHolder, intelEntry, intelFor, intelKey, intelUpdateData, marksCount, perceptionBudget,
  PERCEPTION_ENTRIES, silentAround, spottedUuids
} from '../modules/canvas/pan-crown/pan-perception.js'

// What a Matrix Perception brings back (couronne du PAN, lot 5): SR5 p. 236-237 and 242, ruling Q9 of DjamZ (07/10)

const facts = (extra = {
}) => ({
  monitor: {
    damage: 3, boxes: 10
  },
  programs: ['Marteau', 'Exploitation'],
  deviceRating: 4,
  commcode: '+1 206 555 0199',
  attributes: {
    attack: 6, sleaze: 5, dataProcessing: 4, firewall: 3
  },
  iconType: 'persona',
  grid: 'public',
  lastAction: {
    key: 'dataSpike', worldTime: 100, round: 3, combatId: 'c1'
  },
  marks: [{
    ownerId: 'a', value: 2
  }, {
    ownerId: 'b', value: 1
  }],
  silentNearby: 2,
  ...extra,
})
const answer = (key, f = facts(), typed = {
}, param) => answerOf(param ? {
  key, param
} : {
  key
}, f, typed)

describe('Matrix Perception, the list of SR5 p. 237 entry by entry', () => {
  it('offers every entry of the list, the four the system cannot work out typed by the gamemaster', () => {
    expect(PERCEPTION_ENTRIES.map(e => e.key)).toEqual(['spot', 'monitor', 'programs', 'deviceRating', 'commcode',
      'attribute', 'iconType', 'grid', 'lastAction', 'marks', 'fileEdited', 'fileBomb', 'fileProtection', 'silentNearby',
      'silentInHost'])
    expect(PERCEPTION_ENTRIES.filter(e => e.source === 'gm').map(e => e.key)).toEqual(['fileEdited', 'fileBomb',
      'fileProtection', 'silentInHost'])
  })

  it('spots the icon sought', () => {
    expect(answer('spot')).toEqual({
      key: 'spot', value: true, missing: false
    })
  })

  it('reads the Matrix condition monitor', () => {
    expect(answer('monitor').value).toEqual({
      damage: 3, boxes: 10
    })
    expect(answer('monitor', facts({
      monitor: null
    })).missing).toBe(true)
  })

  it('lists the programs running on a persona, none on a device', () => {
    expect(answer('programs').value).toEqual(['Marteau', 'Exploitation'])
    expect(answer('programs', facts({
      programs: []
    }))).toEqual({
      key: 'programs', value: [], missing: false
    })
  })

  it('gives the Device Rating', () => {
    expect(answer('deviceRating').value).toBe(4)
  })

  it('gives the commcode, or "not written" when the sheet has none', () => {
    expect(answer('commcode').value).toBe('+1 206 555 0199')
    expect(answer('commcode', facts({
      commcode: '  '
    })).missing).toBe(true)
  })

  it('gives one Matrix attribute of the choice, and says when the icon has not it (SR5 p. 227)', () => {
    expect(answer('attribute', facts(), {
    }, 'sleaze')).toEqual({
      key: 'attribute', param: 'sleaze', value: 5, missing: false
    })
    expect(answer('attribute', facts({
      attributes: {
        attack: null, sleaze: null, dataProcessing: 2, firewall: 2
      }
    }), {
    }, 'attack').missing).toBe(true)
  })

  it('gives the icon type and the grid', () => {
    expect(answer('iconType', facts({
      iconType: 'host'
    })).value).toBe('host')
    expect(answer('grid').value).toBe('public')
  })

  it('gives the last Matrix action and when, none known before lot 5', () => {
    expect(answer('lastAction').value).toEqual({
      key: 'dataSpike', worldTime: 100, round: 3, combatId: 'c1'
    })
    expect(answer('lastAction', facts({
      lastAction: null
    })).missing).toBe(true)
  })

  it('counts the marks of everyone, without their owners', () => {
    expect(answer('marks').value).toBe(3)
    expect(marksCount([{
      value: '2'
    }, {
      value: -1
    }, null])).toBe(2)
  })

  it('counts the silent icons within 100 m (SR5 p. 236)', () => {
    expect(answer('silentNearby').value).toBe(2)
    expect(silentAround([
      {
        mode: 'silent', distance: 40, ownerIds: ['x']
      },
      {
        mode: 'silent', distance: 140, ownerIds: ['x']
      },
      {
        mode: 'active', distance: 10, ownerIds: ['x']
      },
      {
        mode: 'silent', distance: 5, ownerIds: ['me']
      },
      {
        mode: 'silent', distance: null, ownerIds: ['x']
      },
    ], ['me'])).toBe(1)
  })

  it('gives what the gamemaster typed for files and hosts, or "no answer"', () => {
    for (const key of ['fileEdited', 'fileBomb', 'fileProtection', 'silentInHost']){
      expect(answer(key, facts(), {
        [key]: 'réponse'
      }).value).toBe('réponse')
      expect(answer(key).missing).toBe(true)
    }
  })
})

describe('Matrix Perception, one piece of information per hit (SR5 p. 242)', () => {
  it('counts the hits of a simple test, the net hits of an opposed one', () => {
    expect(perceptionBudget({
      hits: 3
    })).toBe(3)
    expect(perceptionBudget({
      hits: 3, defenseHits: 1
    })).toBe(2)
    expect(perceptionBudget({
      hits: 1, defenseHits: 2
    })).toBe(0)
  })

  it('refuses more pieces than hits', () => {
    const choices = [{
      key: 'spot'
    }, {
      key: 'monitor'
    }, {
      key: 'marks'
    }]
    expect(checkChoices(choices, 3).ok).toBe(true)
    expect(checkChoices(choices, 2)).toMatchObject({
      ok: false, reason: 'tooMany'
    })
  })

  it('one hit is enough to spot an icon farther than 100 m', () => {
    expect(checkChoices([{
      key: 'spot'
    }], perceptionBudget({
      hits: 1
    })).ok).toBe(true)
  })

  it('refuses an entry about an icon when none is aimed at, and the same entry twice', () => {
    expect(checkChoices([{
      key: 'monitor'
    }], 2, {
      hasTarget: false
    }).reason).toBe('noTarget')
    expect(checkChoices([{
      key: 'silentNearby'
    }], 1, {
      hasTarget: false
    }).ok).toBe(true)
    expect(checkChoices([{
      key: 'grid'
    }, {
      key: 'grid'
    }], 2).reason).toBe('twice')
  })

  it('takes two different attributes as two pieces, and refuses an unknown one', () => {
    expect(checkChoices([{
      key: 'attribute', param: 'attack'
    }, {
      key: 'attribute', param: 'firewall'
    }], 2).ok).toBe(true)
    expect(checkChoices([{
      key: 'attribute', param: 'magic'
    }], 2).reason).toBe('unknown')
    expect(checkChoices([], 2).reason).toBe('empty')
  })
})

describe('the register of what the observer knows', () => {
  const about = {
    uuid: 'Actor.g.Item.c', holder: 'Actor.g', name: 'Oreillette', time: 50
  }

  it('keeps a uuid as a key with no dot, which an update would read as a path', () => {
    expect(intelKey('Actor.g.Item.c')).toBe('Actor_g_Item_c')
    expect(intelFor({
      Actor_g_Item_c: {
        spotted: true
      }
    }, 'Actor.g.Item.c')).toEqual({
      spotted: true
    })
  })

  it('spots the icon on any answer (SR5 p. 237), and keeps what the crown draws', () => {
    const entry = intelEntry(null, [answer('monitor'), answer('marks'), answer('grid')], about)
    expect(entry).toEqual({
      ...about, spotted: true, monitor: {
        damage: 3, boxes: 10
      }, marks: 3
    })
    expect(spottedUuids({
      [intelKey(about.uuid)]: entry
    })).toEqual(['Actor.g.Item.c'])
  })

  it('keeps what it knew when another perception asks something else', () => {
    const first = intelEntry(null, [answer('monitor')], about)
    const second = intelEntry(first, [answer('marks')], about)
    expect(second.monitor).toEqual({
      damage: 3, boxes: 10
    })
    expect(second.marks).toBe(3)
  })

  it('loses sight of an actor\'s icons when it reboots, jacks out, or hides (SR5 p. 236)', () => {
    const intel = {
      a: {
        uuid: 'Actor.g.Item.c', holder: 'Actor.g', spotted: true
      },
      b: {
        uuid: 'Actor.g.Item.d', holder: 'Actor.g', spotted: true
      },
      c: {
        uuid: 'Actor.h.Item.e', holder: 'Actor.h', spotted: true
      },
    }
    const after = forgetHolder(intel, 'Actor.g')
    expect(Object.keys(after)).toEqual(['c'])
    expect(spottedUuids(after)).toEqual(['Actor.h.Item.e'])
  })

  it('writes only what changed, and deletes what is gone', () => {
    const before = {
      a: {
        spotted: true
      }, b: {
        spotted: true
      }
    }
    expect(intelUpdateData(before, {
      a: {
        spotted: true
      }, c: {
        spotted: true
      }
    })).toEqual({
      'flags.sr5.matrixIntel.-=b': null, 'flags.sr5.matrixIntel.c': {
        spotted: true
      }
    })
    expect(intelUpdateData(before, before)).toBeNull()
    expect(intelUpdateData(before, {
    })).toEqual({
      'flags.sr5.matrixIntel.-=a': null, 'flags.sr5.matrixIntel.-=b': null
    })
  })
})
