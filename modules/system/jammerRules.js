// The physical jammer of SR5 p. 443, as plain rules with no Foundry in them so that tests can read them.
//
// "The jammer generates Noise equal to its Device Rating. An area jammer affects a spherical area, and its rating
// is reduced by 1 every 5 meters (similar to grenades). A directional jammer affects a 30-degree cone, and its
// rating is reduced by 1 every 20 meters. A jammer affects all devices (and personas on those devices) in the area."
// The wireless bonus lets it spare designated devices and personas. A cranial jammer works the same way, but its
// effects are limited to the person it is attached to.
//
// The page leaves three things open, settled by DjamZ on 2026-10-04 (gaps in the book, not rules of the table):
// - the rating drops at every full step, so a target standing exactly 5 m (or 20 m) away already gets 1 less;
// - several jammers on one target add up, each one keeping its own effect (as the Jam Signals action already does);
// - the directional cone stays where it was aimed when the jammer was turned on, it does not follow the token.
// Walls are left to the gamemaster by the page itself, and are not coded.

export const JAMMER_TYPES = ["area", "directional", "cranial"]

// Meters per point of rating lost, SR5 p. 443
export const JAMMER_STEP_IN_METERS = {
  area: 5,
  directional: 20,
}

// Opening of the directional cone, SR5 p. 443
export const JAMMER_CONE_ANGLE = 30

// The rating a jammer works with: its Device Rating, which the page names. Gear that only filled in the
// rating column (the gear tables list a jammer by its rating, 1 to 6) falls back on it.
export function jammerRating(system){
  return Number(system?.deviceRating) || Number(system?.itemRating) || 0
}

// Noise a jammer gives a target standing at a given distance, in meters. Never below zero.
export function jammerNoiseAt(type, rating, distanceInMeters){
  const step = JAMMER_STEP_IN_METERS[type]
  if (!step || !(rating > 0)) return 0
  const lost = Math.floor(Math.max(0, distanceInMeters) / step)
  return Math.max(0, rating - lost)
}

// How far a jammer reaches, in meters: where its noise falls to zero
export function jammerReachInMeters(type, rating){
  const step = JAMMER_STEP_IN_METERS[type]
  if (!step || !(rating > 0)) return 0
  return rating * step
}

// Whether a point lies within the angle of a cone, whatever its length. Foundry's direction is in degrees,
// 0 pointing right and growing clockwise on screen (y grows downwards), which is what atan2 gives here.
export function isWithinConeAngle(origin, direction, angle, point){
  const dx = point.x - origin.x, dy = point.y - origin.y
  if (dx === 0 && dy === 0) return true
  const bearing = Math.atan2(dy, dx) * 180 / Math.PI
  const gap = Math.abs(((bearing - direction) % 360 + 540) % 360 - 180)
  return gap <= angle / 2 + 1e-9
}

// Whether a jammer touches a given actor at all, before any distance: a cranial one only touches its wearer,
// and a jammer in wireless mode leaves alone the actors set aside on it.
export function jammerSpares(system, carrierId, actorId){
  const jammer = system?.jammer ?? {
  }
  if (jammer.type === "cranial" && actorId !== carrierId) return true
  return !!(system?.wirelessTurnedOn && (jammer.spared ?? []).includes(actorId))
}
