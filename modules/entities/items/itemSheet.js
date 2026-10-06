import {
  SR5FactionRegistry
} from "../../interface/faction-registry.js"
import {
  canEditItemEffects, clearTargetsOnCategoryChange, keepUnlistedEffectFields, lockEffectFields
} from "../../system/effect-editor.js"
import {
  SR5
} from "../../config.js"
import {
  transhumanGift, itemHasEffect, IMPLANT_ESSENCE_EFFECTS, AUGMENTATION_BUNDLE_SETTING
} from "../../system/implant-essence.js"
import {
  IMPLANT_REGISTER, PEAK_COST, resetEssencePeak
} from "../../system/implant-register.js"
import {
  garageRequirement
} from "../../interface/storage-rules.js"
import {
  infectWith
} from "../../system/diseases.js"
import {
  SR5_SpiritTypes
} from "./spirit-types.js"
import {
  isMentorQuality
} from "./mentor-link.js"
import {
  SR5_Toxins
} from "./toxins.js"
import {
  SR5_EntityHelpers 
} from "../helpers.js"
import {
  SR5_UtilityItem 
} from "./utilityItem.js"
import {
  computeItemLayout 
} from "../../interface/compute-item-layout.js"
import {
  enhanceSelects
} from "../../helpers/enhance-selects.js"
import {
  sheetSizeOptions, sheetSizeSetPosition
} from "../../interface/sheet-size.js"
import {
  tacnetSheetContext, requestRoster, tokenActorUuid, TACNET_COMBAT_FLAG
} from "../../system/tacnet.js"
import {
  TACNET_COMBAT_SKILLS
} from "../../rolls/roll-helpers/tacnet.js"

// Item types that include a footer (condition monitors, price/availability)
const ITEM_FOOTER_TYPES = new Set([
  'SRItem-vierge', 'itemAdeptPower', 'itemAmmunition', 'itemArmor',
  'itemAugmentation', 'itemComplexForm', 'itemContact', 'itemDevice',
  'itemDrug', 'itemFocus', 'itemGear', 'itemKarma', 'itemNuyen', 'itemReputation', 'itemToxin',
  'itemPreparation', 'itemProgram', 'itemQuality', 'itemSin',
  'itemSpell', 'itemSprite', 'itemVehicleMod', 'itemWeapon',
])

/**
 * Override and extend the core ItemSheet implementation to handle Shadowrun 5 specific item types
 * @type {ItemSheetV2}
 */
