import {
  describe, it, expect, beforeEach, afterEach
} from 'vitest'
import {
  arViewAfter, codeOfLetter, codeTypingLetter, crownsToShow, keptDefaultArKey, PAN_AR_KEY_DEFAULT, registerPanArKey,
  registerPanOpeningSettings
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

  it('opens on hover (séance de DjamZ du 09/10), and the key toggles, by default; both for the user alone', () => {
    registerPanOpeningSettings()
    expect(registered.panCrownOpening.default).toBe('hover')
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
      globalThis.Hooks = {
        once: () => {},
        on: () => {}
      }
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
      delete globalThis.Hooks
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

// Foundry reads a key by its QWERTY place: on AZERTY the "m" is the Semicolon key (séance de DjamZ du 09/10)
describe('the key that types a letter', () => {
  it('finds the M of an AZERTY keyboard', () => {
    expect(codeOfLetter([['KeyM', ','], ['Semicolon', 'm']], 'm')).toBe('Semicolon')
  })
  it('keeps KeyM on QWERTY, and gives nothing without a layout', () => {
    expect(codeOfLetter([['KeyM', 'm']], 'm')).toBe('KeyM')
    expect(codeOfLetter(null, 'm')).toBe(null)
  })
  // Without a layout map (Firefox, Safari, an empty map in Chromium: relecture 161), the character typed tells the key
  it('reads the key that types "m" from a keydown, AZERTY or QWERTY', () => {
    expect(codeTypingLetter({
      key: 'm', code: 'Semicolon'
    }, 'm')).toBe('Semicolon')
    expect(codeTypingLetter({
      key: 'M', code: 'KeyM'
    }, 'm')).toBe('KeyM')
    expect(codeTypingLetter({
      key: ',', code: 'KeyM'
    }, 'm')).toBe(null)
    expect(codeTypingLetter({
      key: 'm', code: 'Semicolon', ctrlKey: true
    }, 'm')).toBe(null)
  })
  it('changes the key only when the default was kept', () => {
    expect(keptDefaultArKey([{
      key: PAN_AR_KEY_DEFAULT
    }])).toBe(true)
    expect(keptDefaultArKey([{
      key: PAN_AR_KEY_DEFAULT, modifiers: ['Shift']
    }])).toBe(false)
    expect(keptDefaultArKey([{
      key: 'KeyV'
    }])).toBe(false)
    expect(keptDefaultArKey(undefined)).toBe(false)
  })
})
