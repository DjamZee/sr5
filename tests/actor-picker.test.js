import {
  describe, it, expect
} from 'vitest'
import {
  foldKey, actorKind, visibleIds, folderTree
} from '../modules/interface/actor-picker.js'

const entries = [
  {
    id: 'a', name: 'Détective vampire', kind: 'npc', folderId: 'pnj'
  },
  {
    id: 'b', name: 'Adepte tireur d’élite', kind: 'pc', folderId: 'arch'
  },
  {
    id: 'c', name: 'Goule (ork)', kind: 'grunt', folderId: 'brutes'
  },
  {
    id: 'd', name: 'Zoé', kind: 'pc', folderId: null
  },
  {
    id: 'e', name: 'Égoutier', kind: 'grunt', folderId: 'gone'
  },
]
const folders = [
  {
    id: 'root', name: 'Essai', parentId: null
  },
  {
    id: 'pj', name: 'PJ', parentId: 'root'
  },
  {
    id: 'arch', name: 'Archétypes', parentId: 'pj'
  },
  {
    id: 'pnj', name: 'PNJ', parentId: 'root'
  },
  {
    id: 'brutes', name: 'Brutes', parentId: 'pnj'
  },
  {
    id: 'vide', name: 'Vide', parentId: 'root'
  },
]

describe('the search of the actor picker', () => {
  it('ignores accents, case and extra blanks', () => {
    expect(foldKey('  Détective   VAMPIRE ')).toBe('detective vampire')
    expect(foldKey('Égoutier')).toBe('egoutier')
  })
  it('keeps the names holding every word typed', () => {
    expect([...visibleIds(entries, {
      query: 'DETECTIVE'
    })]).toEqual(['a'])
    expect([...visibleIds(entries, {
      query: 'élite tireur'
    })]).toEqual(['b'])
    expect([...visibleIds(entries, {
      query: 'egou'
    })]).toEqual(['e'])
  })
  it('shows everything with an empty search', () => {
    expect(visibleIds(entries, {
      query: '  '
    }).size).toBe(5)
  })
  it('filters by kind', () => {
    expect([...visibleIds(entries, {
      kind: 'grunt'
    })]).toEqual(['c', 'e'])
    expect([...visibleIds(entries, {
      kind: 'pc', query: 'zoe'
    })]).toEqual(['d'])
  })
  it('keeps the chosen actors whatever the filter says', () => {
    expect([...visibleIds(entries, {
      query: 'goule', kind: 'grunt', keep: ['b']
    })]).toEqual(['b', 'c'])
  })
})

describe('the kind of an actor', () => {
  it('tells the player characters from the non-player ones and the grunts', () => {
    expect(actorKind({
      type: 'actorPc', hasPlayerOwner: true
    })).toBe('pc')
    expect(actorKind({
      type: 'actorPc', hasPlayerOwner: false
    })).toBe('npc')
    expect(actorKind({
      type: 'actorGrunt'
    })).toBe('grunt')
    expect(actorKind({
      type: 'actorDrone'
    })).toBe('other')
  })
})

describe('the folder tree of the actor picker', () => {
  const tree = folderTree(entries, folders)
  it('nests the folders, sorted by name, and puts the actors without folder last', () => {
    expect(tree.map(n => n.id)).toEqual(['root', null])
    const root = tree[0]
    expect(root.folders.map(n => n.name)).toEqual(['PJ', 'PNJ'])
    expect(root.folders[0].folders[0].actors.map(e => e.id)).toEqual(['b'])
    expect(root.folders[1].actors.map(e => e.id)).toEqual(['a'])
    expect(root.folders[1].folders[0].actors.map(e => e.id)).toEqual(['c'])
    expect(root.folders[1].folders[0].depth).toBe(2)
  })
  it('counts the actors under each folder, sub-folders included', () => {
    expect(tree[0].count).toBe(3)
    expect(tree[0].folders[1].count).toBe(2)
  })
  it('leaves out the empty folders', () => {
    expect(tree[0].folders.some(n => n.id === 'vide')).toBe(false)
  })
  it('puts an actor whose folder is missing with the ones without folder', () => {
    // Sorted as the locale reads it: « Égoutier » before « Zoé »
    expect(tree[1].actors.map(e => e.id)).toEqual(['e', 'd'])
  })
  it('survives a folder that is its own parent', () => {
    const loop = folderTree([{
      id: 'x', name: 'X', folderId: 'f'
    }], [{
      id: 'f', name: 'F', parentId: 'f'
    }])
    expect(loop.map(n => n.id)).toEqual(['f'])
    expect(loop[0].count).toBe(1)
  })
})
