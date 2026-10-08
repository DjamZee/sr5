import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.hoisted(() => {
  globalThis.foundry.applications.hud = {
    TokenHUD: class {}
  }
})

vi.mock('../modules/interface/link-matches-tooltip.js', () => ({
  initLinkMatchesTooltip: () => {}
}))
vi.mock('../modules/interface/journal-heading-levels.js', () => ({
  sr5DeepenModuleTableOfContents: () => {}
}))

import {
  sr5WorldMigrationState
} from '../modules/hooks/ready.js'

// stored: the Setting document of the world (undefined when never written); value: what game.settings.get returns
function world({
  stored, value = '0', documents = 0
} = {
}) {
  globalThis.game.settings = {
    get: () => value,
    storage: new Map([['world', {
      getSetting: key => key === 'sr5.systemMigrationVersion' ? stored : undefined
    }]]),
  }
  for (const key of ['actors', 'items', 'scenes', 'journal']) globalThis.game[key] = {
    size: 0
  }
  globalThis.game.actors.size = documents
}

beforeEach(() => world())

describe('new world detection (systemMigrationVersion)', () => {
  it('a new world: nothing stored, Foundry returns the default cast to "0"', () => {
    world()
    expect(sr5WorldMigrationState()).toEqual({
      version: null, newWorld: true
    })
  })

  it('the same with the default as the number 0 or an empty string', () => {
    for (const value of [0, '']) {
      world({
        value
      })
      expect(sr5WorldMigrationState()).toEqual({
        version: null, newWorld: true
      })
    }
  })

  it('an existing world keeps its recorded version, and is not new', () => {
    world({
      stored: {
        value: '13.0.0-alpha.30'
      }, value: '13.0.0-alpha.30', documents: 5
    })
    expect(sr5WorldMigrationState()).toEqual({
      version: '13.0.0-alpha.30', newWorld: false
    })
  })

  it('an existing world still empty of documents is not new once the version is stored', () => {
    world({
      stored: {
        value: '13.0.0-alpha.30'
      }, value: '13.0.0-alpha.30'
    })
    expect(sr5WorldMigrationState().newWorld).toBe(false)
  })

  it('a world with documents but no record (made before the migrations) is not new, and migrates', () => {
    world({
      documents: 3
    })
    expect(sr5WorldMigrationState()).toEqual({
      version: null, newWorld: false
    })
  })

  it('a stored "0" is no version, but not a new world either', () => {
    world({
      stored: {
        value: '0'
      }
    })
    expect(sr5WorldMigrationState()).toEqual({
      version: null, newWorld: false
    })
  })
})