export class SR5ItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2
) {
  static MODES = Object.freeze({
    PLAY: 1, EDIT: 2 
  })

  /** The Force a spirit type's preview is computed at. */
  static SPIRIT_PREVIEW_FORCE = 4

  _mode = SR5ItemSheet.MODES.EDIT

  get isPlayMode() { return this._mode === SR5ItemSheet.MODES.PLAY }
  get isEditMode() { return this._mode === SR5ItemSheet.MODES.EDIT }

  // Item types that unfold into their own actor, and so carry a token picture
  static SIDEKICK_TYPES = ["itemSpirit", "itemSprite", "itemVehicle", "itemProgram", "itemContact", "itemStorage"]

  static DEFAULT_OPTIONS = {
    classes: ["app", "window-app", "sr5", "SR-Item"],
    position: {
      width: 650, height: 445 
    },
    window: {
      resizable: true 
    },
    form: {
      submitOnChange: true 
    },
    actions: {
      toggleMode: SR5ItemSheet._onToggleMode,
      // The active GM gives back the Essence a peak cost holds by mistake (implant-register.js)
      resetEssencePeak: function () {
        return resetEssencePeak(this.document)
      },
      jammerSpareTargets: SR5ItemSheet._onJammerSpareTargets,
      jammerUnspare: SR5ItemSheet._onJammerUnspare,
      tacnetAddTargets: SR5ItemSheet._onTacnetAddTargets,
      tacnetRemove: SR5ItemSheet._onTacnetRemove,
      shopRestock: SR5ItemSheet._onShopAction,
      shopClear: SR5ItemSheet._onShopAction,
      shopCashbox: SR5ItemSheet._onShopAction,
      shopOpen: SR5ItemSheet._onShopAction,
      shopClientAdd: SR5ItemSheet._onShopAction,
      shopClientRemove: SR5ItemSheet._onShopAction,
    },
  }

  /** @override — reopen at the size last chosen for this item type (sheet-size.js) */
  _initializeApplicationOptions(options) {
    return sheetSizeOptions(this.constructor, super._initializeApplicationOptions(options))
  }

  /** @override — never below the default size, and remember the size chosen */
  setPosition(position) {
    return sheetSizeSetPosition(this, position, p => super.setPosition(p))
  }

  // A jammer in wireless mode spares the actors of the targeted tokens (SR5 p. 443)
  static async _onJammerSpareTargets(event) {
    event.preventDefault()
    let spared = new Set(this.document.system.jammer?.spared ?? [])
    //An unlinked token by its uuid: the guards of one NPC share its actor id
    for (let token of game.user.targets) if (token.actor) spared.add(token.document.actorLink ? token.actor.id : token.document.uuid)
    await this.document.update({
      "system.jammer.spared": [...spared]
    })
  }

  // The bearer of an RP-Tac asks for the targeted tokens to join, the active GM writes the roster
  static async _onTacnetAddTargets(event) {
    event.preventDefault()
    for (let token of game.user.targets) {
      const uuid = tokenActorUuid(token)
      if (uuid) await requestRoster(this.document, uuid, "join")
    }
  }

  static async _onTacnetRemove(event, target) {
    event.preventDefault()
    await requestRoster(this.document, target.dataset.member, "leave")
  }

  // The vendor's shop (lot C): restock, empty, give a cashbox, open the window
  static async _onShopAction(event, target) {
    event.preventDefault()
    const item = this.document
    const actor = item.parent
    if (!actor) return
    const action = target.dataset.action
    const {
      SR5ShopVendor
    } = await import("../../interface/shop-vendor.js")
    if (action === 'shopOpen') return SR5ShopVendor.openShop(actor, item)
    if (!game.user.isGM) return
    if (action === 'shopRestock') await SR5ShopVendor.restock(actor, item)
    else if (action === 'shopClear') await SR5ShopVendor.clearStock(actor, item)
    else if (action === 'shopCashbox') await SR5ShopVendor.createCashbox(actor, item)
    else if (action === 'shopClientAdd') {
      const el = this.element
      await SR5ShopVendor.setClient(item, el.querySelector('[data-shop-client-actor]')?.value,
        el.querySelector('[data-shop-client-loyalty]')?.value)
    } else if (action === 'shopClientRemove') await SR5ShopVendor.removeClient(item, target.dataset.actorId)
    this.render()
  }

  static async _onJammerUnspare(event, target) {
    event.preventDefault()
    let spared = (this.document.system.jammer?.spared ?? []).filter(id => id !== target.dataset.actorId)
    await this.document.update({
      "system.jammer.spared": spared
    })
  }

  static PARTS = {
    sheet: {
      template: "systems/sr5/templates/items/item-sheet.hbs",
      root: true,
      scrollable: [".sr-panel"],
    },
  }

  get title() {
    return this.document.name
  }

  /** @override — Foundry's _onClickTab uses event.target which misses when clicking SVG icons inside <a> */
  _onClickTab(event) {
    const button = event.target.closest("[data-tab]")
    if (!button || button.classList.contains("active") || (event.button !== 0)) return
    const tab = button.dataset.tab
    const group = button.dataset.group
    this.changeTab(tab, group, {
      event 
    })
  }

  /** @override — refresh scroll indicators when tabs change */
  changeTab(...args) {
    super.changeTab(...args)
    if (this.element) requestAnimationFrame(() => { if (this.element) this._updateScrollFades(this.element) })
  }

  /**
	 * Toggle .can-scroll-up / .can-scroll-down on each .sr-panel-wrap
	 * so CSS indicators show when scrollable content is available.
	 */
  _updateScrollFades(root) {
    for (const panel of root.querySelectorAll('.sr-panel')) {
      const wrap = panel.closest('.sr-panel-wrap')
      if (!wrap) continue
      const update = () => {
        const {
          scrollTop, scrollHeight, clientHeight 
        } = panel
        wrap.classList.toggle('can-scroll-up', scrollTop > 2)
        wrap.classList.toggle('can-scroll-down', scrollTop + clientHeight < scrollHeight - 2)
      }
      update()
      if (!panel.dataset.scrollFade) {
        panel.dataset.scrollFade = '1'
        panel.addEventListener('scroll', update, {
          passive: true 
        })
      }
    }
  }


  static async _onToggleMode(event) {
    event.preventDefault()
    if (!this.isEditable) return
    const newMode = this.isPlayMode ? SR5ItemSheet.MODES.EDIT : SR5ItemSheet.MODES.PLAY
    game.user?.setFlag("sr5", `playMode.${this.item.id}`, newMode)
    await this.render({
      mode: newMode 
    })
  }

  /** Re-render when sibling items change on the parent actor (e.g. weapon list for weapon focus). */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    if (this.item.actor) {
      const rerender = (item) => {
        if (item.parent?.id === this.item.actor?.id) this.render()
      }
      this._createItemHookId = Hooks.on("createItem", rerender)
      this._deleteItemHookId = Hooks.on("deleteItem", rerender)
      this._updateItemHookId = Hooks.on("updateItem", rerender)
    }
    // Re-render ammo sheets when world itemAmmunitionType items change
    if (this.item.type === 'itemAmmunition') {
      const rerenderOnAmmoType = (item) => {
        if (item.type === 'itemAmmunitionType' && !item.parent) this.render()
      }
      this._ammoTypeCreateHookId = Hooks.on("createItem", rerenderOnAmmoType)
      this._ammoTypeDeleteHookId = Hooks.on("deleteItem", rerenderOnAmmoType)
      this._ammoTypeUpdateHookId = Hooks.on("updateItem", rerenderOnAmmoType)
    }
  }

  _onClose(options) {
    super._onClose(options)
    if (this._createItemHookId) {
      Hooks.off("createItem", this._createItemHookId)
      this._createItemHookId = null
    }
    if (this._deleteItemHookId) {
      Hooks.off("deleteItem", this._deleteItemHookId)
      this._deleteItemHookId = null
    }
    if (this._updateItemHookId) {
      Hooks.off("updateItem", this._updateItemHookId)
      this._updateItemHookId = null
    }
    if (this._ammoTypeCreateHookId) {
      Hooks.off("createItem", this._ammoTypeCreateHookId)
      this._ammoTypeCreateHookId = null
    }
    if (this._ammoTypeDeleteHookId) {
      Hooks.off("deleteItem", this._ammoTypeDeleteHookId)
      this._ammoTypeDeleteHookId = null
    }
    if (this._ammoTypeUpdateHookId) {
      Hooks.off("updateItem", this._ammoTypeUpdateHookId)
      this._ammoTypeUpdateHookId = null
    }
  }

  /** Save focused element info before re-render so we can restore it after. */
  _preRender(context, options) {
    super._preRender(context, options)
    const active = this.element?.querySelector(':focus')
    if (active) {
      this._savedFocus = {
        name: active.getAttribute('name'),
        selectionStart: active.selectionStart ?? null,
        selectionEnd: active.selectionEnd ?? null,
      }
    } else {
      this._savedFocus = null
    }
    // Save scroll positions for all panels
    const panels = this.element?.querySelectorAll('.sr-panel')
    this._savedScrollPositions = panels ? Array.from(panels).map(p => p.scrollTop) : []
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options)
    if (options.mode && this.isEditable) this._mode = options.mode
    else if (options.renderContext === `create${this.document.documentName}`) {
      this._mode = SR5ItemSheet.MODES.EDIT
    } else if (!options.mode && this.document?.id) {
      const saved = game.user?.getFlag("sr5", `playMode.${this.document.id}`)
      if (saved) this._mode = saved
    }
  }

  async _renderFrame(options) {
    const frame = await super._renderFrame(options)
    const header = frame.querySelector(".window-header")
    const closeButton = header?.querySelector('[data-action="close"]')

    // Play/Edit toggle button
    if (this.isEditable) {
      const toggleBtn = document.createElement("button")
      toggleBtn.type = "button"
      toggleBtn.classList.add("header-control", "icon", "fa-solid")
      toggleBtn.dataset.action = "toggleMode"
      if (closeButton) closeButton.before(toggleBtn)
      else header?.appendChild(toggleBtn)
    }

    // Move close button to the end
    if (closeButton) header?.appendChild(closeButton)

    return frame
  }

  // Strip ammo-derived fields from form submission to prevent persisting derived values
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData)
    if (this.item.type === 'itemWeapon' && this.item.system.ammunition?.type) {
      delete submitData['system.damageType']
      delete submitData['system.damageElement']
      delete submitData['system.damageElementSecond']
    }
    //The form only holds the fields of the accessories chosen from the list (name, slot, free): it rewrote the
    //whole list from them, dropping a mounted item accessory and the price and effects of the others
    const formAccessory = foundry.utils.getProperty(submitData, 'system.accessory')
    if (formAccessory && typeof formAccessory === 'object') {
      foundry.utils.setProperty(submitData, 'system.accessory', SR5_UtilityItem.mergeAccessoryForm(this.item._source.system?.accessory, formAccessory))
    }
    //An effect whose category changed loses the target of the old category, even one kept as "(not in the list)"
    clearTargetsOnCategoryChange(submitData, this.item._source.system)
    return submitData
  }

  /**
	 * Compute the panel/tab layout and sync Foundry's tabGroups.
	 * Each panel gets its own independent tab group.
	 */
  _computeSheetLayout() {
    const layout = computeItemLayout(this.item.type)

    // Sync Foundry's tabGroups — one independent group per panel
    for (const panel of layout.panels) {
      const group = panel.group
      if (!this.tabGroups[group] && panel.tabs.length > 0) {
        this.tabGroups[group] = panel.tabs[0].id
      }
      const activeId = this.tabGroups[group]
      if (activeId && !panel.tabs.some(t => t.id === activeId)) {
        this.tabGroups[group] = panel.tabs[0]?.id ?? null
      }
      for (const tab of panel.tabs) {
        tab.cssClass = tab.id === this.tabGroups[group] ? "active" : ""
      }
    }

    // Clean up stale groups
    const validGroups = new Set(layout.panels.map(p => p.group))
    for (const key of Object.keys(this.tabGroups)) {
      if (!validGroups.has(key)) delete this.tabGroups[key]
    }

    return layout
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const item = this.item
    context.item = item.toObject(false)
    context.system = item.system
    context.isEmbedded = item.isEmbedded
    context.owner = this.document.isOwner
    context.lists = SR5_EntityHelpers.sortTranslations(SR5)
    context.isPlay = this.isPlayMode
    // Faction of a contact (Cutting Aces p. 157), kept in the gamemaster's registry
    if (item.type === "itemContact") context.contactFaction = SR5FactionRegistry.factionOfContact(item.uuid)?.name ?? ""
    // Whom a custom drug can be made for (Chrome Flesh p. 194): the actors this user sees, and the one already named
    if (item.type === "itemDrug" && item.system.quality === "custom") {
      const recipients = Object.fromEntries((game.actors?.contents ?? []).filter(a => ["actorPc", "actorGrunt"].includes(a.type))
        .map(a => [a.id, a.name]))
      const named = item.system.preparedFor
      if (named && !recipients[named]) recipients[named] = game.actors?.get(named)?.name ?? named
      context.drugRecipients = recipients
    }
    // The actors a jammer in wireless mode leaves alone (SR5 p. 443), by name
    if (item.type === "itemGear" && item.system.jammer?.type) {
      context.jammerSpared = (item.system.jammer.spared ?? []).map(id => ({
        id, name: (id.includes(".") ? fromUuidSync(id)?.name : game.actors.get(id)?.name) ?? id
      }))
    }
    // An RP-Tac unit (Run & Gun p. 118-119): its members, from the GM's ledger; each member's combat mode skill
    if (item.type === "itemGear" && item.system.tacnetLevel) {
      context.tacnet = tacnetSheetContext(item)
      context.tacnetCombatSkills = Object.fromEntries(TACNET_COMBAT_SKILLS.map(k => [k, SR5.combatSkills[k]]))
      for (const member of context.tacnet.members) {
        const actor = fromUuidSync(member.uuid)
        member.canPick = context.tacnet.level >= 2 && !!actor?.isOwner
        member.combat = actor?.getFlag?.("sr5", TACNET_COMBAT_FLAG) ?? ""
      }
    }
    // Items that unfold into an actor wear a second picture: their token's
    context.hasTokenImage = SR5ItemSheet.SIDEKICK_TYPES.includes(item.type)
    // What the rule asks of a garage holding this kind of vehicle
    if (item.type === "itemStorage" && item.system.type === "garage") {
      context.garageRule = garageRequirement(item)
    }
    // A vendor's stock: its shelves, legality, cashbox
    if (item.type === "itemStorage" && item.system.type === "shop") {
      const {
        SR5ShopVendor
      } = await import("../../interface/shop-vendor.js")
      context.shop = SR5ShopVendor.sheetContext(item)
    }

    // Custom ammunition type choices for weapon ammo dropdown
    if (item.type === 'itemWeapon') {
      context.weaponAmmoTypeChoices = game.items
        .filter(i => i.type === 'itemAmmunitionType')
        .map(i => {
          const slug = i.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
          return {
            slug,
            name: i.name,
            selected: item.system.ammunition.type === slug
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      // Check if the current ammo type is a custom one (not in the built-in lists)
      const currentType = item.system.ammunition.type
      context.weaponAmmoTypeLinked = currentType && !SR5.allAmmunitionTypes?.[currentType]
      // When custom, don't pass the slug to selectOptions (avoids localization warning)
      context.weaponAmmoBuiltinType = context.weaponAmmoTypeLinked ? '' : currentType
      // Resolved ammo type display label for summary/chat
      if (context.weaponAmmoTypeLinked) {
        const match = context.weaponAmmoTypeChoices.find(c => c.selected)
        context.weaponAmmoTypeLabel = match ? `${game.i18n.localize('SR5.Custom')} (${match.name})` : game.i18n.localize('SR5.Custom')
      } else if (currentType && SR5.allAmmunitionTypes[currentType]) {
        context.weaponAmmoTypeLabel = game.i18n.localize(SR5.allAmmunitionTypes[currentType])
      } else {
        context.weaponAmmoTypeLabel = currentType || ''
      }
    }
    context.cssClass = this.document.isOwner ? "editable" : "locked"

    // Toxin: damage choices, and on a weapon the name of a dropped toxin
    if (item.type === "itemToxin") context.toxinDamageTypes = SR5.damageTypes
    if (item.type === "itemToxin") context.pathogenUnits = {
      minute: "SR5.Minutes", hour: "SR5.Hours", day: "SR5.Days", week: "SR5.Weeks", month: "SR5.Months"
    }
    context.isActiveGM = game.user.isGM && game.users.activeGM?.id === game.user.id
    // The strain of a head case is the GM's choice (Dark Terrors p. 91, monad-matrix.js)
    context.userIsGM = game.user.isGM
    // Chrome Flesh (séance G, G19, G20): the lot box shows with its optional rule; Prototype de transhumain's counter
    if (item.type === "itemAugmentation") context.augmentationBundleRule = game.settings.get("sr5", AUGMENTATION_BUNDLE_SETTING)
    // The highest Essence the implant took, shown to the active GM with the gesture that gives it back
    if (item.type === "itemAugmentation" && item.actor && game.users.activeGM?.isSelf) {
      context.essencePeak = game.settings.get("sr5", IMPLANT_REGISTER)?.[item.uuid]?.[PEAK_COST] ?? null
    }
    if (item.type === "itemQuality" && itemHasEffect(item, IMPLANT_ESSENCE_EFFECTS.transhumanPrototype)) {
      const points = item.system.transhumanEssence
      context.transhumanGift = (item.actor && transhumanGift(item.actor.items)) || {
        points, used: 0, remaining: points
      }
    }
    if (item.type === "itemWeapon") context.weaponToxinName = SR5_Toxins.nameOf(item.system.toxin, k => game.i18n.localize(k))

    // Mentor spirit: each effect picks its block, the Mask shows only with its optional rule
    context.isMentorSpirit = item.type === "itemMentorSpirit"
    if (context.isMentorSpirit) context.mentorMaskRule = game.settings.get("sr5", "mentorMask")

    // Mentor Spirit quality (SR5 p. 76): the mentor item of the same actor that carries its bonuses
    if (item.type === "itemQuality" && item.actor) {
      const mentors = item.actor.items.filter(i => i.type === "itemMentorSpirit")
      context.showLinkedMentor = mentors.length > 0 || isMentorQuality(item)
      context.linkedMentorChoices = mentors.map(m => ({
        value: m.id, label: m.name
      }))
    }
    // Illusionist (Forbidden Arcana p. 37): the spell type chosen with each level
    if (item.type === "itemQuality") context.showMasteryOption = (item.system.customEffects || [])
      .some(e => e?.target === "system.magic.masteries.illusionist")

    // Custom spirit type: pickers, and labels for the read-only summary
    if (item.type === "itemSpiritType") {
      const official = {
      }
      for (const [key, label] of Object.entries(SR5.spiritTypes)) {
        if (!SR5_SpiritTypes.registry.has(key)) official[key] = label
      }
      context.spiritTypeBaseChoices = official
      context.spiritTypeKeyPlaceholder = SR5_SpiritTypes.keyOf(item)
      context.spiritTypeAttributes = Object.keys(SR5.characterAttributes).map(key => ({
        key,
        label: SR5.characterAttributes[key],
        modifier: item.system.attributes[key]?.modifier ?? 0,
        override: item.system.attributes[key]?.override ?? null,
      }))
      const names = (list, table) => (list ?? []).map(k => game.i18n.localize(table[k] ?? k)).join(", ")
      context.spiritTypePowersLabel = names(item.system.powers, SR5.AllSpiritPowers)
      // A key already taken means the type is ignored; the sheet says so.
      context.spiritTypeKeyConflict = SR5_SpiritTypes.conflictFor(item)
      // What a spirit built on this type would actually have.
      context.spiritTypePreview = SR5_SpiritTypes.preview(item, SR5ItemSheet.SPIRIT_PREVIEW_FORCE)
      context.spiritTypePreviewForce = SR5ItemSheet.SPIRIT_PREVIEW_FORCE
      // Counted on the preview, so that inherited skills are included.
      context.spiritTypeSkillsCount = game.i18n.format("SR5.SpiritTypeSkillsCount",
        SR5_SpiritTypes.skillCounts(context.spiritTypePreview))
    }

    // Weapon focus: populate weapon choices from parent actor
    if (item.type === "itemFocus" && item.system.type === "weapon" && item.actor) {
      context.weaponChoices = SR5_UtilityItem._generateWeaponFocusWeaponList(item.actor)
    }

    // Qi focus: populate adept power choices from parent actor
    if (item.type === "itemFocus" && item.system.type === "qi" && item.actor) {
      context.adeptPowerChoices = SR5_UtilityItem._generateQiFocusAdeptPowerList(item.actor)
    }

    // Ammunition type choices for itemAmmunition (world itemAmmunitionType items)
    if (item.type === 'itemAmmunition') {
      context.ammunitionTypeChoices = game.items
        .filter(i => i.type === 'itemAmmunitionType')
        .map(i => ({
          uuid: i.uuid,
          name: i.name,
          selected: i.uuid === item.system.ammunitionTypeUuid
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      // When a custom type is linked, don't pass the slug to selectOptions (avoids localization warning)
      context.ammoBuiltinType = item.system.ammunitionTypeUuid ? '' : item.system.type
    }

    // Dynamic layout
    context.layout = this._computeSheetLayout()
    context.hasFooter = ITEM_FOOTER_TYPES.has(item.type)

    return context
  }

  _onRender(context, options) {
    super._onRender(context, options)
    const el = this.element

    // Effects tab: a stored target missing from the lists is kept, and the effects are locked when they are the GM's (G14)
    keepUnlistedEffectFields(el, this.document._source?.system, game.i18n.localize('SR5.EffectUnlisted'))
    if (this.isEditable && !canEditItemEffects(game.user, this.document.isOwner)) lockEffectFields(el)

    // Mentor Spirit quality: drop a mentor item of the same actor to link it
    const mentorDrop = el.querySelector('.sr5-mentor-drop')
    if (mentorDrop && this.isEditable) {
      mentorDrop.addEventListener('dragover', ev => ev.preventDefault())
      mentorDrop.addEventListener('drop', ev => this.#onDropMentor(ev))
    }

    // Pathogen: the active GM infects the tokens he selected or targeted (system/diseases.js)
    el.querySelector('.sr5-pathogen-infect')?.addEventListener('click', () => infectWith(this.document))

    // Weapon toxin: drop a toxin item, resync it, or go back to the book list
    const toxinDrop = el.querySelector('.sr5-toxin-drop')
    if (toxinDrop && this.isEditable) {
      toxinDrop.addEventListener('dragover', ev => ev.preventDefault())
      toxinDrop.addEventListener('drop', ev => this.#onDropToxin(ev))
      el.querySelector('.sr5-toxin-resync')?.addEventListener('click', () => this.#linkToxin(this.document.system.toxin.custom?.uuid))
      el.querySelector('.sr5-toxin-unlink')?.addEventListener('click', () => this.document.update({
        "system.toxin.type": "", "system.toxin.custom": null
      }))
    }

    // Ammunition type select: handle "Custom" selection
    el.querySelectorAll('.sr-ammo-type-select').forEach(select => {
      select.addEventListener('change', async (ev) => {
        const val = ev.target.value
        if (val === 'custom') {
          ev.preventDefault()
          ev.stopPropagation()
          await this.item.update({
            'system.type': '',
            'system.ammunitionTypeUuid': 'pending'
          })
        } else if (this.item.system.ammunitionTypeUuid) {
          ev.preventDefault()
          ev.stopPropagation()
          await this.item.update({
            'system.type': val,
            'system.ammunitionTypeUuid': ''
          })
        }
      })
    })

    // Second dropdown: custom ammo type selection
    el.querySelectorAll('.sr-ammo-type-custom-select').forEach(select => {
      select.addEventListener('change', async (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        const uuid = ev.target.value
        if (!uuid) return
        const ammoType = game.items.get(uuid.split('.').pop())
        if (!ammoType) return
        const slug = ammoType.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        const s = ammoType.system
        await this.item.update({
          'system.type': slug,
          'system.ammunitionTypeUuid': uuid,
          'system.effects.apMod': s.apMod ?? 0,
          'system.effects.damageMod': s.damageMod ?? 0,
          'system.effects.damageType': s.damageType ?? '',
          'system.effects.damageElement': s.damageElement ?? '',
          'system.effects.accuracyMod': s.accuracyMod ?? 0,
          'system.effects.blastRadius': s.blastRadius ?? 0,
          'system.effects.blastFallOff': s.blastFallOff ?? 0,
          'system.effects.flatDamage': s.flatDamage ?? 0,
          'system.effects.disableStrDamage': s.disableStrDamage ?? false,
          'system.effects.overrideBaseAP': s.overrideBaseAP ?? false,
          'system.effects.scatterDice': s.scatterDice ?? 0,
          'system.effects.envRangeMod': s.envRangeMod ?? 0,
          'system.effects.envWindMod': s.envWindMod ?? 0,
          'system.effects.gelDamageReduction': s.gelDamageReduction ?? 0,
          'system.effects.injectionNetHits': s.injectionNetHits ?? 0,
          'system.effects.showToxinButton': s.showToxinButton ?? false,
          'system.effects.antiVehicleAP': s.antiVehicleAP ?? 0,
          'system.effects.calledShotTags': s.calledShotTags ?? [],
          'system.effects.calledShotOverrides': s.calledShotOverrides ?? {
          },
        })
      })
    })

    // Weapon ammunition type select: explicitly handle all changes
    el.querySelectorAll('.sr-weapon-ammo-type-select').forEach(select => {
      select.addEventListener('change', async (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        const val = ev.target.value
        if (val === 'custom') {
          await this.item.update({
            'system.ammunition.type': '_custom_pending'
          })
        } else {
          await this.item.update({
            'system.ammunition.type': val
          })
        }
      })
    })

    // Weapon second dropdown: custom ammo type selection
    el.querySelectorAll('.sr-weapon-ammo-type-custom-select').forEach(select => {
      select.addEventListener('change', async (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        const slug = ev.target.value
        if (!slug) return
        await this.item.update({
          'system.ammunition.type': slug
        })
      })
    })

    // Play/Edit mode classes
    el.classList.toggle("sr-mode-edit", this.isEditMode)
    el.classList.toggle("sr-mode-play", this.isPlayMode)

    // Update toggle button icon
    const toggleBtn = el.querySelector('[data-action="toggleMode"]')
    if (toggleBtn) {
      toggleBtn.classList.toggle("fa-lock", this.isPlayMode)
      toggleBtn.classList.toggle("fa-lock-open", this.isEditMode)
      toggleBtn.dataset.tooltip = this.isPlayMode ? "SR5.SwitchToEdit" : "SR5.SwitchToPlay"
    }

    // Disable form inputs in duplicate block instances to prevent FormDataExtended conflicts
    const seenBlocks = new Set()
    for (const blockEl of el.querySelectorAll("[data-block-id]")) {
      const blockId = blockEl.dataset.blockId
      if (seenBlocks.has(blockId)) {
        for (const input of blockEl.querySelectorAll("input[name], select[name], textarea[name]")) {
          input.removeAttribute("name")
          input.setAttribute("tabindex", "-1")
        }
      } else {
        seenBlocks.add(blockId)
      }
    }

    // Activate initial tabs for all groups
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      if (tab) this.changeTab(tab, group, {
        force: true, updatePosition: false 
      })
    }

    // Tab nav click handlers — explicit listeners because data-action="tab" doesn't
    // work reliably with SVG icons inside <a> elements
    el.querySelectorAll(".tabs [data-tab][data-action='tab']").forEach(link => {
      link.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        const tab = link.dataset.tab
        const group = link.dataset.group
        if (tab && group && !link.classList.contains("active")) {
          this.changeTab(tab, group, {
            event 
          })
        }
      })
    })

    // Custom dropdown enhancement
    enhanceSelects(el)

    // Scroll indicators
    this._updateScrollFades(el)

    // Sub-item management (add/delete/clone effects, licenses, etc.)
    el.querySelectorAll(".subItem").forEach(node => node.addEventListener("click", this.#onManageSubItem.bind(this)))

    // Accessory choice
    el.querySelectorAll(".accessoryChoice").forEach(node => node.addEventListener("click", this.#onAccessoryChoice.bind(this)))

    // Item-based accessory checkbox toggles (avoid form submission destroying item data)
    el.querySelectorAll(".accessory-toggle").forEach(node => node.addEventListener("change", this.#onAccessoryToggle.bind(this)))
    //The combat mode skill of an RP-Tac member (Run & Gun p. 119): his own pick, kept on his actor
    el.querySelectorAll("[data-tacnet-combat]").forEach(node => node.addEventListener("change", async (ev) => {
      ev.stopPropagation()
      const actor = await fromUuid(ev.target.dataset.tacnetCombat)
      if (actor?.isOwner) await actor.setFlag("sr5", TACNET_COMBAT_FLAG, ev.target.value)
    }))

    // Help Display (mouseover/mouseout — cannot use data-action)
    el.querySelectorAll("[data-helpTitle]").forEach(node => {
      node.addEventListener("mouseover", this._displayHelpText.bind(this))
      node.addEventListener("mouseout", this._hideHelpText.bind(this))
    })

    // Condition monitor boxes
    el.querySelectorAll(".boxes:not(.box-disabled)").forEach(node => node.addEventListener("click", (ev) => {
      let itemData = foundry.utils.duplicate(this.item)
      let index = Number(ev.currentTarget.dataset.index)
      let target = ev.currentTarget.closest(".SR-MoniteurCases").dataset.target

      let value = foundry.utils.getProperty(itemData, target)
      if (value == index + 1)
        foundry.utils.setProperty(itemData, target, index)
      else foundry.utils.setProperty(itemData, target, index + 1)

      this.item.update(itemData)
    }))

    // Restore focus after re-render (e.g. when tabbing between fields triggers submitOnChange)
    if (this._savedFocus?.name) {
      const target = el.querySelector(`[name="${CSS.escape(this._savedFocus.name)}"]`)
      if (target && target !== document.activeElement) {
        target.focus()
        try {
          if (this._savedFocus.selectionStart != null && typeof target.setSelectionRange === 'function') {
            target.setSelectionRange(this._savedFocus.selectionStart, this._savedFocus.selectionEnd)
          }
        } catch { /* not all input types support setSelectionRange */ }
      }
      this._savedFocus = null
    }

    // Restore scroll positions for all panels
    if (this._savedScrollPositions?.length) {
      const panels = el.querySelectorAll('.sr-panel')
      this._savedScrollPositions.forEach((top, i) => {
        if (panels[i]) panels[i].scrollTop = top
      })
      this._savedScrollPositions = null
    }
  }

  async #onDropToxin(event) {
    event.preventDefault()
    event.stopPropagation()
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
    if (data?.type !== "Item") return
    return this.#linkToxin(data.uuid)
  }

  async #onDropMentor(event) {
    event.preventDefault()
    event.stopPropagation()
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
    if (data?.type !== "Item") return
    const mentor = await fromUuid(data.uuid)
    if (mentor?.type !== "itemMentorSpirit" || !this.document.actor || mentor.parent?.id !== this.document.actor.id) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NotOwnMentor"))
    await this.document.update({
      "system.linkedMentor": mentor.id
    })
  }

  // Copy a toxin item onto the weapon: the roll and the chat card read the copy (SR5_Toxins.profileOf)
  async #linkToxin(uuid) {
    const toxin = uuid ? await fromUuid(uuid) : null
    if (toxin?.type !== "itemToxin") return ui.notifications.warn(game.i18n.localize("SR5.WARN_NotAToxin"))
    await this.document.update({
      "system.damageElement": "toxin",
      "system.toxin.type": "custom",
      "system.toxin.custom": SR5_Toxins.profileFromItem(toxin),
    })
  }

  // Manage "Sub Item", accessory, licenses, effects...
  async #onManageSubItem(event) {
    event.preventDefault()
    const a = event.currentTarget
    const itemData = this.item.system
    let target = a.dataset.binding
    let action = a.dataset.subaction
    let key = `system.${target}`

    // Submit any unsaved changes before modifying sub-items
    if (this.isEditable) {
      const formData = new foundry.applications.ux.FormDataExtended(this.element)
      const submitData = this._processFormData(null, this.element, formData)
      if (submitData && Object.keys(submitData).length) {
        await this.document.update(submitData)
      }
    }

    if (action === "add") {
      if (typeof itemData[target] === "object") { itemData[target] = Object.values(itemData[target]) }
      return this.item.update({
        [key]: itemData[target].concat([[""]])
      })
    }

    if (action === "delete") {
      const li = a.closest(".subItemManagement")
      //An accessory list is written back from its stored entries, not from the prepared copies of the mounted items
      let removed = foundry.utils.duplicate(target === "accessory" ? this.item._source.system.accessory : this.item.system[target])
      if (typeof removed === "object") { removed = Object.values(removed) }
      let [gone] = removed.splice(Number(li.dataset.key), 1)
      await this.item.update({
        [key]: removed
      })
      //The accessory taken off is free to be mounted again
      if (target === "accessory" && gone?._id) await SR5_UtilityItem.unplugRemovedAccessory(this.item.actor, gone._id)
      return
    }

    if (action === "clone") {
      const li = a.closest(".subItemManagement")
      let cloned = foundry.utils.duplicate(this.item.system[target])
      if (typeof cloned === "object") { cloned = Object.values(cloned) }
      cloned.push(cloned[Number(li.dataset.key)])
      return this.item.update({
        [key]: cloned 
      })
    }
  }

  // Manage accessory choice
  async #onAccessoryChoice(event) {
    let type = event.currentTarget.dataset.type
    let accessoriesList = {
    }

    // For weapons, build set of already-attached accessory IDs
    let attachedIds = new Set()
    if (type === "itemWeapon") {
      const attached = this.item.system.accessory || []
      const arr = Array.isArray(attached) ? attached : Object.values(attached)
      for (const a of arr) {
        if (a._id) attachedIds.add(a._id)
      }
    }

    for (let i of this.item.actor.items) {
      if (type === "itemArmor") {
        if ((i.type === "itemArmor" || i.type === "itemGear") && i.system.isAccessory && !i.system.isPlugged) {
          accessoriesList[i.id] = i.name
        }
      } else if (type === "itemWeapon") {
        if (i.type === "itemWeapon" && i.system.isAccessory && !i.system.isPlugged && !attachedIds.has(i.id)) {
          accessoriesList[i.id] = i.name
        }
      } else {
        if ((i.type === type) && i.system.isAccessory && !i.system.isPlugged) {
          accessoriesList[i.id] = i.name
        }
      }
    }

    let sortedList = SR5_EntityHelpers.sortObjectValue(accessoriesList)

    let dialogData = {
      accessoriesList: sortedList
    }

    const dlg = await foundry.applications.handlebars.renderTemplate("systems/sr5/templates/interface/chooseAccessory.hbs", dialogData)
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('SR5.ChooseAccessory') 
      },
      content: dlg,
      buttons: [
        {
          action: "ok",
          label: "Ok",
          default: true,
          callback: (event, button, dialog) => ({
            action: "ok", element: dialog.element 
          }),
        },
        {
          action: "cancel",
          label: "Cancel",
          callback: () => ({
            action: "cancel" 
          }),
        },
      ],
      rejectClose: false,
    })
    if (!result || result.action !== "ok") return
    let accessory = result.element.querySelector("[name=accessory]")?.value
    if (accessory) {
      let aItem = this.actor.items.find(i => i.id === accessory)
      //Its source: the prepared copy carried the accessory's computed price, dice pools and monitors into the host's
      //source. The host's preparation reads only stored fields of it (price.base, itemEffects, weaponAccessory)
      let accObj = aItem.toObject()
      // Set top-level flags for template/processing compatibility
      accObj.isActive = true
      accObj.isFree = false
      let cloned = foundry.utils.deepClone(this.item.system.accessory)
      if (typeof cloned === "object" && !Array.isArray(cloned)) cloned = Object.values(cloned)
      cloned.push(accObj)
      await this.item.update({
        "system.accessory": cloned
      })
      await aItem.update({
        "system.isActive": this.item.system.isActive,
        "system.wirelessTurnedOn": this.item.system.wirelessTurnedOn,
        "system.isPlugged": true,
      })
    }
  }

  // Toggle isFree/isActive on item-based accessories without form submission
  async #onAccessoryToggle(event) {
    event.preventDefault()
    event.stopPropagation()
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const checked = event.currentTarget.checked
    let accessories = foundry.utils.deepClone(this.item.system.accessory)
    if (typeof accessories === "object" && !Array.isArray(accessories)) {
      accessories = Object.values(accessories)
    }
    if (accessories[index]) {
      accessories[index][field] = checked
      await this.item.update({
        "system.accessory": accessories
      })
    }
  }

  /* -------------------------------------------- */

  async _displayHelpText(event) {
    if (!game.settings.get("sr5", "sr5Help.active")) return false

    let target = document.querySelector("#sr5help")
    if (!target) return

    let property
    const helpTitle = document.querySelector("#sr5helpTitle")
    const helpMessage = document.querySelector("#sr5helpMessage")
    const helpDetails = document.querySelector("#sr5helpDetails")

    if (helpTitle) helpTitle.innerHTML = ""
    if (helpMessage) helpMessage.innerHTML = ""
    if (helpDetails) helpDetails.innerHTML = ""

    {
      const el = event.currentTarget
      if (helpTitle) helpTitle.innerHTML = el.dataset.helptitle || ""

      if (el.dataset.helpmessage && helpMessage) helpMessage.innerHTML = "<div class='helpMessage'><em>" + el.dataset.helpmessage + "</em></div>"

      let details = el.dataset.helpdetails
      if (details) {
        property = SR5_EntityHelpers.resolveObjectPath(`item.system.${details}`, this)
      }

      if (property) {
        let detailsHTML = `${game.i18n.localize('SR5.HELP_CalculationDetails')}<ul>`
        if (property.modifiers && property.modifiers.length) {
          if (property.base) detailsHTML += `<li>${game.i18n.localize('SR5.HELP_CalculationBase')}${game.i18n.localize('SR5.Colons')} ${property.base}</li>`
          for (let modifier of Object.values(property.modifiers)) {
            detailsHTML = detailsHTML + `<li>${modifier.source} [${modifier.type}]${game.i18n.localize('SR5.Colons')} ${(modifier.isMultiplier ? 'x' : (modifier.value >= 0 ? '+' : ''))}${modifier.value}</li>`
          }
        }
        detailsHTML += `<li>${game.i18n.localize('SR5.HELP_CalculationTotal')}${game.i18n.localize('SR5.Colons')} ${property.value}</li></ul>`
        if (helpDetails) helpDetails.innerHTML = detailsHTML
      }
      target.classList.add("active")
    }
  }

  async _hideHelpText() {
    let target = document.querySelector("#sr5help")
    if (target) {
      target.classList.remove("active")
    }
  }

}
