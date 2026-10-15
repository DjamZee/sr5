import {
  SR5
} from "../config.js"
import {
  DRUG_BASES, DRUG_BLOCKS, DRUG_ATTRIBUTES, DRUG_ENHANCER_MAX, computeCustomDrug, customDrugItemData, effectLines,
  normalizeRecipe
} from "../entities/items/drug-designer.js"
import {
  refuseByRule, ruleLockActive
} from "../system/rule-locks.js"

const t = key => game.i18n.localize(key)
const escape = s => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "")
const LABELS = {
  attributes: SR5.characterAttributes, bases: SR5.drugDesignerBases, blocks: SR5.drugDesignerBlocks,
  traits: SR5.drugDesignerQualities, vectors: SR5.propagationVectors,
}

/** Can this user design a drug for this actor: the gamemaster always, a player for an actor of theirs with Chemistry. */
export function canDesignDrug(actor, user = game.user) {
  if (user?.isGM) return true
  return !!actor?.isOwner && (Number(actor.system?.skills?.chemistry?.rating?.value) || 0) > 0
}

/** The "objects" rule lock lifted (B13), a player designs for an actor of theirs without Chemistry; never for another's. */
export function canOfferDrugDesign(actor, user = game.user) {
  return canDesignDrug(actor, user) || (!!actor?.isOwner && !ruleLockActive("objects"))
}

/**
 * The characters a player may design a drug for, from the Items tab (relecture djamz.13, R1, decision of DjamZ: the
 * designer opens from the Items tab, no longer from the sheet): those of hers the designer is offered for.
 */
export function designableActors(user = game.user) {
  return (game.actors?.contents ?? []).filter(a => ["actorPc", "actorGrunt"].includes(a.type) &&
    a.testUserPermission?.(user, "OWNER") && canOfferDrugDesign(a, user))
}

/**
 * The drug designer (Chrome Flesh p. 194-196): a base, blocks at a level, enhancers; the drug is worked out as the
 * choices change (entities/items/drug-designer.js) and made as an itemDrug. The gamemaster makes it at once; a player's
 * waits for the gamemaster's approval (decision of DjamZ, 07/10), who reviews it in the same window.
 * Options: `actor` (the drug goes on its sheet, else in the Items tab), `item` (a player's drug to review).
 */
