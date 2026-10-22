# Public API of the system (game.sr5) and its hooks

*Cette page liste, pour les auteurs et autrices de modules, tout ce que le système Shadowrun 5 (unofficial) offre aux modules : l'objet `game.sr5` et les crochets `sr5.*`, avec leur contrat.*

System version 13.1.0 (the public 1.0). A module calls what is listed here instead of importing the system's files
by their path, which may move. Anything not listed here is internal and may change without notice.

Two tests keep this page true: `tests/api-publique-game-sr5.test.js` fails when a key of `game.sr5` or a hook is added
or removed without this page; `tests/api-publique-crochets.test.js` checks the contract of every hook against Foundry's
own `Hooks`.

## General rules

- **The book first.** Without a module, every hook has no subscriber and the system plays the book (SR5 and the
  supplements it implements). A world's house rule lives in a module, through a hook; never in the system.
- **Who may call.** A call marked *GM* does nothing (or answers `false`/`null`, with a warning) on a player's browser.
  A call marked *active GM* writes only on the active gamemaster's browser. A call marked *relayed* may be made by
  anyone: on a player's browser it sends a request to the active gamemaster, who checks it again and writes
  (answer `"relayed"`). Nothing here is hardened against the console (decision of 06/10): the guards protect the
  table from mistakes, not from cheating.
- **Bad arguments.** An unknown actor, a missing uuid, a value of the wrong kind: the call answers its empty value
  (`false`, `null`, `0`, `""`, `[]`) and throws nothing.
- **Copies.** Every read that returns the system's data returns a copy: changing it changes nothing.
- **Frozen.** `commcode`, `contacts`, `infoBroker`, `factionRegistry` and `tokenDefaults` are frozen
  (`Object.freeze`): a module cannot replace one of their calls. The others are plain objects; do not replace their
  members either.
- **Actors.** Where a call takes an "actor", it also takes a token, a TokenDocument or a uuid unless said otherwise
  (`actorOf`, matrix-api.js). An unlinked token is its own actor.

## game.sr5

Filled once, in the `init` hook (`modules/hooks/init.js`, `game.sr5 = {…}`). Use it from `setup` or `ready` on.

