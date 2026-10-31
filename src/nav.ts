// One history entry per open layer (screen, picker, bottom sheet), so Android's
// back button closes the top-most layer instead of leaving the app.
//
// pushLayer(onBack) records a closer and pushes a history entry; going back runs
// the top closer. A layer that closes itself without the back button (a pick in
// the picker, Finish in a sheet) calls releaseLayer(id) so its history entry is
// removed too, otherwise the next back press would be swallowed. Released entries
// below a live one are collected when that live one pops.

type Entry = { id: number; closer: () => void; released: boolean }

const stack: Entry[] = []
let nextId = 1
let listening = false
let pending = 0 // how many entries the in-flight history.go() covers
let inFlight = false

function ensureListener() {
  if (listening) return
  window.addEventListener('popstate', onPop)
  listening = true
}

function onPop() {
  const count = pending > 0 ? pending : 1
  pending = 0
  inFlight = false
  for (let i = 0; i < count; i++) {
    const top = stack.pop()
    if (top && !top.released) top.closer()
  }
  flushReleased()
}

// Drop released entries sitting at the top of the stack in one traversal.
function flushReleased() {
  if (inFlight) return
  let k = 0
  while (k < stack.length && stack[stack.length - 1 - k].released) k++
  if (k === 0) return
  pending = k
  inFlight = true
  history.go(-k)
}

export function pushLayer(onBack: () => void): number {
  ensureListener()
  const id = nextId++
  const top = stack[stack.length - 1]
  if (top && top.released && !inFlight) {
    // A layer was released in this same tick (React StrictMode re-running an
    // effect, or one sheet replacing another): reuse its history entry.
    top.id = id
    top.closer = onBack
    top.released = false
    return id
  }
  stack.push({ id, closer: onBack, released: false })
  history.pushState(null, '')
  return id
}

let flushScheduled = false

// The layer closed itself: forget its closer and remove its history entry.
// The removal is deferred a tick so a push in the same tick can reuse the entry.
export function releaseLayer(id: number): void {
  const entry = stack.find((e) => e.id === id)
  if (!entry) return
  entry.released = true
  if (flushScheduled) return
  flushScheduled = true
  window.setTimeout(() => {
    flushScheduled = false
    flushReleased()
  }, 0)
}

// Close the top layer the same way the back button would (its closer runs).
export function popLayer(): void {
  if (stack.length === 0 || inFlight) return
  pending = 1
  inFlight = true
  history.back()
}

// Leave every open layer at once (sheet, picker, screen) and land on Home.
export function popAll(): void {
  if (stack.length === 0 || inFlight) return
  pending = stack.length
  inFlight = true
  history.go(-stack.length)
}

export function layerDepth(): number {
  return stack.length
}
