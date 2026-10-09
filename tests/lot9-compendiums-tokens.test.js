import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  cleanTokenDefaults, cleanTokenRow, tokenDataOf, tokenFamily, TOKEN_FAMILIES
} from '../modules/system/token-defaults.js'

const CONSTS = {
  TOKEN_DISPOSITIONS: {
    SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1
  },
  TOKEN_DISPLAY_MODES: {
    NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50
  },
}

describe('token of what the system creates (lot 9)', () => {
  it('sorts the actors into families, IC apart from the other devices', () => {
    expect(tokenFamily('actorSpirit')).toBe('spirit')
    expect(tokenFamily('actorSprite')).toBe('sprite')
    expect(tokenFamily('actorDevice', 'ice')).toBe('ice')
    expect(tokenFamily('actorDevice', 'host')).toBe('device')
    expect(tokenFamily('actorDrone')).toBe('drone')
    expect(tokenFamily('actorAgent')).toBe('agent')
    // The system gives these their token alone
    expect(tokenFamily('actorPc')).toBeNull()
    expect(tokenFamily('actorGrunt')).toBeNull()
    expect(tokenFamily('actorStorage')).toBeNull()
  })

  it('changes nothing by default: an empty setting gives empty rows', () => {
    const rows = cleanTokenDefaults({
    })
    expect(Object.keys(rows)).toEqual(TOKEN_FAMILIES)
    for (const family of TOKEN_FAMILIES) expect(tokenDataOf(rows[family], CONSTS)).toEqual({
    })
    expect(cleanTokenDefaults(null).spirit).toEqual({
    })
  })

  it('keeps known values, in their limits, and drops the rest', () => {
    expect(cleanTokenRow({
      size: '25', disposition: 'HOSTILE', displayName: 'nope', bar1: 'statusBars.matrix', sight: 'off',
      sightRange: '-3', foo: 'bar', bar2: ''
    })).toEqual({
      size: 10, disposition: 'HOSTILE', bar1: 'statusBars.matrix', sight: 'off', sightRange: 0
    })
  })

  it('turns a row into token data', () => {
    expect(tokenDataOf({
      size: 0.5, disposition: 'FRIENDLY', displayName: 'HOVER', displayBars: 'ALWAYS', bar1: 'none',
      bar2: 'statusBars.stun', sight: 'on', sightRange: 30
    }, CONSTS)).toEqual({
      width: 0.5, height: 0.5, disposition: 1, displayName: 30, displayBars: 50, 'bar1.attribute': null,
      'bar2.attribute': 'statusBars.stun', 'sight.enabled': true, 'sight.range': 30
    })
  })
})

describe('compendium browser: fields asked of a pack (lot 9)', () => {
  let browserIndexFields
  beforeAll(async () => {
    globalThis.foundry.utils.hasProperty ??= (obj, key) => {
      let target = obj
      for (const part of key.split('.')) {
        if (target === null || typeof target !== 'object' || !(part in target)) return false
        target = target[part]
      }
      return true
    }
    globalThis.foundry.applications ??= {
    }
    globalThis.foundry.applications.api ??= {
    }
    globalThis.foundry.applications.api.ApplicationV2 ??= class {}
    globalThis.foundry.applications.api.HandlebarsApplicationMixin ??= Base => class extends Base {}
    ;({
      browserIndexFields
    } = await import('../modules/interface/compendium-browser.js'))
  })

  const pack = (documentName, index) => ({
    documentName, index
  })

  it('asks nothing of a pack without subtyped entries, nor of journals', () => {
    expect(browserIndexFields(pack('Item', [{
      type: 'itemSpell'
    }, {
      type: 'itemQuality'
    }]), true)).toEqual([])
    expect(browserIndexFields(pack('JournalEntry', [{
      name: 'x'
    }]), false)).toEqual([])
  })

  it('asks for the subtype field of a pack holding weapons, unless its index already carries it', () => {
    expect(browserIndexFields(pack('Item', [{
      type: 'itemWeapon'
    }]), true)).toEqual(['system.category'])
    expect(browserIndexFields(pack('Item', [{
      type: 'itemWeapon', system: {
        category: 'meleeWeapon'
      }
    }]), true)).toEqual([])
  })

  it('asks for the prototype flag for a player only', () => {
    const spells = pack('Item', [{
      type: 'itemSpell'
    }])
    expect(browserIndexFields(spells, true)).toEqual([])
    expect(browserIndexFields(spells, false)).toEqual(['flags.sr5.notForSale'])
    expect(browserIndexFields(pack('Item', [{
      type: 'itemSpell', flags: {
      }
    }]), false)).toEqual([])
  })
})
