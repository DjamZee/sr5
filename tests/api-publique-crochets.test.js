import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import fs from 'node:fs'

// config.js writes CONFIG.statusEffects while it is being imported
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  foundryHooks
} from './fixtures/foundry-hooks.js'
import {
  rollRemindersFor, vendorPriceFor, purchaseFundsVerdict, vendorRefusalFor, initiativeRemindersFor, situationalArmorFor,
  guardedCall, verdictCall
} from '../modules/system/house-rule-hooks.js'
import {
  fadingResistanceAttribute
} from '../modules/entities/actors/fading-resistance.js'
import {
  essenceCostFor
} from '../modules/system/implant-essence.js'
import {
  matrixMarkCap, matrixEffectiveMarks, hostEntryOffered, announceMarksChanged, announceOverwatchChanged
} from '../modules/system/matrix-hooks.js'
import {
  directConnectionVerdict
} from '../modules/rolls/roll-helpers/direct-connection.js'
import {
  contributeToGraph, applyVisibilityHooks, contributeActions
} from '../modules/canvas/pan-crown/pan-hooks.js'
import {
  administratorByHook
} from '../modules/system/matrix-ownership.js'
import {
  spiderByHook
} from '../modules/system/ice-sleuther.js'
import {
  announceMatrixAction
} from '../modules/system/matrix-api.js'

// Tests des API publiques (Inès, 22/10): every hook the system calls for the modules, against Foundry's own Hooks
// (tests/fixtures/foundry-hooks.js, whose callAll catches a subscriber's error and keeps what it wrote). For each one:
// without a subscriber, the book; a subscriber's answer, taken; an answer of the wrong kind, the book; a subscriber
// that writes then throws, the book, its answer thrown away, the others kept. The verdicts of the Matrix and of the
// crown went through Foundry's callAll until this lot: a module that set three marks to six, then failed, left six.

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const savedHooks = globalThis.Hooks
let error
beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  globalThis.Hooks = savedHooks
  error.mockRestore()
})

/** Foundry's Hooks, with these subscribers on this hook, as the game has them */
function subscribe(hook, ...fns) {
  globalThis.Hooks = foundryHooks({
    [hook]: fns
  })
  return globalThis.Hooks
}
const fails = () => {
  throw new Error('module')
}

const persona = {
  id: 'decker', name: 'Decker', system: {
    attributes: {
      willpower: {
      }, logic: {
      }
    }
  }
}
const host = {
  id: 'host', uuid: 'Actor.host'
}

/**
 * Each hook that hands a verdict: how the system asks it (`ask()`, which reads globalThis.Hooks), the book's answer,
 * a subscriber that answers something else (`set`), the answer then, and a value of the wrong kind (`bad`).
 */
