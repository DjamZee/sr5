/**
 * Foundry's Hooks as the system meets them (V11 to V13), for the tests of the hooks a module subscribes to: `on` and
 * `once` record `{hook, id, fn, once}` in `events[hook]`, in order; `callAll` calls each one and CATCHES its error
 * without throwing it again (Foundry logs it through Hooks.onError), so a test that went through callAll would keep
 * what a failing subscriber wrote (relecture du 21/10, D1). `seen` lists the hooks whose subscribers were called.
 */
export function foundryHooks(subscribers = {
}) {
  let next = 1
  const events = {
  }
  const seen = []
  const errors = []
  const hooks = {
    events, seen, errors,
    on(hook, fn, {
      once = false
    } = {
    }) {
      const id = next++
      ;(events[hook] ??= []).push({
        hook, id, fn: (...args) => {
          seen.push(hook)
          return fn(...args)
        }, once
      })
      return id
    },
    once(hook, fn) {
      return hooks.on(hook, fn, {
        once: true
      })
    },
    off(hook, id) {
      events[hook] = (events[hook] ?? []).filter(entry => entry.id !== id && entry.fn !== id)
    },
    callAll(hook, ...args) {
      for (const entry of Array.from(events[hook] ?? [])) {
        if (entry.once) hooks.off(hook, entry.id)
        try {
          entry.fn(...args)
        } catch (error) {
          errors.push(error)
        }
      }
      return true
    },
  }
  for (const [hook, fns] of Object.entries(subscribers)) for (const fn of [fns].flat()) hooks.on(hook, fn)
  return hooks
}
