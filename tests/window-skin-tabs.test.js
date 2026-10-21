import {
  describe, it, expect
} from 'vitest'
import less from 'less'
import {
  readFileSync
} from 'node:fs'
import {
  fileURLToPath
} from 'node:url'

// Petits correctifs du 22/10: the tabs of the windows the SR5 theme dresses (window-skin.less, and the modules'
// windows, module-dress.less) were transparent, the window's ground showing through. They take the theme's panel, in
// the light set as in the dark; the windows the theme does not dress are left as they were.

const base = fileURLToPath(new URL('../styles/base.less', import.meta.url))
const {
  css 
} = await less.render(readFileSync(base, 'utf-8'), {
  filename: base
})

// Each rule as {selector, body}, the comments taken out
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({
    selector: selector.replace(/\s+/g, ' ').trim(), body
  }))
const ruleFor = test => rules.filter(rule => test(rule.selector))
// The selectors of a list, split on its own commas, not on those inside :is() or :not()
const selectorsOf = list => {
  const out = []
  let depth = 0, start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++
    else if (list[i] === ')') depth--
    else if (list[i] === ',' && !depth) {
      out.push(list.slice(start, i).trim())
      start = i + 1
    }
  }
  return [...out, list.slice(start).trim()]
}

describe('the tabs of the windows the SR5 theme dresses', () => {
  it('the band of tabs takes the panel, no longer transparent', () => {
    const band = ruleFor(s => s.includes('.sr-con') && selectorsOf(s).some(one => one.endsWith('> .window-content nav.tabs')))
    expect(band.length).toBeGreaterThan(0)
    for (const rule of band) {
      expect(rule.body).toContain('background: var(--srw-panel) !important')
      expect(rule.body).not.toContain('transparent !important')
    }
  })

  it('every tab, a, button or data-tab, on the panel; the active one tinted', () => {
    const tab = ruleFor(s => s.includes('.sr-con') && s.includes('nav.tabs > :is(a, .item, [data-tab])') && !s.includes('.active'))
    const active = ruleFor(s => s.includes('.sr-con') && s.includes('nav.tabs > :is(a, .item, [data-tab]).active'))
    expect(tab.some(rule => rule.body.includes('background: var(--srw-panel) !important'))).toBe(true)
    expect(active.some(rule => rule.body.includes('background: var(--srw-sel-bg) !important'))).toBe(true)
  })

  it('the settings windows and the module list: the band of tabs on the panel too', () => {
    const band = ruleFor(s => s.includes('#module-management') && s.includes('nav.tabs:not(.vertical)') && !s.includes('[data-tab]'))
    expect(band.length).toBeGreaterThan(0)
    for (const rule of band) expect(rule.body).toContain('background: var(--srw-panel) !important')
  })

  it('the modules\' dressed windows: their tabs on the panel, not !important, never a window with sr-dress-off', () => {
    const dressed = ruleFor(s => s.includes('.sr-dress-modules') && s.includes('.sr-foreign-window:not(.sr-dress-off)') && selectorsOf(s).some(one => one.endsWith(' nav.tabs [data-tab]')))
    const active = ruleFor(s => s.includes('.sr-dress-modules') && selectorsOf(s).some(one => one.endsWith(' nav.tabs [data-tab].active')))
    expect(dressed.some(rule => rule.body.includes('background-color: var(--srw-panel);'))).toBe(true)
    expect(active.some(rule => rule.body.includes('background-color: var(--srw-sel-bg);'))).toBe(true)
    for (const rule of [...dressed, ...active]) expect(rule.body).not.toContain('!important')
    // Every rule that paints a module's tabs is behind the setting's body class and leaves sr-dress-off out
    // (window.less names them only to leave them out: :not(.sr-foreign-window))
    const paintsAModule = one => one.replaceAll(':not(.sr-foreign-window)', '').includes('.sr-foreign-window')
    for (const rule of ruleFor(s => s.includes('[data-tab]'))) {
      if (!/background/.test(rule.body)) continue
      for (const one of selectorsOf(rule.selector).filter(paintsAModule)) {
        expect(one).toContain('.sr-dress-modules')
        expect(one).toContain(':not(.sr-dress-off)')
      }
    }
  })

  it('the dark set keeps the same variables: the panel follows the theme', () => {
    const dark = ruleFor(s => s.includes('.theme-dark') && s.includes('.sr-con'))
    expect(dark.some(rule => rule.body.includes('--srw-panel: #0f1828'))).toBe(true)
  })
})