const VERDICTS = [
  {
    hook: 'sr5.rollReminders', ask: () => rollRemindersFor(persona, {
      test: {
        type: 'skill'
      }
    }).map(line => line.label), book: [],
    set: data => data.reminders.push({
      label: 'Trait'
    }), answer: ['Trait'], bad: data => {
      data.reminders = 'texte'
    }
  },
  {
    hook: 'sr5.vendorPrice', ask: () => vendorPriceFor({
      price: 1000
    }).price, book: 1000,
    set: data => {
      data.price = 800.4
    }, answer: 800, bad: data => {
      data.price = -5
    }
  },
  {
    hook: 'sr5.purchaseFunds', ask: () => purchaseFundsVerdict({
      total: 500, balance: 100
    }).allow, book: false,
    set: data => {
      data.allow = true
    }, answer: true, bad: data => {
      data.allow = 'oui'
    }
  },
  {
    hook: 'sr5.vendorRefusal', ask: () => vendorRefusalFor({
    }).refuse, book: false,
    set: data => {
      data.refuse = true
    }, answer: true, bad: data => {
      data.refuse = 1
    }
  },
  {
    hook: 'sr5.initiativeReminders', ask: () => initiativeRemindersFor({
      round: 1, roll: 10
    }).score, book: 0,
    set: data => data.reminders.push({
      label: 'Sur ses gardes', score: 2
    }), answer: 2, bad: data => data.reminders.push({
      label: 'Trop', score: 11
    })
  },
  {
    hook: 'sr5.situationalArmor', ask: () => situationalArmorFor({
      armor: 9
    }).value, book: 0,
    set: data => data.bonuses.push({
      label: 'Champ cinétique', value: 4
    }), answer: 4, bad: data => data.bonuses.push({
      label: 'Champ', value: 21
    })
  },
  {
    hook: 'sr5.fadingResistance', ask: () => fadingResistanceAttribute(persona), book: 'willpower',
    set: data => {
      data.attribute = 'logic'
    }, answer: 'logic', bad: data => {
      data.attribute = 'edge'
    }
  },
  {
    hook: 'sr5.essenceCostFor', ask: () => essenceCostFor(persona, {
      type: 'itemAugmentation', name: 'Réflexes câblés'
    }, 5), book: 5,
    set: data => {
      data.cost = 2.5
    }, answer: 2.5, bad: data => {
      data.cost = Number.NaN
    }
  },
  {
    hook: 'sr5.matrixMarkCap', ask: () => matrixMarkCap({
      attacker: persona, target: host
    }), book: 3,
    set: verdict => {
      verdict.cap = 6
    }, answer: 6, bad: verdict => {
      verdict.cap = 0
    }
  },
  {
    hook: 'sr5.matrixEffectiveMarks', ask: () => matrixEffectiveMarks({
      viewer: persona, target: host, key: 'hackOnTheFly', marks: 1
    }), book: 1,
    set: verdict => {
      verdict.marks = 3
    }, answer: 3, bad: verdict => {
      verdict.marks = -1
    }
  },
  {
    hook: 'sr5.matrixHostEntry', ask: () => hostEntryOffered({
      actor: persona, host
    }), book: true,
    set: verdict => {
      verdict.offer = false
    }, answer: false, bad: verdict => {
      verdict.offer = 0
    }
  },
  {
    hook: 'sr5.matrixDirectConnection', ask: () => directConnectionVerdict(persona, host, false), book: false,
    set: (attacker, device, verdict) => {
      verdict.direct = true
    }, answer: true, bad: (attacker, device, verdict) => {
      verdict.direct = 'oui'
    }
  },
  {
    hook: 'sr5.matrixAdministrator', ask: () => administratorByHook({
      actor: persona, target: host, host
    }), book: null,
    set: verdict => {
      verdict.administrator = true
    }, answer: true, bad: verdict => {
      verdict.administrator = 'spider'
    }
  },
  {
    hook: 'sr5.iceLegitimateUser', ask: () => spiderByHook({
      roller: persona, ice: {
        id: 'ice'
      }, host
    }), book: false,
    set: verdict => {
      verdict.legitimate = true
    }, answer: true, bad: verdict => {
      verdict.legitimate = 1
    }
  },
  {
    hook: 'sr5.panCrownVisibility', ask: () => applyVisibilityHooks({
      uuid: 'Actor.cam'
    }, {
      isGM: false
    }, {
      visible: true, reason: 'owner'
    }).visible, book: true,
    set: (node, viewer, verdict) => {
      verdict.visible = false
    }, answer: false, bad: (node, viewer, verdict) => {
      verdict.visible = 0
    }
  },
  {
    hook: 'sr5.panCrownActions', ask: () => {
      const {
        greyed, added
      } = contributeActions({
        uuid: 'Actor.cam'
      }, {
        isGM: false
      }, [{
        key: 'hack', label: 'Hacker', enabled: true, tooltip: ''
      }])
      return [...greyed.keys(), ...added.map(entry => entry.key)]
    }, book: [],
    set: (node, viewer, entries) => {
      entries[0].enabled = false
      entries.push({
        key: 'zone', label: 'Zone', onClick: () => {}
      })
    }, answer: ['hack', 'zone'], bad: (node, viewer, entries) => entries.push({
      key: 'sans', label: 'Sans clic'
    })
  },
  {
    hook: 'sr5.panCrownGraph', ask: () => contributeToGraph({
      nodes: [{
        uuid: 'Actor.cam'
      }], links: []
    }).nodes.map(node => node.uuid), book: ['Actor.cam'],
    set: graph => {
      graph.nodes.push({
        uuid: 'zone.1'
      })
      graph.links.push({
        from: 'Actor.cam', to: 'zone.1'
      })
    }, answer: ['Actor.cam', 'zone.1'], bad: graph => graph.nodes.push({
      name: 'sans uuid'
    })
  },
]

describe('the verdict hooks, against Foundry\'s own Hooks', () => {
  for (const {
    hook, ask, book, set, answer, bad
  } of VERDICTS) {
    describe(hook, () => {
      it('without a subscriber: the book', () => {
        subscribe(hook)
        expect(ask()).toEqual(book)
        globalThis.Hooks = undefined
        expect(ask()).toEqual(book)
      })
      it('a subscriber\'s answer is taken, the hook heard once', () => {
        const hooks = subscribe(hook, set)
        expect(ask()).toEqual(answer)
        expect(hooks.seen).toEqual([hook])
      })
      it('an answer of the wrong kind: the book', () => {
        subscribe(hook, bad)
        expect(ask()).toEqual(book)
      })
      it('a subscriber that writes then throws: the book, its answer thrown away, the error logged', () => {
        const hooks = subscribe(hook, (...args) => {
          set(...args)
          fails()
        })
        expect(ask()).toEqual(book)
        expect(hooks.errors).toEqual([])
        expect(error).toHaveBeenCalled()
      })
      it('a subscriber that throws leaves the next one its say', () => {
        subscribe(hook, fails, set)
        expect(ask()).toEqual(answer)
        subscribe(hook, set, fails)
        expect(ask()).toEqual(answer)
      })
    })
  }
})

