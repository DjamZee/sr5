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

  it("une boucle déjà enregistrée ne fait pas tourner le calcul sans fin", () => {
    const a = host("a", "Actor.b"), b = host("b", "Actor.a"), c = host("c")
    const all = [a, b, c]
    const resolve = key => all.find(h => h.uuid === key) ?? null
    expect(hostMasterCandidates(c, all, resolve).map(h => h.id)).toEqual(["a", "b"])
  })
})
