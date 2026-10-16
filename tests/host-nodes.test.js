import {
  describe, expect, it 
} from "vitest"
import {
  hostMasterCandidates, hostNodesAllowed 
} from "../modules/system/host-nodes.js"

const host = (id, panMaster = "") => ({
  id, uuid: `Actor.${id}`, system: {
    matrix: {
      deviceType: "host", panMaster 
    } 
  } 
})

describe("serveurs asservis à d'autres serveurs (« nodes », hors livre, arbitrage de DjamZ)", () => {
  it("décoché par défaut, ou illisible : la règle du livre", () => {
    expect(hostNodesAllowed(() => undefined)).toBe(false)
    expect(hostNodesAllowed(() => { throw new Error("pas de réglages") })).toBe(false)
    expect(hostNodesAllowed(() => true)).toBe(true)
  })

  it("un serveur ne s'asservit ni à lui-même, ni à un serveur qui remonte déjà jusqu'à lui", () => {
    const a = host("a"), b = host("b", "Actor.a"), c = host("c", "Actor.b"), d = host("d")
    const all = [a, b, c, d]
    const resolve = key => all.find(h => h.uuid === key) ?? null
    expect(hostMasterCandidates(a, all, resolve).map(h => h.id)).toEqual(["d"])
    expect(hostMasterCandidates(c, all, resolve).map(h => h.id)).toEqual(["a", "b", "d"])
  })

  it("la fiche passe la copie de données de son acteur (_id, sans id) : la garde joue quand même", () => {
    const a = host("a"), b = host("b", "Actor.a"), d = host("d")
    const all = [a, b, d]
    const resolve = key => all.find(h => h.uuid === key) ?? null
    // Comme deviceSheet._prepareContext : context.actor est une copie de données, qui porte _id et pas id
    const sheetCopy = ({
      id, ...rest
    }) => ({
      _id: id, ...rest
    })
    expect(hostMasterCandidates(sheetCopy(a), all, resolve).map(h => h.id)).toEqual(["d"])
    expect(hostMasterCandidates(sheetCopy(b), all, resolve).map(h => h.id)).toEqual(["a", "d"])
  })

  it("une boucle déjà enregistrée ne fait pas tourner le calcul sans fin", () => {
    const a = host("a", "Actor.b"), b = host("b", "Actor.a"), c = host("c")
    const all = [a, b, c]
    const resolve = key => all.find(h => h.uuid === key) ?? null
    expect(hostMasterCandidates(c, all, resolve).map(h => h.id)).toEqual(["a", "b"])
  })
})