describe('the hooks that tell, against Foundry\'s own Hooks', () => {
  it('sr5.matrixMarksChanged and sr5.overwatchChanged: a subscriber that throws stops nothing', () => {
    const seen = []
    globalThis.Hooks = foundryHooks({
      'sr5.matrixMarksChanged': [fails, (...args) => seen.push(args)],
      'sr5.overwatchChanged': [fails, (...args) => seen.push(args)],
    })
    expect(() => announceMarksChanged(host, 'decker', 2, 1, 'hack')).not.toThrow()
    expect(() => announceOverwatchChanged(persona, 12, 8)).not.toThrow()
    expect(seen).toEqual([[host, 'decker', 2, 1, 'hack'], [persona, 12, 8]])
  })
  it('say nothing when nothing changed', () => {
    const hooks = foundryHooks({
      'sr5.matrixMarksChanged': () => {}, 'sr5.overwatchChanged': () => {}
    })
    globalThis.Hooks = hooks
    announceMarksChanged(host, 'decker', 2, 2)
    announceOverwatchChanged(persona, 8, 8)
    expect(hooks.seen).toEqual([])
  })
  it('sr5.matrixActionResolved: a copy, and a subscriber that throws stops nothing', () => {
    const entry = {
      actor: persona, card: {
        test: {
          typeSub: 'hackOnTheFly'
        }
      }, successes: 3, netHits: 2
    }
    let got
    globalThis.Hooks = foundryHooks({
      'sr5.matrixActionResolved': [fails, payload => {
        got = payload
      }]
    })
    expect(() => announceMatrixAction(entry)).not.toThrow()
    expect(got).toBeTruthy()
  })
  it('without Hooks at all: nothing thrown', () => {
    globalThis.Hooks = undefined
    expect(() => announceMarksChanged(host, 'decker', 1, 0)).not.toThrow()
    expect(() => announceOverwatchChanged(persona, 1, 0)).not.toThrow()
  })
})

describe('guardedCall and verdictCall, the calling of the hooks (house-rule-hooks.js)', () => {
  it('calls each subscriber with every argument, in order, a `once` one once', () => {
    const calls = []
    const hooks = foundryHooks()
    hooks.on('sr5.essai', (a, b) => calls.push(['on', a, b]))
    hooks.once('sr5.essai', (a, b) => calls.push(['once', a, b]))
    const verdict = {
      value: 1
    }
    const call = verdictCall(verdict, ['value'], hooks)
    call('sr5.essai', 'a', 'b')
    call('sr5.essai', 'c', 'd')
    expect(calls).toEqual([['on', 'a', 'b'], ['once', 'a', 'b'], ['on', 'c', 'd']])
  })
  it('logs an async subscriber\'s late error, and calls the others', async () => {
    const calls = []
    const hooks = foundryHooks({
      'sr5.essai': [async () => {
        throw new Error('tard')
      }, () => calls.push('suivant')]
    })
    expect(guardedCall('sr5.essai', [], () => null, () => {}, hooks)).toBe(true)
    await Promise.resolve()
    expect(calls).toEqual(['suivant'])
    expect(error).toHaveBeenCalled()
  })
  it('stops when the answer cannot be put back: the caller keeps the book', () => {
    const hooks = foundryHooks({
      'sr5.essai': [fails, () => {
        throw new Error('jamais appelé')
      }]
    })
    expect(guardedCall('sr5.essai', [], () => null, () => false, hooks)).toBe(false)
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('the system asks the verdicts through the guarded call, never Foundry\'s callAll', () => {
  const files = {
    '../modules/system/matrix-ownership.js': 'sr5.matrixAdministrator',
    '../modules/system/ice-sleuther.js': 'sr5.iceLegitimateUser',
    '../modules/canvas/pan-crown/pan-perception-card.js': 'sr5.matrixPerceptionInfo',
  }
  for (const [file, hook] of Object.entries(files)) {
    it(hook, () => {
      const source = read(file)
      expect(source).toContain(`verdictCall(`)
      expect(source).not.toMatch(new RegExp(`callAll\\?*\\.?\\(\\s*"${hook.replace('.', '\\.')}"`))
    })
  }
  it('the provider of sr5.matrixPerceptionInfo: its answers put back when it throws', () => {
    const context = {
      observer: persona, target: null, choices: [], answers: {
      }
    }
    const hooks = foundryHooks({
      'sr5.matrixPerceptionInfo': [data => {
        data.answers.file = 'faux'
        fails()
      }, data => {
        data.answers.host = 'Hôte de Renraku'
      }]
    })
    verdictCall(context, ['answers'], hooks)('sr5.matrixPerceptionInfo', context)
    expect(context.answers).toEqual({
      host: 'Hôte de Renraku'
    })
  })
})
