import {
  attitudeShift, shiftAttitude, scoreOf
} from "./faction-rules.js"
import {
  updateLedger
} from "../system/gm-ledger.js"

// Faction Reputation (Cutting Aces p. 156-160): one hidden world setting, written by the active
// gamemaster only. A player's client reads it (attitude of a social test, her own scores) but never
// writes it: who belongs to a faction and what a character is worth to it stay the gamemaster's.
//
// Shape: {factions: [{id, name, type, enemies: [id], members: [actorId], contacts: [itemUuid], note}],
//         log: [{id, factionId, actorId, reason, delta, pending, time, note}],
//         raises: {contactUuid: worldTime}}
// A score is the sum of the applied (not pending) movements: the log is the faction journal.
export const FACTIONS_SETTING = "sr5Factions"

const EMPTY = () => ({
  factions: [], log: [], raises: {
  }
})

export class SR5FactionRegistry {

  static register(){
    game.settings.register("sr5", FACTIONS_SETTING, {
      scope: "world", config: false, type: Object, default: EMPTY(),
      onChange: () => SR5FactionRegistry.#refresh(),
    })
  }

  static get data(){
    const raw = game.settings.get("sr5", FACTIONS_SETTING) ?? {
    }
    return {
      factions: raw.factions ?? [], log: raw.log ?? [], raises: raw.raises ?? {
      }
    }
  }

  static get canWrite(){
    return !!game.user?.isActiveGM
  }

  /**
   * Applies a change to a copy of the registry and saves it. Refused, with a warning, off the active GM.
   * @param {(data:object) => void} mutate
   */
  /**
   * True, with a warning, when this user may not write the registry (not the active gamemaster).
   * Every action that changes something calls it first, before any other effect.
   */
  static refuse(){
    if (this.canWrite) return false
    ui.notifications?.warn(game.i18n.localize("SR5.FACTION_OnlyGM"))
    return true
  }

  static async update(mutate){
    if (this.refuse()) return false
    // In the registry's turn, on its latest state (gm-ledger.js)
    return updateLedger(FACTIONS_SETTING, raw => {
      const data = {
        factions: raw.factions ?? [], log: raw.log ?? [], raises: raw.raises ?? {
        }
      }
      mutate(data)
      return data
    })
  }

  static faction(id){
    return this.data.factions.find(f => f.id === id) ?? null
  }

  static factionOfActor(actorId){
    if (!actorId) return null
    return this.data.factions.find(f => f.members?.includes(actorId)) ?? null
  }

  static factionOfContact(uuid){
    if (!uuid) return null
    return this.data.factions.find(f => f.contacts?.includes(uuid)) ?? null
  }

  static score(factionId, actorId){
    return scoreOf(this.data.log, factionId, actorId)
  }

  /**
   * A character's standing with each faction she has dealt with (a movement in the log).
   */
  static standing(actorId){
    const {
      factions, log
    } = this.data
    return factions
      .filter(f => log.some(e => e.factionId === f.id && e.actorId === actorId))
      .map(f => {
        const score = scoreOf(log, f.id, actorId)
        return {
          id: f.id, name: f.name, score, shift: attitudeShift(score),
          pending: log.filter(e => e.pending && e.factionId === f.id && e.actorId === actorId)
            .reduce((s, e) => s + (Number(e.delta) || 0), 0),
        }
      })
  }

  /**
   * The default NPC attitude of a social test (SR5 p. 142), moved by the character's Faction
   * Reputation with the target's faction (CA p. 160). Null when the target has no faction.
   */
  static attitudeFor(actorId, targetActor){
    const faction = this.factionOfActor(targetActor?.id)
    if (!faction || !actorId) return null
    const score = this.score(faction.id, actorId)
    const shift = attitudeShift(score)
    return {
      faction: faction.name, score, shift, attitude: shiftAttitude("neutral", shift)
    }
  }

  static #refresh(){
    for (const app of foundry.applications.instances.values()){
      if (app.rendered && (app.id === "sr5-factions" || app.document?.type === "actorPc")) app.render()
    }
  }
}
