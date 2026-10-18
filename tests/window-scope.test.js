import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/system/utilitySystem.js', () => ({
  SR5_SystemHelpers: {
  }, SR5_UiModifications: {
  } 
}))
vi.mock('../modules/helpers/enhance-selects.js', () => ({
  enhanceSelects: vi.fn() 
}))
vi.mock('../modules/interface/scene-indicators.js', () => ({
  arrangePlayersPanel: vi.fn() 
}))

const {
  isForeignWindow, getCoreApplicationClasses, sr5HookMarkForeignWindow, FOREIGN_WINDOW_CLASS 
} = await import('../modules/hooks/window-scope.js')
const {
  sr5HookRenderDialog 
} = await import('../modules/hooks/render-ui.js')
const {
  enhanceSelects 
} = await import('../modules/helpers/enhance-selects.js')

// A window element: its classes, its id, and :has() never matching
const el = (classes, id = '') => {
  const set = new Set(classes)
  return {
    id,
    classList: {
      contains: c => set.has(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)), [Symbol.iterator]: () => set[Symbol.iterator]() 
    },
    matches: sel => sel.split(',').some(s => s.trim().startsWith('.') && set.has(s.trim().slice(1))),
    has: c => set.has(c),
  }
}

// Foundry's classes, as in its namespaces
class ApplicationV2 { static DEFAULT_OPTIONS = {
  classes: [] 
} }
class DialogV2 extends ApplicationV2 { static DEFAULT_OPTIONS = {
  classes: ['dialog'] 
} }
class SettingsConfig extends ApplicationV2 { static DEFAULT_OPTIONS = {
  classes: ['category-browser'] 
} }
class Dialog { static get defaultOptions() { return {
  classes: ['dialog'] 
} } }
const core = getCoreApplicationClasses([{
  api: {
    ApplicationV2, DialogV2 
  }, settings: {
    SettingsConfig 
  } 
}, {
  api: {
    Dialog 
  } 
}])

const app = (Cls, classes) => Object.assign(new Cls(), {
  options: {
    classes 
  } 
})

describe('windows the theme dresses (P1, 16/10)', () => {
  it('reads Foundry classes from its namespaces', () => {
    expect([...core]).toEqual(expect.arrayContaining([ApplicationV2, DialogV2, SettingsConfig, Dialog]))
  })

  it("dresses Foundry's own windows, whatever classes they add as they go", () => {
    expect(isForeignWindow(app(SettingsConfig, ['category-browser']), el(['application', 'category-browser', 'themed', 'theme-dark']), core)).toBe(false)
    expect(isForeignWindow(app(DialogV2, ['dialog']), el(['application', 'dialog', 'sr-skin-dialog']), core)).toBe(false)
    expect(isForeignWindow(app(Dialog, ['dialog']), el(['app', 'window-app', 'dialog', 'themed', 'theme-light']), core)).toBe(false)
    expect(isForeignWindow(app(SettingsConfig, ['category-browser']), el(['application', 'category-browser', 'edit-mode']), core)).toBe(false)
    const deck = Object.assign(app(SettingsConfig, ['category-browser', 'deck']), {
      document: {
        type: 'deck', documentName: 'Cards' 
      } 
    })
    expect(isForeignWindow(deck, el(['application', 'category-browser', 'deck']), core)).toBe(false)
  })

  it("leaves a module's window alone (its own class, or Foundry's with classes of its own)", () => {
    class FenetreReglages extends ApplicationV2 {}
    expect(isForeignWindow(app(FenetreReglages), el(['application', 'sfx-sr5-reglages']), core)).toBe(true)
    expect(isForeignWindow(app(Dialog, ['dialog', 'simple-quest-welcome-screen']), el(['app', 'window-app', 'dialog', 'themed', 'theme-light', 'simple-quest-welcome-screen']), core)).toBe(true)
    expect(isForeignWindow(app(DialogV2, ['dialog', 'matrice-sr5']), el(['application', 'dialog', 'matrice-sr5']), core)).toBe(true)
  })

  it("never marks the system's windows, nor the modules it dresses on purpose", () => {
    class ShopWindow extends ApplicationV2 {}
    expect(isForeignWindow(app(ShopWindow), el(['application', 'sr5', 'sr-application', 'sr-shop-window']), core)).toBe(false)
    expect(isForeignWindow(app(ShopWindow), el(['application'], 'sr5-calendar-clock'), core)).toBe(false)
    class GMNote extends ApplicationV2 {}
    expect(isForeignWindow(app(GMNote), el(['app', 'window-app', 'gm-notes']), core)).toBe(false)
  })

  it('never marks a tab of the sidebar, nor the pause (DjamZ, 19/10)', () => {
    class ActorDirectory extends ApplicationV2 { static DEFAULT_OPTIONS = {
      classes: ['tab', 'sidebar-tab', 'directory', 'flexcol']
    } }
    class SR5ItemDirectory extends ActorDirectory {}
    const tabs = getCoreApplicationClasses([{
      sidebar: {
        ActorDirectory
      }
    }])
    expect(isForeignWindow(app(ActorDirectory, ['tab', 'sidebar-tab', 'directory', 'flexcol', 'actors-sidebar']), el(['tab', 'sidebar-tab', 'directory', 'flexcol', 'actors-sidebar', 'active']), tabs)).toBe(false)
    expect(isForeignWindow(app(SR5ItemDirectory, ['tab', 'sidebar-tab', 'items-sidebar']), el(['tab', 'sidebar-tab', 'items-sidebar']), tabs)).toBe(false)
    expect(isForeignWindow(app(ApplicationV2, []), el(['paused']), core)).toBe(false)
  })

  it('the render hook puts and takes the mark', () => {
    class Foreign extends ApplicationV2 {}
    const e = el(['application', 'gg'])
    sr5HookMarkForeignWindow(Object.assign(new Foreign(), {
      element: e 
    }), e)
    expect(e.has(FOREIGN_WINDOW_CLASS)).toBe(true)
  })

  it('marks a window drawn as a <form>, whose [0] is its first field (sfx-sr5, Dice So Nice)', () => {
    class Foreign extends ApplicationV2 {}
    const form = Object.assign(el(['application', 'sfx-sr5-reglages']), {
      0: {
        tagName: 'INPUT' 
      } 
    })
    sr5HookMarkForeignWindow(Object.assign(new Foreign(), {
      element: form 
    }), form)
    expect(form.has(FOREIGN_WINDOW_CLASS)).toBe(true)
  })
})

describe('renderDialog, a V1 hook (P2, 16/10)', () => {
  it('takes the jQuery object Foundry gives, without throwing', () => {
    const input = {
      value: '', placeholder: 'nom', focus: vi.fn() 
    }
    const root = {
      querySelector: () => input 
    }
    const jq = {
      0: root, length: 1, jquery: '3.7.1' 
    }
    const dlg = Object.assign(new Dialog(), {
      element: jq, options: {
        classes: ['dialog'] 
      } 
    })
    globalThis.foundry = {
      applications: {
        api: {
          Dialog 
        } 
      } 
    }
    expect(() => sr5HookRenderDialog(dlg, jq)).not.toThrow()
    expect(enhanceSelects).toHaveBeenCalledWith(root)
  })
})