| Key | Source | Contract | Who | Tests |
| --- | --- | --- | --- | --- |
| `game.sr5.config` | config.js | The system's configuration (`SR5`), translations sorted. Read only. | anyone | — |
| `game.sr5.entities` | entityActor.js, entityItem.js | `{SR5Actor, SR5Item}`, the document classes. | anyone | — |
| `game.sr5.migration` | migration.js | The migration class of the system (old worlds). Do not call it from a module. | GM | migration tests |
| `game.sr5.macros` | interface/macros.js | `createSR5MacroItem(data, slot)`, `createSR5Macro(data, slot)`, `rollItemMacro(itemUuid)`, `rollMacro(type, subType)`: what the hotbar uses. | anyone | — |
| `game.sr5.rollItemMacro` | interface/macros.js | `rollItemMacro(itemUuid)`: roll the item of a macro. | owner of the item | — |
| `game.sr5.rollMacro` | interface/macros.js | `rollMacro(type, subType)`: roll a test of the selected actor. | owner | — |
| `game.sr5.compendiumBrowser` | interface/compendium-browser.js | `open(initialType = null)`: the compendium browser. | anyone | compendium-browser tests |
| `game.sr5.shop` | interface/shop-window.js | `open({actor, source, shelf, sub, creation})`: the world's shop window. | anyone (the shop's own rights) | shop tests |
| `game.sr5.primaryLifestyle` | system/lifestyle-primary.js | `(actor) → item or null`: the main lifestyle (SR5 p. 97): the one marked, or the only one; `null` when several and none marked, or no actor. | anyone | lifestyle-primary.test.js |
| `game.sr5.creationOverLimitItems` | system/creation-actor.js | `(actor) → [{id, name, reason, value, limit}]`: items bought past the creation limits where the table allows it. | anyone | shop-creation-over-limit.test.js |
| `game.sr5.dealership` | interface/dealership-window.js | `open({actor, vehicle})`: build and buy a vehicle or a drone. | anyone | — |
| `game.sr5.factions` | interface/factions-app.js | `open()`: the factions window (Cutting Aces p. 156-160). | anyone (GM writes) | factions tests |
| `game.sr5.factionRegistry` | interface/faction-registry.js | See below. | reads anyone, `update` active GM | faction-registry-api.test.js |
| `game.sr5.shopAudit` | interface/shop-window.js | `() → Promise`: checks the shop against the till; should answer no difference. Console tool. | GM | — |
| `game.sr5.convertMentorQualities` | entities/items/mentor-conversion.js | `({actor, all}) → Promise`: old-style Mentor Spirit qualities to a quality linked to a mentor item (SR5 p. 76). Without option, asks which actors. | GM (warning otherwise) | mentor-conversion tests |
| `game.sr5.revertMentorConversion` | entities/items/mentor-conversion.js | `({actor, all}) → Promise`: undoes the above. | GM | mentor-conversion tests |
| `game.sr5.activateAutomaticPowers` | entities/items/always-active-macro.js | `({actor, all}) → Promise`: switches on the always active powers of old sheets (SR5 p. 396). | GM (warning otherwise) | always-active-macro.test.js |
| `game.sr5.panCrown` | canvas/pan-crown/pan-crown.js | See below. | see below | pan tests, api-publique-game-sr5.test.js |
| `game.sr5.combat` | system/combat-api.js | See below. | owner | api-matrice-v1.test.js |
| `game.sr5.matrix` | system/matrix-api.js | See below. | see below | api-matrice-marks-convergence.test.js, api-networks-marks-broker.test.js |
| `game.sr5.tokenDefaults` | system/token-defaults.js | `families` (`spirit, sprite, ice, device, drone, agent`), `family(type, deviceType)`, `tokenChanges(family)`, `prototypeChanges(family)`, `current()`: the GM's token of each family the system creates. Frozen. | anyone (reads) | lot9-compendiums-tokens.test.js |
| `game.sr5.vendors` | interface/shop-vendor.js | `create({templateKey, name, banner, linked, restock})` (GM, `null` otherwise or for an unknown template), `open(actorUuid, storageId)` (the shop's rights: the GM any shop, a player an open one; `null` when refused), `templates`, `families`. | see left | shop-vendor-api.test.js |
| `game.sr5.spriteTypes` | entities/actors/sprite-types.js | `register(key, def)` during `init` or `setup` (`null` when refused: a book type, a key that is not a word, no label), `get(type)`, `keys()`, `isBuiltIn(type)`. | anyone | sprite-types-registry.test.js |
| `game.sr5.commcode` | interface/commcode-api.js | See below. Frozen. | relayed | contacts-api.test.js, api-publique-game-sr5.test.js |
| `game.sr5.contacts` | interface/commcode-api.js | See below. Frozen. | owner | contacts-api.test.js, api-publique-game-sr5.test.js |
| `game.sr5.infoBroker` | interface/info-broker-api.js | See below. Frozen. | anyone | api-networks-marks-broker.test.js, api-publique-game-sr5.test.js |

### game.sr5.factionRegistry (Cutting Aces p. 156-160)

- `data`: a copy of `{factions: [{id, name, type, enemies, members, contacts, note}], log: [...], raises: {...}}`.
- `canWrite`: `true` on the active gamemaster's browser only.
- `faction(id)`, `factionOfActor(actorId)`, `factionOfContact(itemUuid)`: a copy, or `null`.
- `score(factionId, actorId)`, `standing(actorId)`, `attitudeFor(actorId, targetActor)` (`null` without a faction).
- `update(mutate) → Promise<boolean>`: *active GM*; `false` with a warning elsewhere, before anything is written.
  `mutate(data)` must be synchronous (an async one writes nothing). One main faction per member and per contact is
  kept by the system (the one just joined wins).

### game.sr5.combat

- `spendAction(actor, type, {value = 1, source}) → Promise<boolean>`: counts a `free`, `simple` or `complex` action as
  the system does. `false` for an unknown type, a count that is not a whole number ≥ 1, no actor, or no action left.
  `true` out of combat (nothing counted).
- `switchInitiative(actor, initiative) → Promise<boolean>`: `physicalInit`, `astralInit` or `matrixInit`, at the
  system's cost; `false` when refused.

### game.sr5.matrix

- `placeMarks(attacker, target, count, {source, watchdog}) → Promise<boolean|"relayed">`: *relayed*. 1 to the cap
  (3 by the book, SR5 p. 237, or `sr5.matrixMarkCap`); `false` for a bad count, no attacker, or a target that carries
  no mark; `false` with a warning on a player's browser when no gamemaster is connected.
- `converge(persona, {host}) → Promise<boolean|"relayed">`: *relayed*. The grid's convergence (SR5 p. 233), or the
  host's (SR5 p. 249). `false` without a persona, or with a host it cannot find.
- `convergenceThreshold(persona) → number`: the world's threshold (40 by the book), 10 lower with Wanted by GOD.
- `enterHost(persona, host, {spendAction = true, force = false, chat = true}) → Promise<boolean>`,
  `exitHost(persona, {reason = "exit", spendAction, chat = true, warn = true}) → Promise<boolean>`,
  `currentHost(persona) → Promise<actor|null>`: being inside a host (SR5 p. 240).
- `marksOn(persona, host) → number` (0 to 3, at once, no promise; 0 when either cannot be read),
  `markedHosts(persona) → [{host, uuid, name, marks}]` (most marks first; `[]` without a persona).

### game.sr5.panCrown

- `getGraph(subject, {viewer}) → graph|null`: the crown of a PAN as the viewer sees it.
- `toggle(subject)`, `open(subject)`, `close(subject)`, `isOpen(subject) → boolean`, `refresh(subject?)`: on the canvas.
- `setReveal(node, revealed)`: *GM*; reveals a device to the whole table, or hides it again. Nothing for a player,
  without a node, or for a node whose device cannot be found.
- `rollMatrixActionOn(actor, actionKey, {targetTokenId, targetUuid})`: a Matrix action of the system against a device.
- `registerIcon(category, path) → boolean`: a generic icon of a module.

### game.sr5.commcode

Every request goes through the active gamemaster (commcode-traffic.js `handleCommcodeRequest`): only the active GM
answers, only for a known user. A refusal is a notification on the asking user's screen, reason one of
`noDevice, owner, noCommcode, offline, jammed, bricked, noRecipient, self, empty, busy, unknown, noMark, gm, cipherOff`.

- `open()`, `openDevice(deviceUuid)`, `cipherTool()` (GM).
- `call({deviceUuid, to, text})`, `message({deviceUuid, to, text, key})`: from a device the user owns (`owner`
  otherwise, `noDevice` when it is none). The gamemaster alone may speak for a commcode no sheet carries:
  `{asCommcode, asName, to, text}` (`gm` for a player). A message needs a text (`empty`), a call or a message a
  recipient (`noRecipient`).
- `answer(entryId, {side = "to"})`, `refuse(entryId, {side = "to"})`, `hangup(entryId, {side})`, `say(entryId, text, {side})`.
- `entries()`, `unanswered()`: copies of the register. The gamemaster gets all of it; a player only the entries her
  characters' devices see in their own window (all they sent, what they received once it reached them). The world
  setting that holds the register stays readable by anyone: the filter is what a module shows, not a lock.
- `directory.get(actor)`, `directory.set(actor, list)`, `directory.add(actor, {name, commcode})`: the owner writes it.
- `commcodeOf(actor) → Promise<string>` (`""` when none), `generate() → string`: a commcode none of the devices and
  contacts the calling user can see has yet. Called by a player, it does not see the actors hidden from her: the code
  may already be taken by one of them (far less than one chance in a billion per hidden code), and nothing checks it
  again when it is written. `contacts.commcodeOf(item, {create: true})` draws its code the same way.

### game.sr5.contacts

- `favorActions`: the favor actions (Run Faster p. 170-172), frozen.
- `favor(item, kind = "ask")`: a favor action of the contact's sheet, its owner only.
- `commcodeOf(item, {create}) → Promise<string>`: `""` for what is not a contact; with `create`, a contact without one
  gets one, written by its owner.
- `ofCommcode(commcode) → items`: the contacts that carry this commcode (read only).

### game.sr5.infoBroker (Cutting Aces p. 148-149)

- `tabs`: `buy`, `sell`, `requests`.
- `open({vendor, buyer, tab}) → Promise<window>`: a buyer the user does not own is dropped (the gamemaster opens for
  anyone); an unknown tab is ignored.

## Hooks

Two kinds of hooks.

- **Verdict hooks** hand an object to set. The system calls the subscribers **one by one** (never through
  `Hooks.callAll`): a subscriber that throws has its answer thrown away (what it wrote is put back) and its error
  logged, the others' answers are kept. An answer of the wrong kind leaves the book's. Since 22/10 this holds for every
  verdict hook below (`guardedCall` / `verdictCall` / `callSubscribers`, `modules/system/house-rule-hooks.js`).
  A subscriber must be synchronous: what an async one writes after its first `await` is too late.
- **Telling hooks** tell what happened; nothing is read back. They go through `Hooks.callAll`: a subscriber that
  throws is logged by Foundry, the others are called, the system goes on.

A subscriber that must answer the same on every browser (prices, refusals) must not depend on the user.

### Verdict hooks: house rules (Câblage Maison)

| Hook | Called | Data | Answer | The book |
| --- | --- | --- | --- | --- |
| `sr5.rollReminders` | the roll dialog opens (house-rule-hooks.js `rollRemindersFor`) | `{actor, rollData (copy), reminders: []}` | push `{label, source?, dice?}`, `dice` −6 to +6; up to 10 lines; shown with an unticked "applies" box | no line |
| `sr5.vendorPrice` | a vendor's price is counted (cart and till) | `{vendor, storage, buyer, item (copy), price, quantity, notes: []}` | `price`: a finite number ≥ 0, rounded; `notes`: up to 5 texts | the book's price |
| `sr5.purchaseFunds` | a purchase costs more than the accounts hold | `{buyer, total, balance, shortfall, vendor, storage, allow: false, flags: {}, warning: ""}` | `allow = true` lets it go; `flags.<module id>` (plain object, never `sr5`) on the debit; `warning` (500 characters) confirmed by the buyer | refused |
| `sr5.vendorRefusal` | a buyer is chosen at a vendor's, and at the till | `{vendor, storage, buyer, refuse: false, reason: ""}` | `refuse = true`, `reason` shown | it sells |
| `sr5.initiativeReminders` | each combatant's Initiative (srcombat.js) | `{actor, combatant, combat, round, firstRound, pass, roll, reminders: []}` | push `{label, source?, score?}`, `score` −10 to +10, added at once (never below 0) | the roll |
| `sr5.situationalArmor` | damage resistance of a character, before AP and Stun (SR5 p. 170-171) | `{actor, attack, card (copy), armor, bonuses: []}` | push `{label, source?, value}`, `value` 1 to 20 | nothing added |
| `sr5.fadingResistance` | a technomancer's Fading pool (entities/actors/fading-resistance.js) | `{actor, persona: "resonance"\|"nanite", attribute: "willpower"}` | `attribute`: a key of `SR5.characterAttributes` the actor has | Willpower (SR5 p. 254) |
| `sr5.essenceCostFor` | the Essence of an implant, at the till and on the sheet (system/implant-essence.js) | `{actor, item (copy), cost, creation, context: "shop"\|"sheet"}` | `cost`: a finite number ≥ 0 | the book's cost |

### Verdict hooks: the Matrix and the crown of a PAN

| Hook | Called | Data (arguments) | Answer | The book |
| --- | --- | --- | --- | --- |
| `sr5.matrixMarkCap` | marks are put (system/matrix-hooks.js) | `{attacker, target, cap: 3}` | `cap`: a whole number ≥ 1 | 3 (SR5 p. 237) |
| `sr5.matrixEffectiveMarks` | the marks that count for an action | `{viewer, target, key, marks}` | `marks`: a finite number ≥ 0 | the marks carried |
| `sr5.matrixHostEntry` | the crown of a host offers Enter / Exit Host | `{actor, host, offer: true}` | `offer = false` hides the system's entry | offered |
| `sr5.matrixDirectConnection` | a slave defends (rolls/roll-helpers/direct-connection.js) | `(attacker, device, {direct})` | `direct`: `true` or `false` (anything else: `false`) | the device's switch (SR5 p. 234) |
| `sr5.matrixAdministrator` | who owns a host's icon (system/matrix-ownership.js) | `{actor, target, host, administrator: null}` | `administrator`: `true` or `false` | unknown (`null`) |
| `sr5.iceLegitimateUser` | a Sleuther's dice (system/ice-sleuther.js, Kill Code p. 74) | `{roller, ice, host, legitimate: false}` | `legitimate = true`: a spider of the host | not a spider |
| `sr5.matrixPerceptionInfo` | the GM resolves a Matrix Perception (canvas/pan-crown/pan-perception-card.js) | `{observer, target, choices, answers: {}}` | `answers.<choice key>`: what the GM would type | the GM types it |
| `sr5.panCrownGraph` | a crown is built (canvas/pan-crown/pan-hooks.js) | `(graph (copy), token, actor)` | push nodes `{uuid, …}` and lines `{from, to, kind?, color?}`; the system's nodes cannot be removed | the system's graph |
| `sr5.panCrownVisibility` | each node, for a player | `(node (copy), viewer, {visible, reason}, {token, actor})` | `visible = false` hides it (never shows what the system hides; never for the GM) | the system's visibility (SR5 p. 236-238) |
| `sr5.panCrownActions` | the radial menu of a node | `(node (copy), viewer, entries)` | grey out a system entry (`enabled = false`, `extraReason`), push `{key, label, tooltip?, enabled?, onClick}` | the system's menu |

### Telling hooks

| Hook | Called with | When |
| --- | --- | --- |
| `sr5.matrixHostChanged` | `(actor, hostUuid\|null, previousUuid\|null, reason)`, reason `enter, exit, reboot, jackOut` | a persona enters or leaves a host (system/matrix-host-presence.js) |
| `sr5.matrixMarksChanged` | `(target, ownerId, value, previous, source)` | marks put or erased; never when nothing changed (system/matrix-hooks.js) |
| `sr5.overwatchChanged` | `(actor, value, previous)` | an Overwatch Score changes, on the browser that wrote it |
| `sr5.matrixActionResolved` | `{actor, key, target, successes, netHits, marksPlaced, defenderMarks, itemUuid, refreshed, card (copy)}` | a Matrix action is resolved; `refreshed` when rolled again (system/matrix-api.js) |
| `sr5.panCrownRendered` | `(token, decor, graph)` | a crown is drawn (canvas/pan-crown/pan-crown-layer.js) |
| `sr5.panCrownClosed` | `(token)` | a crown is closed |
| `sr5.panCrownClickIcon` | `{token, node, point: {x, y}}` | an icon of a crown is clicked (the system opens its radial menu on it) |
| `sr5ChaseActionResolved` | `{key, mode, outcome}` | a chase action is resolved (system/chase-roll.js). Its name has no dot: kept as is for the modules that listen to it. |

## Examples

```js
// A house rule: +2 Initiative on the first Combat Turn for a quality "Sur ses gardes"
Hooks.on("sr5.initiativeReminders", data => {
  if (!data.firstRound || !data.actor?.items.some(i => i.name === "Sur ses gardes")) return
  data.reminders.push({label: "Sur ses gardes : +2 au premier tour", source: "Trait", score: 2})
})

// The marks of a persona on the hosts of the world, at once
const hosts = game.sr5.matrix.markedHosts(game.user.character)
```
