import {
  it, expect 
} from 'vitest'
import {
  SR5_MiscellaneousHelpers as H 
} from '../modules/rolls/roll-helpers/miscellaneous.js'

//G12, Rosine's review: every order of actions against the budget of the pass. Budget: es extra simples (simple only), ec extra complexes, plus one base (2 simple OR 1 complex).
// A sequence fits iff some assignment works: brute-force feasibility.
function fits(seq, es, ec){
  const go = (i, es, ec, baseS) => { // baseS: base simples left (2 = untouched, 0 = gone)
    if (i === seq.length) return true
    if (seq[i] === 'S') return (es > 0 && go(i + 1, es - 1, ec, baseS)) || (baseS > 0 && go(i + 1, es, ec, baseS - 1))
    return (ec > 0 && go(i + 1, es, ec - 1, baseS)) || (baseS === 2 && go(i + 1, es, ec, 0))
  }
  return go(0, es, ec, 2)
}
const counters = (es, ec) => ({
  free: {
    value: 1, current: 1 
  }, simple: {
    value: 2 + es, current: 2 + es 
  }, complex: {
    value: 1 + ec, current: 1 + ec 
  } 
})
const act = t => ({
  type: t === 'S' ? 'simple' : 'complex', value: 1, source: 'x' 
})

it('every order of 1 to 4 actions: refused exactly when it does not fit', () => {
  const bad = []
  for (const [es, ec] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]) {
    const seqs = [[]]
    for (let n = 0; n < 4; n++) for (const s of seqs.splice(0)) seqs.push(s.concat('S'), s.concat('C'), s)
    const uniq = [...new Set(seqs.filter(s => s.length).map(s => s.join('')))]
    for (const s of uniq) {
      const missing = H.missingAction([...s].map(act), counters(es, ec))
      if (!!missing === fits([...s], es, ec)) bad.push(`es${es} ec${ec} ${s} missing=${!!missing}`)
    }
  }
  expect(bad).toEqual([])
})