export class SR5DrugDesigner extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    classes: ["sr5", "sr-application", "sr-drug-designer"],
    tag: "form",
    position: {
      width: 900, height: 720
    },
    window: {
      title: "SR5.DrugDesignerTitle", icon: "fas fa-flask", resizable: true
    },
    form: {
      handler: SR5DrugDesigner.#onChange, submitOnChange: true, closeOnSubmit: false
    },
    actions: {
      create: SR5DrugDesigner.#create,
      approve: SR5DrugDesigner.#approve,
      refuse: SR5DrugDesigner.#refuse,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/drug-designer.hbs", scrollable: [""]
    }
  }

  constructor(options = {
  }) {
    super(options)
    this.actor = options.actor ?? null
    this.item = options.item ?? null
    // A player opens it from the Items tab: her own character first, else the first she may design for
    if (!this.actor && !this.item && !game.user?.isGM) {
      const choices = designableActors()
      this.actor = choices.find(a => a.id === game.user?.character?.id) ?? choices[0] ?? null
    }
    const s = this.item?.system
    this.draft = {
      name: this.item?.name ?? t("SR5.DrugDesignerDefaultName"),
      recipe: normalizeRecipe(s?.designer?.recipe ?? {
        base: "tank"
      }),
      quality: s?.quality ?? "standard",
      addictionType: s?.addiction?.type || "both",
    }
  }

  get title() {
    const title = t("SR5.DrugDesignerTitle")
    const owner = this.item?.parent ?? this.actor
    return owner ? `${title} — ${owner.name}` : title
  }

  async _prepareContext() {
    const {
      recipe, quality, addictionType, name
    } = this.draft
    const stat = computeCustomDrug(recipe, quality)
    const option = (value, label, selected) => ({
      value, label, selected: value === selected
    })
    const levelText = l => {
      const parts = effectLines({
        attributes: l.attributes ?? {
        }, limits: l.limits ?? 0, socialLimit: 0, initiativeDice: l.initiativeDice ?? 0, painResistance: 0,
        qualities: l.quality ? [l.quality] : [],
      }, t, LABELS)
      if (l.crash) parts.push(game.i18n.format("SR5.DrugDesignerCrashShort", {
        value: l.crash
      }))
      return parts.join(", ")
    }
    const blocks = Object.entries(DRUG_BLOCKS).map(([key, block]) => ({
      key, number: block.number, label: t(SR5.drugDesignerBlocks[key]),
      level: recipe.blocks[key] ?? 0,
      levels: [option(0, "—", recipe.blocks[key] ?? 0), ...block.levels.map((l, i) => ({
        ...option(i + 1, `${i + 1}`, recipe.blocks[key] ?? 0), text: levelText(l)
      }))],
      text: (recipe.blocks[key] ?? 0) ? levelText(block.levels[recipe.blocks[key] - 1] ?? {
      }) : "",
    }))
    const counts = Array.from({
      length: DRUG_ENHANCER_MAX + 1
    }, (_, i) => i)
    const user = game.user
    const reviewing = !!this.item && user.isGM
    return {
      name,
      bases: Object.entries(DRUG_BASES).map(([key, base]) => ({
        ...option(key, `${base.number}. ${t(SR5.drugDesignerBases[key])}`, recipe.base),
        text: effectLines({
          attributes: base.attributes, limits: 0, socialLimit: base.socialLimit ?? 0, initiativeDice: 0,
          painResistance: base.painResistance ?? 0, qualities: []
        }, t, LABELS).join(", ")
      })),
      baseText: effectLines({
        attributes: DRUG_BASES[recipe.base]?.attributes ?? {
        }, limits: 0, socialLimit: DRUG_BASES[recipe.base]?.socialLimit ?? 0, initiativeDice: 0,
        painResistance: DRUG_BASES[recipe.base]?.painResistance ?? 0, qualities: []
      }, t, LABELS).join(", "),
      blocks,
      enhancers: {
        ingestion: recipe.enhancers.ingestion, inhalation: recipe.enhancers.inhalation,
        speed: counts.map(n => option(n, `${n}`, recipe.enhancers.speed)),
        duration: counts.map(n => option(n, `${n}`, recipe.enhancers.duration)),
      },
      qualities: Object.entries(SR5.drugQualities).map(([k, v]) => option(k, t(v), quality)),
      addictionTypes: Object.entries(SR5.addictionTypes).map(([k, v]) => option(k, t(v), addictionType)),
      stat,
      errors: stat.errors.map(e => this.#errorText(e)),
      effects: effectLines(stat.effects, t, LABELS).join(", ") || "—",
      speed: stat.speed ? `${stat.speed} ${t(stat.speed === 1 ? "SR5.CombatTurn" : "SR5.CombatTurns")}` : t("SR5.DrugDesignerImmediate"),
      duration: `10 × ${stat.durationDice}D6 ${t("SR5.Minutes").toLowerCase()}`,
      vectors: stat.vectors.map(v => t(SR5.propagationVectors[v])).join(", "),
      crash: stat.effects.crash ? game.i18n.format("SR5.DrugDesignerCrashShort", {
        value: stat.effects.crash
      }) : "—",
      threshold: quality === "pharmaceutical" ? Math.max(stat.addictionThreshold - 1, 0) : stat.addictionThreshold,
      negativeAttributes: DRUG_ATTRIBUTES.some(a => (stat.effects.attributes[a] ?? 0) < 0),
      reviewing,
      pending: this.item?.system?.designer?.status === "pending",
      canCreate: !this.item && canOfferDrugDesign(this.actor, user),
      isGM: user.isGM,
      target: this.actor?.name ?? t("SR5.DrugDesignerWorldItems"),
      // The choice of character: the player's own ones; for the gamemaster, the world items first, then the characters
      // (the sheet's button is gone)
      actorChoices: this.item ? [] : [
        ...(user.isGM ? [option("", t("SR5.DrugDesignerWorldItems"), this.actor?.id ?? "")] : []),
        ...designableActors(user).map(a => option(a.id, a.name, this.actor?.id)),
      ],
    }
  }

  #errorText(e) {
    const data = {
      block: e.block ? `${DRUG_BLOCKS[e.block]?.number ?? "?"} (${t(SR5.drugDesignerBlocks[e.block] ?? e.block)})` : "",
      other: e.other ? `${DRUG_BLOCKS[e.other]?.number ?? "?"} (${t(SR5.drugDesignerBlocks[e.other] ?? e.other)})` : "",
      attribute: e.attribute ? t(SR5.characterAttributes[e.attribute]) : "",
      max: e.max ?? "", level: e.level ?? "",
    }
    return game.i18n.format(`SR5.DrugDesignerError_${e.code}`, data)
  }

  /** The form, read back into the state at each change, then the window drawn again with the new figures. */
  static async #onChange(_event, _form, formData) {
    const data = foundry.utils.expandObject(formData.object)
    if ("actorId" in data && (data.actorId || "") !== (this.actor?.id ?? "")) {
      // An empty choice: the world items, the gamemaster's only
      const actor = data.actorId ? designableActors().find(a => a.id === data.actorId) : null
      if (actor || (!data.actorId && game.user.isGM)) this.actor = actor
      // The window's title names the character the drug is for
      if (this.window?.title) this.window.title.textContent = this.title
    }
    const blocks = {
    }
    for (const [key, level] of Object.entries(data.blocks ?? {
    })) if (Number(level) > 0) blocks[key] = Number(level)
    this.draft = {
      name: String(data.name ?? "").trim() || this.draft.name,
      recipe: normalizeRecipe({
        base: data.base, blocks, enhancers: {
          ingestion: !!data.enhancers?.ingestion, inhalation: !!data.enhancers?.inhalation,
          speed: Number(data.enhancers?.speed) || 0, duration: Number(data.enhancers?.duration) || 0,
        }
      }),
      quality: data.quality || "standard",
      addictionType: data.addictionType || "both",
    }
    this.render()
  }

  #itemData(status) {
    const {
      name, recipe, quality, addictionType
    } = this.draft
    const owner = this.item?.parent ?? this.actor
    return customDrugItemData({
      name, recipe, quality, addictionType, status, t, labels: LABELS,
      //A custom drug is made for someone (Chrome Flesh p. 194): the character it is made on
      preparedFor: quality === "custom" && owner ? owner.id : "",
    })
  }

  #blocked() {
    const errors = computeCustomDrug(this.draft.recipe).errors
    if (!errors.length) return false
    ui.notifications.warn(t("SR5.DrugDesignerHasErrors"))
    return true
  }

  /** The gamemaster's drug is made at once; a player's goes on the sheet pending, and the gamemaster is asked. */
  static async #create() {
    if (this.#blocked()) return
    const user = game.user
    if (!canDesignDrug(this.actor, user)) {
      if (!this.actor?.isOwner) return ui.notifications.warn(t("SR5.WARN_DrugDesignerNoSkill"))
      if (refuseByRule("objects", "SR5.WARN_DrugDesignerNoSkill", null, {
        actor: this.actor
      })) return
    }
    const data = this.#itemData(user.isGM ? "" : "pending")
    if (user.isGM) {
      const [item] = this.actor ? await this.actor.createEmbeddedDocuments("Item", [data]) : [await Item.create(data)]
      ui.notifications.info(game.i18n.format("SR5.INFO_DrugDesignerCreated", {
        drug: item?.name ?? data.name, target: this.actor?.name ?? t("SR5.DrugDesignerWorldItems")
      }))
      return this.close()
    }
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data])
    if (!item) return
    await ChatMessage.create({
      content: `<div class="sr5-drug-design-card"><h3><i class="fas fa-flask"></i> ${t("SR5.DrugDesignerTitle")}</h3>
        <p>${game.i18n.format("SR5.DrugDesignerRequest", {
    user: escape(user.name), actor: escape(this.actor.name), drug: escape(item.name)
  })}</p>
        <button type="button" data-sr5-drug-design-review>${t("SR5.DrugDesignerReview")}</button></div>`,
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags: {
        sr5: {
          drugDesign: {
            itemUuid: item.uuid
          }
        }
      },
    })
    ui.notifications.info(game.i18n.format("SR5.INFO_DrugDesignerSubmitted", {
      drug: item.name
    }))
    this.close()
  }

  /** The gamemaster approves: the drug is worked out again from the recipe he settled, and can be taken. */
  static async #approve() {
    if (!game.user.isGM || !this.item || this.#blocked()) return
    const data = this.#itemData("approved")
    const update = {
      name: data.name
    }
    for (const [key, value] of Object.entries(data.system)) update[`system.${key}`] = value
    //The effects are replaced, not merged: a recipe with fewer effects leaves none of the former ones behind
    for (const key of Object.keys(this.item.system.customEffects ?? {
    })) if (!(key in data.system.customEffects)) update[`system.customEffects.-=${key}`] = null
    //So are the blocks of the recipe: a block the gamemaster took out must not stay in it
    delete update["system.designer"]
    update["system.designer.status"] = "approved"
    update["system.designer.recipe.base"] = data.system.designer.recipe.base
    update["system.designer.recipe.enhancers"] = data.system.designer.recipe.enhancers
    for (const [key, level] of Object.entries(data.system.designer.recipe.blocks)) update[`system.designer.recipe.blocks.${key}`] = level
    for (const key of Object.keys(this.item.system.designer?.recipe?.blocks ?? {
    })) if (!(key in data.system.designer.recipe.blocks)) update[`system.designer.recipe.blocks.-=${key}`] = null
    await this.item.update(update)
    await SR5DrugDesigner.#tell(this.item, "SR5.DrugDesignerApproved")
    this.close()
  }

  static async #refuse() {
    if (!game.user.isGM || !this.item) return
    await this.item.update({
      "system.designer.status": "refused"
    })
    await SR5DrugDesigner.#tell(this.item, "SR5.DrugDesignerRefused")
    this.close()
  }

  /** Whispered to the owners of the drug and the gamemasters. */
  static async #tell(item, key) {
    const owners = game.users.filter(u => !u.isGM && item.testUserPermission?.(u, "OWNER")).map(u => u.id)
    await ChatMessage.create({
      content: `<p><i class="fas fa-flask"></i> ${game.i18n.format(key, {
        drug: escape(item.name), actor: escape(item.parent?.name ?? "")
      })}</p>`,
      whisper: [...owners, ...ChatMessage.getWhisperRecipients("GM").map(u => u.id)],
    })
  }

  /** The button of the request card: the gamemasters only, to review the drug in the designer. */
  static activateCardListeners(html, message) {
    const button = html.querySelector("[data-sr5-drug-design-review]")
    if (!button) return
    if (!game.user.isGM) return button.remove()
    button.addEventListener("click", async () => {
      const item = await fromUuid(message.flags.sr5.drugDesign.itemUuid).catch(() => null)
      if (!item) return ui.notifications.warn(t("SR5.DrugDesignerGone"))
      new SR5DrugDesigner({
        item
      }).render(true)
    })
  }

  /**
   * The button in the Items tab, the designer's only way in: for the gamemaster, a drug that goes in the world items;
   * for a player who may design one, a drug for one of her characters (relecture djamz.13, R1).
   */
  static registerHooks() {
    Hooks.on("renderItemDirectory", (app, html) => {
      if (!game.user.isGM && !designableActors().length) return
      const root = html instanceof HTMLElement ? html : html[0]
      const actions = root?.querySelector(".header-actions")
      if (!actions || actions.querySelector(".sr5-drug-designer")) return
      const button = document.createElement("button")
      button.type = "button"
      button.className = "sr5-drug-designer"
      button.innerHTML = `<i class="fas fa-flask"></i> ${t("SR5.DrugDesignerTitle")}`
      button.addEventListener("click", () => new SR5DrugDesigner().render(true))
      actions.append(button)
    })
  }
}
