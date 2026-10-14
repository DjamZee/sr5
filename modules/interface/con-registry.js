import {
  ACTIVE_STATUSES, openRolledSteps, propTotal
} from "../system/con-rules.js"
import {
  updateLedger
} from "../system/gm-ledger.js"

// Using Con (Cutting Aces p. 162-164): the cons under way, in one hidden world setting written by the active
// gamemaster only, like the factions (faction-registry.js). A player's client reads it (the roll dialog offers
// the steps of her own cons) but never writes it.
//
// Shape: {cons: [{id, name, kind: "short"|"long", artistIds: [actorId], targetId, targetName, intel,
//   props: [{id, name, rating, origin}], fabrication: {name, wanted, hits}, matrixDegree, status,
//   steps: [{id, step, net, intel, outcome, note, time}], start, end}]}
export const CONS_SETTING = "sr5Cons"

const EMPTY = () => ({
  cons: []
})

export class SR5ConRegistry {

  static register(){
    game.settings.register("sr5", CONS_SETTING, {
      scope: "world", config: false, type: Object, default: EMPTY(),
      onChange: () => SR5ConRegistry.#refresh(),
    })
  }

  static get data(){
    const raw = game.settings.get("sr5", CONS_SETTING) ?? {
    }
    return {
      cons: raw.cons ?? []
    }
  }

  static get canWrite(){
    return !!game.user?.isActiveGM
  }

  /**
   * True, with a warning, when this user may not write the registry (not the active gamemaster).
   */
  static refuse(){
    if (this.canWrite) return false
    ui.notifications?.warn(game.i18n.localize("SR5.CON_OnlyGM"))
    return true
  }

  static async update(mutate){
    if (this.refuse()) return false
    // In the registry's turn, on its latest state (gm-ledger.js)
    return updateLedger(CONS_SETTING, raw => {
      const data = {
        cons: raw.cons ?? []
      }
      mutate(data)
      return data
    })
  }

  static con(id){
    return this.data.cons.find(c => c.id === id) ?? null
  }

  /**
   * The cons an actor runs that still offer a step rolled with Con, for her roll dialog.
   * @returns {Array<{id, name, kind, steps: string[], props: number}>}
   */
  static openFor(actorId){
    if (!actorId) return []
    return this.data.cons
      .filter(c => ACTIVE_STATUSES.includes(c.status) && c.artistIds?.includes(actorId))
      .map(c => ({
        id: c.id, name: c.name, kind: c.kind, steps: openRolledSteps(c), props: propTotal(c.props), targetId: c.targetId ?? null
      }))
      .filter(c => c.steps.length)
  }

  static #refresh(){
    const app = foundry.applications.instances.get("sr5-con-tracker")
    if (app?.rendered) app.render()
  }
}
