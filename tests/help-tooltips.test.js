import {
  describe, it, expect
} from 'vitest'
import {
  helpFromTooltip, tooltipsToHelp, fillHelpBubble
} from '../modules/interface/help-tooltips.js'

// Relecture djamz.13: the tooltips go into the help bubble when it is on and not already taken.

// A small stand-in for a DOM element: attributes, a parent, a text, and the dataset Foundry's sheets read
class FakeElement {
  constructor(attrs = {
  }, text = '', parent = null) {
    this.attrs = {
      ...attrs
    }
    this.textContent = text
    this.parentElement = parent
    this.children = []
    if (parent) parent.children.push(this)
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null }
  hasAttribute(name) { return name in this.attrs }
  setAttribute(name, value) { this.attrs[name] = String(value) }
  removeAttribute(name) { delete this.attrs[name] }
  appendChild(child) { this.children.push(child) }
  closest(selector) {
    const name = selector.slice(1, -1)
    for (let el = this; el; el = el.parentElement) if (el.hasAttribute(name)) return el
    return null
  }
  get dataset() {
    const out = {
    }
    for (const [k, v] of Object.entries(this.attrs)) if (k.startsWith('data-')) out[k.slice(5).toLowerCase().replace(/-/g, '')] = v
    return out
  }
  querySelectorAll() {
    const all = []
    const walk = el => { for (const c of el.children) { if (c.hasAttribute('data-tooltip') || c.hasAttribute('title')) all.push(c); walk(c) } }
    walk(this)
    return all
  }
}

describe('a tooltip moved into the help bubble', () => {
  it('takes the tooltip as the message, the short label as the title, and drops the floating tooltip', () => {
    const el = new FakeElement({
      'data-tooltip': 'SR5.SpiritWild_D'
    }, ' Sauvage ')
    expect(helpFromTooltip(el, key => key === 'SR5.SpiritWild_D' ? 'Esprit sauvage (Arcanes Interdites p. 170-172)' : key)).toBe(true)
    expect(el.getAttribute('data-helpTitle')).toBe('Sauvage')
    expect(el.getAttribute('data-helpMessage')).toBe('Esprit sauvage (Arcanes Interdites p. 170-172)')
    expect(el.getAttribute('data-helpPlain')).toBe('true')
    expect(el.hasAttribute('data-tooltip')).toBe(false)
  })

  it('reads a plain title too, and gives no title when the label is the text itself', () => {
    const el = new FakeElement({
      title: 'Puissance'
    }, 'Puissance')
    expect(helpFromTooltip(el)).toBe(true)
    expect(el.getAttribute('data-helpTitle')).toBe('')
    expect(el.hasAttribute('title')).toBe(false)
  })

  it('leaves an element that already fills the bubble, and its children', () => {
    const parent = new FakeElement({
      'data-helpTitle': 'Esprit lié', title: 'Esprit lié'
    })
    const child = new FakeElement({
      'data-tooltip': 'Équiper'
    }, '', parent)
    expect(helpFromTooltip(parent)).toBe(false)
    expect(helpFromTooltip(child)).toBe(false)
    expect(parent.getAttribute('title')).toBe('Esprit lié')
    expect(child.getAttribute('data-tooltip')).toBe('Équiper')
  })

  it('ignores an empty tooltip', () => {
    const el = new FakeElement({
      'data-tooltip': '  '
    })
    expect(helpFromTooltip(el)).toBe(false)
  })
})

describe('the whole sheet', () => {
  const sheet = () => {
    const root = new FakeElement()
    new FakeElement({
      'data-tooltip': 'a'
    }, 'A', root)
    new FakeElement({
      title: 'b'
    }, 'B', root)
    return root
  }

  it('moves every tooltip when the bubble is on', () => {
    expect(tooltipsToHelp(sheet(), true)).toBe(2)
  })

  it('changes nothing when the bubble is off', () => {
    const root = sheet()
    expect(tooltipsToHelp(root, false)).toBe(0)
    expect(root.children[0].getAttribute('data-tooltip')).toBe('a')
  })
})

describe('the bubble shows a moved tooltip as text', () => {
  it('never as markup: a tooltip may carry a name someone typed', () => {
    globalThis.document = {
      createElement: () => new FakeElement()
    }
    const el = new FakeElement({
      'data-helpTitle': '<b>x</b>', 'data-helpMessage': '<img src=x onerror=alert(1)>', 'data-helpPlain': 'true'
    })
    const title = {
      textContent: '', innerHTML: ''
    }
    const message = {
      replaceChildren(node) { this.node = node }, innerHTML: ''
    }
    fillHelpBubble(el, title, message)
    expect(title.textContent).toBe('<b>x</b>')
    expect(title.innerHTML).toBe('')
    expect(message.innerHTML).toBe('')
    expect(message.node.children[0].textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('keeps the markup of the help the templates write themselves', () => {
    const el = new FakeElement({
      'data-helpTitle': 'Titre', 'data-helpMessage': 'Message'
    })
    const title = {
      innerHTML: ''
    }
    const message = {
      innerHTML: ''
    }
    fillHelpBubble(el, title, message)
    expect(title.innerHTML).toBe('Titre')
    expect(message.innerHTML).toBe("<div class='helpMessage'><em>Message</em></div>")
  })
})
