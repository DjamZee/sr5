// The world's actors and those of the unlinked tokens, which live on the scenes only: what a sweep at the world's
// load goes through
export function worldActors() {
  const actors = new Set(game.actors ?? [])
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor)
  }
  return [...actors]
}
