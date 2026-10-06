// Aegis echo (Kill Code p. 112): four extra boxes on the technomancer's matrix condition monitor, damaged
// before the technomancer. Once damaged, the shield comes back whole twenty-four hours later, never box by box.
// The twenty-four hours start at the FIRST damage (arbitrage de DjamZ, 2026-10-06).
// The shield is a ledger written by the active GM only (flags.sr5.aegis): a player's client never spends it.

export const AEGIS_BOXES = 4
export const AEGIS_REGEN_SECONDS = 24 * 60 * 60

export function hasAegis(actor){
  return !!actor?.items?.some?.(i => i.type === "itemEcho" && /aegis/i.test(i.name ?? ""))
}

// The shield as of now: whole again once the twenty-four hours since its first damage are over
export function aegisState(ledger, now){
  const damage = Math.min(AEGIS_BOXES, Math.max(0, Math.floor(Number(ledger?.damage) || 0)))
  const since = Number(ledger?.since)
  if (!damage || !Number.isFinite(since)) return {
    damage: 0, since: null
  }
  if ((Number(now) || 0) - since >= AEGIS_REGEN_SECONDS) return {
    damage: 0, since: null
  }
  return {
    damage, since
  }
}

// Splits incoming matrix damage between the shield and the monitor. Returns what gets through and the new ledger
export function absorbWithAegis(ledger, incoming, now){
  const state = aegisState(ledger, now)
  incoming = Math.max(0, Math.floor(Number(incoming) || 0))
  const absorbed = Math.min(incoming, AEGIS_BOXES - state.damage)
  const damage = state.damage + absorbed
  return {
    absorbed,
    through: incoming - absorbed,
    ledger: {
      damage, since: damage > 0 ? (state.since ?? (Number(now) || 0)) : null
    },
  }
}

export function isActiveGM(user = game.user){
  return !!user?.isGM && (game.users?.activeGM ?? null)?.id === user.id
}
