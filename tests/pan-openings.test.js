import {
  describe, it, expect, beforeEach, afterEach
} from 'vitest'
import {
  arViewAfter, crownsToShow, PAN_AR_KEY_DEFAULT, registerPanArKey, registerPanOpeningSettings
} from '../modules/canvas/pan-crown/pan-openings.js'

// How the PAN crowns open (couronne du PAN, lot 8; decision 4 and Q8 of DjamZ, 07/10)

describe('the client settings of the openings', () => {
  let registered
  beforeEach(() => {
    registered = {
    }
    globalThis.game = {
      settings: {
        register: (scope, key, data) => registered[key] = data
      }
    }
  })
  afterEach(() => delete globalThis.game)

  it('opens by the HUD button only, and the key toggles, by default; both for the user alone', () => {
    registerPanOpeningSettings()
    expect(registered.panCrownOpening.default).toBe('hud')
    expect(Object.keys(registered.panCrownOpening.choices)).toEqual(['hud', 'hover', 'always'])
    expect(registered.panCrownArKey.default).toBe('toggle')
    expect(Object.keys(registered.panCrownArKey.choices)).toEqual(['toggle', 'hold'])
    expect(registered.panCrownOpening.scope).toBe('client')
    expect(registered.panCrownArKey.scope).toBe('client')
  })
})

describe('the key of the AR view', () => {
  it('toggles: each press shows or hides, the release changes nothing', () => {
    let view = false
    view = arViewAfter(view, 'down', 'toggle')
    expect(view).toBe(true)
    view = arViewAfter(view, 'up', 'toggle')
    expect(view).toBe(true)
    view = arViewAfter(view, 'down', 'toggle')
    expect(view).toBe(false)
    expect(arViewAfter(view, 'up', 'toggle')).toBe(false)
  })

  it('is held: shown on the press, hidden on the release', () => {
    expect(arViewAfter(false, 'down', 'hold')).toBe(true)
    expect(arViewAfter(true, 'up', 'hold')).toBe(false)
    expect(arViewAfter(true, 'down', 'hold')).toBe(true)
  })

  describe('in the controls of Foundry', () => {
    let binding, layer, behavior, focus
    beforeEach(() => {
      layer = {
        arView: false, setArView(v){
          this.arView = v
        }
      }
      behavior = 'toggle'
      focus = false
      globalThis.CONST = {
        KEYBINDING_PRECEDENCE: {
          NORMAL: 1
        }
      }
      globalThis.canvas = {
        sr5PanCrown: layer
      }
      globalThis.window ??= globalThis
      globalThis.window.addEventListener ??= () => {}
      globalThis.game = {
        keybindings: {
          register: (scope, key, data) => binding = data
        },
        keyboard: {
          get hasFocus(){
            return focus
          }
        },
        settings: {
          get: () => behavior
        },
      }
      registerPanArKey()
    })
    afterEach(() => {
      delete globalThis.game
      delete globalThis.canvas
      delete globalThis.CONST
    })

    it('is M by default, and does not repeat', () => {
      expect(PAN_AR_KEY_DEFAULT).toBe('KeyM')
      expect(binding.editable).toEqual([{
        key: 'KeyM'
      }])
      expect(binding.repeat).toBe(false)
    })

    it('toggles on the press', () => {
      binding.onDown()
      binding.onUp()
      expect(layer.arView).toBe(true)
      binding.onDown()
      expect(layer.arView).toBe(false)
    })

    it('held: down then up', () => {
      behavior = 'hold'
      binding.onDown()
      expect(layer.arView).toBe(true)
      binding.onUp()
      expect(layer.arView).toBe(false)
    })

    it('says nothing while a text field has the focus', () => {
      focus = true
      expect(binding.onDown()).toBe(false)
      expect(layer.arView).toBe(false)
    })
  })
})

describe('the crowns shown', () => {
  const tokenIds = ['a', 'b', 'c']

  it('by the HUD button: the ones opened by hand, on the scene', () => {
    expect([...crownsToShow({
      tokenIds, manual: new Set(['a', 'gone'])
    })]).toEqual(['a'])
  })

  it('on hover: also the token under the pointer, in that mode only', () => {
    expect(crownsToShow({
      tokenIds, hovered: 'b', mode: 'hover'
    }).has('b')).toBe(true)
    expect(crownsToShow({
      tokenIds, hovered: 'b', mode: 'hud'
    }).has('b')).toBe(false)
  })

  it('always visible, or in the AR view: every crown but the ones closed by hand', () => {
    expect([...crownsToShow({
      tokenIds, mode: 'always', dismissed: new Set(['c'])
    })].sort()).toEqual(['a', 'b'])
    expect([...crownsToShow({
      tokenIds, arView: true
    })].sort()).toEqual(['a', 'b', 'c'])
    expect(crownsToShow({
      tokenIds
    }).size).toBe(0)
  })
})
