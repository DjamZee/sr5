import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

import {
  signatureOf
} from '../modules/canvas/pan-crown/pan-layout.js'

// The defects of the crown found by the grouped review of Fleur (alpha 32df8eae6), one block per defect

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const LAYER = '../modules/canvas/pan-crown/pan-crown-layer.js'

const graphOf = (nodes = {
}) => ({
  master: 'Item.M',
  links: [{
    from: 'owner', to: 'Item.M', kind: 'persona'
  }],
  nodes: [{
    uuid: 'Item.M', kind: 'master', name: 'Commlink', mode: 'active', distance: 12, visibility: {
      visible: true, reason: 'inRange'
    }, ...nodes
  }],
})

describe('M1: a move lays the crowns out again, it does not build them again', () => {
  it('gives the same signature whatever the distance', () => {
    const token = {
      w: 100, h: 100
    }
    expect(signatureOf(graphOf({
      distance: 12
    }), token)).toBe(signatureOf(graphOf({
      distance: 80
    }), token))
  })

  it('changes the signature when what is seen changes', () => {
    const seen = signatureOf(graphOf())
    expect(signatureOf(graphOf({
      visibility: {
        visible: false, reason: 'outOfRange'
      }
    }))).not.toBe(seen)
    expect(signatureOf(graphOf({
      hiddenFromPlayers: true
    }))).not.toBe(seen)
    expect(signatureOf(graphOf({
      mode: 'silent'
    }))).not.toBe(seen)
    expect(signatureOf(graphOf({
      viewerMarks: 1
    }))).not.toBe(seen)
  })

  it('changes the signature when a line goes to another token, or the token changes size', () => {
    const graph = graphOf({
      kind: 'drone'
    })
    expect(signatureOf(graph, null, new Map([['Item.M', {
      id: 'A'
    }]]))).not.toBe(signatureOf(graph, null, new Map([['Item.M', {
      id: 'B'
    }]])))
    expect(signatureOf(graph, {
      w: 100, h: 100
    })).not.toBe(signatureOf(graph, {
      w: 200, h: 200
    }))
  })

  it('cannot tell a graph that does not turn into JSON: the crown is drawn again', () => {
    const graph = graphOf()
    graph.nodes[0].intel = {
    }
    graph.nodes[0].intel.self = graph.nodes[0].intel
    expect(signatureOf(graph)).toBeNull()
  })

  it('only places the crowns and lays their lines out at each frame of a move', () => {
    const source = read(LAYER)
    const body = source.slice(source.indexOf('  onRefreshToken(token){'), source.indexOf('  #settleLater(){'))
    // No build at each frame: neither refresh() nor getGraph
    expect(body).not.toMatch(/this\.refresh\(/)
    expect(body).not.toMatch(/getGraph/)
    expect(body).toMatch(/this\.#relayout\(other\)/)
    expect(body).toMatch(/this\.#settleLater\(\)/)
    // The end of the move builds again, softly: drawn again only if what is seen changed
    expect(source).toMatch(/this\.refresh\(null, \{\s*soft: true\s*\}\)/)
    expect(source).toMatch(/if \(soft && crown\.graph && signature !== null && signature === crown\.signature\)/)
  })

  it('makes the name of an icon the first time it is read, not at each build', () => {
    const source = read(LAYER)
    expect(source).toMatch(/let label = null/)
    expect(source).toMatch(/icon\.on\("pointerover", \(\) => \{\s*showLabel\(\)/)
  })
})
