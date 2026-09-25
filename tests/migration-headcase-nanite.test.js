import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.hoisted(() => {
  globalThis.foundry.applications.hud = {
    TokenHUD: class {}
  }
  globalThis.foundry.utils.isEmpty = (obj) => !obj || Object.keys(obj).length === 0
  // Same comparison as Foundry for the "13.0.0-alpha.N" versions used here
  globalThis.foundry.utils.isNewerVersion = (v0, v1) => v0.localeCompare(v1, undefined, {
    numeric: true
  }) > 0
})

vi.mock('../modules/interface/link-matches-tooltip.js', () => ({
  initLinkMatchesTooltip: () => {}
}))
vi.mock('../modules/interface/journal-heading-levels.js', () => ({
  sr5DeepenModuleTableOfContents: () => {}
}))

import Migration from '../modules/migration.js'
import {
  sr5HookReady
} from '../modules/hooks/ready.js'

// A head case created before the Nanite Volume existed: its Volume sits in Resonance
function headcase(resonance = 4, nanite = 0, items = [{
  type: 'itemDevice', system: {
    type: 'headcase'
  }
}]){
  const actor = {
    name: 'Défracté', type: 'actorPc',
    items,
    system: {
      activeSpecialAttribute: 'resonance',
      specialAttributes: {
        resonance: {
          natural: {
            base: resonance
          }
        },
        nanite: {
          natural: {
            base: nanite
          }
        },
      }
    },
    update: vi.fn(async (data) => {
      for (const [path, value] of Object.entries(data)) foundry.utils.setProperty(actor, path, value)
    }),
  }
  return actor
}

let settings, actors, tokens
function world(migratedTo){
  settings = {
    'sr5.systemMigrationVersion': migratedTo,
    'sr5.migrationHeadcaseNanite': false,
  }
  globalThis.game.user = {
    isGM: true
  }
  globalThis.game.settings = {
    get: (ns, key) => settings[`${ns}.${key}`],
    set: vi.fn(async (ns, key, value) => {
      settings[`${ns}.${key}`] = value
    }),
  }
  globalThis.game.system = {
    version: '13.0.0-alpha.25'
  }
  globalThis.game.actors = {
    contents: actors
  }
  globalThis.game.items = {
    contents: []
  }
  globalThis.game.packs = []
  globalThis.game.scenes = {
    contents: [{
      tokens: {
        contents: tokens
      }
    }]
  }
  globalThis.game.sr5 = {
    migration: Migration
  }
}

beforeEach(() => {
  actors = []
  tokens = []
  globalThis.document = {
    body: {
      classList: {
        add: () => {}
      }
    }
  }
  globalThis.canvas.hud = {
  }
  globalThis.ui.notifications.info ??= () => {}
})

describe('head case Nanite Volume migration', () => {
  it('runs in a world already migrated past the version threshold (alpha.25)', async () => {
    const pc = headcase(4)
    actors = [pc]
    world('13.0.0-alpha.25')
    sr5HookReady()
    await vi.waitFor(() => expect(settings['sr5.migrationHeadcaseNanite']).toBe(true))
    expect(pc.system.specialAttributes.nanite.natural.base).toBe(4)
    expect(pc.system.specialAttributes.resonance.natural.base).toBe(0)
    expect(pc.system.activeSpecialAttribute).toBe('nanite')
  })

  it('migrates an unlinked token of a head case, but not a linked one', async () => {
    const unlinked = headcase(3)
    const linked = headcase(5)
    tokens = [{
      actorLink: false, actor: unlinked
    }, {
      actorLink: true, actor: linked
    }]
    world('13.0.0-alpha.25')
    await new Migration().migrateHeadcaseNanite()
    expect(unlinked.system.specialAttributes.nanite.natural.base).toBe(3)
    expect(linked.update).not.toHaveBeenCalled()
  })

  it('leaves everyone else alone: technomancer, head case already migrated', async () => {
    const technomancer = headcase(4, 0, [])
    const done = headcase(0, 4)
    actors = [technomancer, done]
    world('13.0.0-alpha.25')
    await new Migration().migrateHeadcaseNanite()
    expect(technomancer.update).not.toHaveBeenCalled()
    expect(done.update).not.toHaveBeenCalled()
  })

  it('runs only once per world, and retries after a failure', async () => {
    const pc = headcase(4)
    pc.update.mockRejectedValueOnce(new Error('offline'))
    actors = [pc]
    world('13.0.0-alpha.25')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await new Migration().migrateHeadcaseNanite()).toBe(false)
    expect(settings['sr5.migrationHeadcaseNanite']).toBe(false)
    expect(await new Migration().migrateHeadcaseNanite()).toBe(true)
    expect(pc.system.specialAttributes.nanite.natural.base).toBe(4)
    pc.update.mockClear()
    expect(await new Migration().migrateHeadcaseNanite()).toBe(true)
    expect(pc.update).not.toHaveBeenCalled()
  })
})
