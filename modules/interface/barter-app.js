import {
  negotiatedValue, lineValue, remainder, intimidationValue
} from "../system/barter-rules.js"

const KINDS = ["cash", "equipment", "contact", "service", "information"]

/**
 * The bartering window (Cutting Aces p. 160-162, 164): the negotiated value from the NPC's offer and the net
 * hits of a Negotiation or Intimidation card, and the Bartering table to settle it in kind. A calculator for
 * the table: it writes nothing, every user may open it.
 */
export class SR5BarterApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-barter",
    classes: ["sr5", "sr-application", "sr-con", "sr-barter"],
    position: {
      width: 560, height: "auto"
    },
    window: {
      title: "SR5.BARTER_Title", icon: "fas fa-handshake", resizable: true
    },
    actions: {
      addLine: SR5BarterApp.#addLine,
      removeLine: SR5BarterApp.#removeLine,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/barter.hbs"
    }
  }

  #state = {
    mode: "negotiation", offer: 0, net: 0, side: "pay", lines: []
  }

  /**
   * @param {{mode?:"negotiation"|"intimidation", net?:number}} options - what the card knows
   */
  static open(options = {
  }){
    const app = foundry.applications.instances.get("sr5-barter") ?? new SR5BarterApp()
    if (options.mode) app.#state.mode = options.mode
    if (options.net !== undefined) app.#state.net = Math.floor(Number(options.net) || 0)
    return app.render({
      force: true
    })
  }

  async _prepareContext(options){
    const context = await super._prepareContext(options)
    const s = this.#state
    const intimidation = s.mode === "intimidation"
    const value = intimidation ? intimidationValue(s.net, s.offer) : negotiatedValue(s.offer, s.net, s.side)
    context.state = s
    context.intimidation = intimidation
    context.value = value
    context.kinds = KINDS.map(k => ({
      key: k, label: `SR5.BARTER_Kind_${k}`
    }))
    context.lines = s.lines.map((l, i) => ({
      ...l, index: i, value: lineValue(l), label: `SR5.BARTER_Kind_${l.kind}`,
      isCash: l.kind === "cash", isEquipment: l.kind === "equipment", isContact: l.kind === "contact",
      isService: l.kind === "service", isInformation: l.kind === "information",
    }))
    // What is left to pay in cash, or what the lines offer beyond the value (the GM then gives change, or not)
    const left = intimidation ? 0 : remainder(value, s.lines)
    context.remainder = Math.abs(left)
    context.remainderLabel = left < 0 ? "SR5.BARTER_Surplus" : "SR5.BARTER_Remainder"
    return context
  }

  _onRender(context, options){
    super._onRender?.(context, options)
    // Every figure recounts as it is typed
    for (const el of this.element.querySelectorAll("[data-field]")) el.addEventListener("change", ev => {
      const field = ev.target.dataset.field
      const line = ev.target.dataset.line
      const value = ev.target.type === "number" ? Number(ev.target.value) || 0 : ev.target.value
      if (line !== undefined) this.#state.lines[Number(line)][field] = value
      else this.#state[field] = value
      this.render()
    })
  }

  static #addLine(){
    const kind = this.element.querySelector("[name=newKind]")?.value ?? "cash"
    this.#state.lines.push({
      kind, amount: 0, cost: 0, availability: 0, quantity: 1, influence: 1, dicePool: 8, hours: 1
    })
    this.render()
  }

  static #removeLine(event, target){
    this.#state.lines.splice(Number(target.dataset.line), 1)
    this.render()
  }
}
