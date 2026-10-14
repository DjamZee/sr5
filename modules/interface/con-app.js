import {
  SR5ConRegistry
} from "./con-registry.js"
import {
  SR5FactionRegistry
} from "./faction-registry.js"
import {
  FACTION_REASONS, longConPenalty
} from "./faction-rules.js"
import {
  CON_STEPS, MATRIX_DEGREES, ACTIVE_STATUSES, stepAllowed, netHits, intelDelta, evaluationTest, propFabrication,
  propAcquisition, propTotal, factionReasonOf, openRolledSteps
} from "../system/con-rules.js"

import {
  SR5BarterApp
} from "./barter-app.js"

const newId = () => foundry.utils.randomID()
const DAY = 86400

/**
 * The gamemaster's con tracker (Cutting Aces p. 162-164): the cons under way, their Intel Level and Prop
 * Rating, the preparation steps rolled here against the target, the steps rolled with Con from the con
 * artist's sheet (bait, reinforce, exit) written from their cards, and the Faction Reputation it leaves (p. 158).
 * The gamemaster keeps the hand on judgement: every figure can be set by hand.
 */
export class SR5ConApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-con-tracker",
    classes: ["sr5", "sr-application", "sr-con"],
    position: {
      width: 720, height: 760
    },
    window: {
      title: "SR5.CON_Title", icon: "fas fa-masks-theater", resizable: true
    },
    actions: {
      createCon: SR5ConApp.#createCon,
      selectCon: SR5ConApp.#selectCon,
      deleteCon: SR5ConApp.#deleteCon,
      setIntel: SR5ConApp.#setIntel,
      investigation: SR5ConApp.#investigation,
      oppose: SR5ConApp.#oppose,
      fabricate: SR5ConApp.#fabricate,
      acquire: SR5ConApp.#acquire,
      removeProp: SR5ConApp.#removeProp,
      recordRolled: SR5ConApp.#recordRolled,
      vanish: SR5ConApp.#vanish,
      factionMove: SR5ConApp.#factionMove,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/con-tracker.hbs", scrollable: [""]
    }
  }

  #selected = null

  static open(conId){
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("SR5.CON_OnlyGM"))
    const app = foundry.applications.instances.get("sr5-con-tracker") ?? new SR5ConApp()
    if (conId) app.#selected = conId
    return app.render({
      force: true
    })
  }

  static get people(){
    return game.actors.filter(a => a.type === "actorPc" || a.type === "actorGrunt").sort((a, b) => a.name.localeCompare(b.name))
  }

  get current(){
    const cons = SR5ConRegistry.data.cons
    return cons.find(c => c.id === this.#selected) ?? cons.find(c => ACTIVE_STATUSES.includes(c.status)) ?? cons[0] ?? null
  }

  async _prepareContext(options){
    const context = await super._prepareContext(options)
    const cons = SR5ConRegistry.data.cons
    const con = this.current
    const name = id => game.actors.get(id)?.name ?? "?"
    context.canWrite = SR5ConRegistry.canWrite
    context.people = SR5ConApp.people.map(a => ({
      id: a.id, name: a.name, pc: a.type === "actorPc"
    }))
    context.cons = cons.map(c => ({
      id: c.id, name: c.name, status: c.status, statusLabel: `SR5.CON_Status_${c.status}`, active: c.id === con?.id,
      kindLabel: `SR5.CON_Kind_${c.kind}`
    }))
    if (!con) return context

    const target = con.targetId ? game.actors.get(con.targetId) : null
    const step = (key, extra = {
    }) => ({
      key, label: `SR5.CON_Step_${key}`, hint: `SR5.CON_Step_${key}_D`, mandatory: CON_STEPS[key].mandatory,
      done: con.steps?.some(s => s.step === key), ...extra
    })
    const fab = propFabrication(con.fabrication?.wanted, con.fabrication?.hits)
    const evaluation = evaluationTest(con.intel)
    const open = openRolledSteps(con)
    context.con = {
      ...con,
      kindLabel: `SR5.CON_Kind_${con.kind}`,
      statusLabel: `SR5.CON_Status_${con.status}`,
      active: ACTIVE_STATUSES.includes(con.status),
      artists: (con.artistIds ?? []).map(name).join(", "),
      targetLabel: target?.name ?? con.targetName ?? "—",
      propTotal: propTotal(con.props),
      intelSign: con.intel > 0 ? "+" : "",
      log: [...(con.steps ?? [])].reverse().map(s => ({
        ...s, label: `SR5.CON_Step_${s.step}`,
        outcomeLabel: s.outcome ? `SR5.CON_Status_${s.outcome}` : "",
        netLabel: s.net === null || s.net === undefined ? "" : (s.net > 0 ? `+${s.net}` : `${s.net}`),
        intelLabel: s.intel ? (s.intel > 0 ? `+${s.intel}` : `${s.intel}`) : "",
      })),
    }
    const allowed = k => stepAllowed(k, con.kind)
    context.prep = [
      allowed("investigation") && step("investigation", {
        manual: true
      }),
      allowed("matrixResearch") && step("matrixResearch", {
        oppose: true, degree: true, dice: MATRIX_DEGREES[con.matrixDegree ?? "moderate"]
      }),
      step("surveillance", {
        oppose: true, dice: target?.system?.skills?.perception?.test?.dicePool ?? null, signed: true
      }),
      allowed("evaluation") && step("evaluation", {
        oppose: true, dice: evaluation.opposingDice, limit: evaluation.limit, locked: !evaluation.allowed
      }),
    ].filter(Boolean)
    context.degrees = Object.entries(MATRIX_DEGREES).map(([key, dice]) => ({
      key, dice, label: `SR5.CON_Degree_${key}`, selected: key === (con.matrixDegree ?? "moderate")
    }))
    context.fabrication = {
      ...step("propFabrication"), name: con.fabrication?.name ?? "", wanted: con.fabrication?.wanted ?? 1,
      hits: con.fabrication?.hits ?? 0, threshold: fab.threshold, rating: fab.rating, done: fab.done
    }
    context.acquisition = step("propAcquisition")
    context.rolled = ["bait", "reinforce", "exit"].filter(allowed).map(k => step(k, {
      open: open.includes(k),
      phase: CON_STEPS[k].phase,
      mandatory: CON_STEPS[k].mandatory || (k === "reinforce" && con.status === "wary"),
    }))
    context.opposition = {
      artistBonus: propTotal(con.props),
      // The modifier the target takes, signed: a negative Intel Level helps it (con-rules.js, conOpposition)
      intel: (con.intel ?? 0) > 0 ? `−${con.intel}` : `+${-(con.intel ?? 0)}`,
    }

    // Faction Reputation (p. 158): offered once the con is over, when its target belongs to a faction
    const faction = SR5FactionRegistry.factionOfActor(con.targetId)
    const reason = factionReasonOf(con.status, con.kind)
    if (faction && reason) {
      const days = Math.max(0, Math.floor(((con.end ?? game.time.worldTime) - (con.start ?? 0)) / DAY))
      context.faction = {
        name: faction.name, reason, reasonLabel: `SR5.FACTION_Reason_${reason}`,
        delta: reason === "longConDetected" ? longConPenalty(days) : FACTION_REASONS[reason],
        done: !!con.factionDone,
      }
    }
    return context
  }

  _onRender(context, options){
    super._onRender?.(context, options)
    if (!SR5ConRegistry.canWrite){
      for (const el of this.element.querySelectorAll("button, input, select, textarea")) el.disabled = true
      for (const el of this.element.querySelectorAll("a[data-action]")) el.classList.add("disabled")
    }
    // The matrix degree changes the dice the target opposes with (p. 163)
    this.element.querySelector("[name=matrixDegree]")?.addEventListener("change", ev => {
      const con = this.current
      if (con) this.#write(con.id, c => c.matrixDegree = ev.target.value)
    })
    // The fabrication: wanted rating and hits so far, kept as the gamemaster types them
    for (const field of ["fabName", "fabWanted", "fabHits"]) this.element.querySelector(`[name=${field}]`)?.addEventListener("change", () => {
      const con = this.current
      if (con) this.#write(con.id, c => c.fabrication = {
        name: this.#value("fabName"), wanted: this.#number("fabWanted"), hits: this.#number("fabHits")
      })
    })
  }

  #value(name){
    return this.element.querySelector(`[name="${name}"]`)?.value ?? ""
  }

  #number(name){
    return Math.floor(Number(this.#value(name)) || 0)
  }

  #write(id, change){
    return SR5ConRegistry.update(d => {
      const c = d.cons.find(x => x.id === id)
      if (c) change(c)
    })
  }

  // One line of the con's journal, and the Intel Level it moves
  #log(id, entry){
    return this.#write(id, c => {
      c.steps = c.steps ?? []
      c.steps.push({
        id: newId(), time: game.time.worldTime, ...entry
      })
      if (entry.intel) c.intel = (c.intel ?? 0) + entry.intel
    })
  }

  static async #createCon(){
    if (SR5ConRegistry.refuse()) return
    const name = this.#value("newName").trim()
    if (!name) return ui.notifications.info(game.i18n.localize("SR5.CON_NeedName"))
    const kind = this.#value("newKind") === "short" ? "short" : "long"
    const artistIds = [...this.element.querySelectorAll("[name=newArtist]:checked")].map(el => el.value)
    if (!artistIds.length) return ui.notifications.info(game.i18n.localize("SR5.CON_NeedArtist"))
    // The target: an actor of the world, or the targeted token's
    const targeted = [...(game.user.targets ?? [])][0]?.actor
    const targetId = this.#value("newTarget") || targeted?.id || null
    const id = newId()
    await SR5ConRegistry.update(d => d.cons.push({
      id, name, kind, artistIds, targetId, targetName: targetId ? (game.actors.get(targetId)?.name ?? targeted?.name ?? "") : "",
      intel: 0, props: [], fabrication: {
        name: "", wanted: 1, hits: 0
      }, matrixDegree: "moderate", status: "preparing", steps: [], start: game.time.worldTime,
    }))
    this.#selected = id
  }

  static #selectCon(event, target){
    this.#selected = target.dataset.con
    this.render()
  }

  static async #deleteCon(event, target){
    if (SR5ConRegistry.refuse()) return
    const id = target.dataset.con
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.CON_Delete")
      },
      content: `<p>${game.i18n.format("SR5.CON_DeleteConfirm", {
        name: foundry.utils.escapeHTML(SR5ConRegistry.con(id)?.name ?? "")
      })}</p>`,
    })
    if (!ok) return
    await SR5ConRegistry.update(d => {
      d.cons = d.cons.filter(c => c.id !== id)
    })
  }

  // The gamemaster's own figure (a modifier for the players' ingenuity, p. 162)
  static async #setIntel(event, target){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    const step = Number(target.dataset.step) || 0
    await this.#log(con.id, {
      step: "manual", net: null, intel: step
    })
  }

  // Investigation through a contact (p. 162): the net hits of the Negotiation test with the contact
  static async #investigation(){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    const net = this.#number("net-investigation")
    await this.#log(con.id, {
      step: "investigation", net, intel: intelDelta("investigation", net)
    })
  }

  // Matrix research, surveillance and evaluation (p. 162-163): the con artist's hits, typed from her card,
  // against the target's dice rolled here (or typed, when the gamemaster rolled them himself)
  static async #oppose(event, target){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    const key = target.dataset.step
    let artistHits = this.#number(`hits-${key}`)
    if (key === "evaluation"){
      const test = evaluationTest(con.intel)
      if (!test.allowed) return ui.notifications.warn(game.i18n.localize("SR5.CON_EvaluationLocked"))
      // The Intel Level is the limit of the test (p. 163)
      artistHits = Math.min(artistHits, test.limit)
    }
    const typed = this.element.querySelector(`[name="opp-${key}"]`)?.value
    let opposing
    if (typed !== undefined && typed !== "") opposing = Math.max(0, Math.floor(Number(typed) || 0))
    else {
      const dice = Number(target.dataset.dice) || 0
      if (!dice) return ui.notifications.info(game.i18n.localize("SR5.CON_NeedOpposition"))
      const roll = await new Roll(`${dice}d6cs>=5`).evaluate()
      opposing = roll.total
      await roll.toMessage({
        flavor: game.i18n.format("SR5.CON_OppositionRoll", {
          step: game.i18n.localize(`SR5.CON_Step_${key}`), dice
        }),
        whisper: ChatMessage.getWhisperRecipients("GM"),
      }, {
        rollMode: CONST.DICE_ROLL_MODES.BLIND
      })
    }
    const net = netHits(artistHits, opposing)
    await this.#log(con.id, {
      step: key, net, intel: intelDelta(key, net), note: `${artistHits} / ${opposing}`
    })
  }

  // Prop fabrication (p. 163): the rating reached, wanted or stopped short
  static async #fabricate(){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    const fab = propFabrication(this.#number("fabWanted"), this.#number("fabHits"))
    if (!fab.rating) return ui.notifications.info(game.i18n.localize("SR5.CON_PropZero"))
    const name = this.#value("fabName").trim() || game.i18n.localize("SR5.CON_Prop")
    await this.#write(con.id, c => {
      c.props = c.props ?? []
      c.props.push({
        id: newId(), name, rating: fab.rating, origin: "fabricated"
      })
      c.fabrication = {
        name: "", wanted: 1, hits: 0
      }
      c.steps = c.steps ?? []
      c.steps.push({
        id: newId(), time: game.time.worldTime, step: "propFabrication", net: null, note: `${name} (${fab.rating})`
      })
    })
  }

  // Prop acquisition (p. 163): bought by the purchase rules, Availability 3 × rating, cost Availability × 1,000
  static async #acquire(){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    const rating = this.#number("acqRating")
    if (!rating) return ui.notifications.info(game.i18n.localize("SR5.CON_PropZero"))
    const name = this.#value("acqName").trim() || game.i18n.localize("SR5.CON_Prop")
    const {
      availability, cost
    } = propAcquisition(rating)
    await this.#write(con.id, c => {
      c.props = c.props ?? []
      c.props.push({
        id: newId(), name, rating, origin: "acquired"
      })
      c.steps = c.steps ?? []
      c.steps.push({
        id: newId(), time: game.time.worldTime, step: "propAcquisition", net: null,
        note: `${name} (${rating}) — ${availability} / ${cost} ¥`
      })
    })
  }

  static async #removeProp(event, target){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    await this.#write(con.id, c => {
      c.props = (c.props ?? []).filter(p => p.id !== target.dataset.prop)
    })
  }

  // A step rolled with Con written by hand (the card's button does it otherwise, con-card.js)
  static async #recordRolled(event, target){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    const {
      recordRolledStep
    } = await import("../system/con-card.js")
    await recordRolledStep(con.id, target.dataset.step, this.#number(`net-${target.dataset.step}`))
  }

  // No soft exit (p. 164): the mark sees through it as soon as the con artist is gone
  static async #vanish(){
    const con = this.current
    if (!con || SR5ConRegistry.refuse()) return
    await this.#write(con.id, c => {
      c.status = "vanished"
      c.end = game.time.worldTime
      c.steps = c.steps ?? []
      c.steps.push({
        id: newId(), time: game.time.worldTime, step: "vanish", net: null, outcome: "vanished"
      })
    })
  }

  // The Faction Reputation of the con artists with the target's faction (p. 158), pending until the mission's end
  static async #factionMove(){
    const con = this.current
    if (!con || SR5ConRegistry.refuse() || SR5FactionRegistry.refuse()) return
    const faction = SR5FactionRegistry.factionOfActor(con.targetId)
    const reason = factionReasonOf(con.status, con.kind)
    if (!faction || !reason || con.factionDone) return
    const days = Math.max(0, Math.floor(((con.end ?? game.time.worldTime) - (con.start ?? 0)) / DAY))
    const delta = reason === "longConDetected" ? longConPenalty(days) : FACTION_REASONS[reason]
    await SR5FactionRegistry.update(d => {
      for (const actorId of con.artistIds ?? []) d.log.push({
        id: newId(), factionId: faction.id, actorId, reason, delta, pending: true, time: game.time.worldTime, note: con.name
      })
    })
    await this.#write(con.id, c => c.factionDone = true)
  }
}

/**
 * The token controls' buttons (lot 21), beside the factions': the con tracker for the gamemaster, the bartering
 * window for everyone (a calculator, it writes nothing).
 */
export function addConTools(controls) {
  const tokens = controls?.tokens ?? controls?.token
  if (!tokens?.tools) return
  if (game.user?.isGM) tokens.tools.sr5ConTracker = {
    name: "sr5ConTracker",
    title: "SR5.CON_Title",
    icon: "fas fa-masks-theater",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => SR5ConApp.open(),
  }
  tokens.tools.sr5Barter = {
    name: "sr5Barter",
    title: "SR5.BARTER_Title",
    icon: "fas fa-handshake",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => SR5BarterApp.open(),
  }
}

export function registerConControls() {
  Hooks.on("getSceneControlButtons", addConTools)
}
