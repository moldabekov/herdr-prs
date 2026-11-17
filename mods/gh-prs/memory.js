// Whether the PRs panel is open, kept globally rather than per space.
//
// The stock tab bar restores each space's own panel when you switch spaces, and
// closes the panel for an id it doesn't know, which includes gh-prs. So for a
// short settle window after a space switch, a closed PRs panel is the tab bar's
// doing and gets reopened; outside that window a change is the person's, and it
// becomes the new global state. Pure: no host imports, never mutates input.

export const SETTLE_MS = 1500;

export function initialMemory(open) {
  return { open: Boolean(open), space: null, settleUntil: 0, lastShown: null, awaiting: false };
}

// One look at the layout. Returns the next memory and whether to reopen PRs.
export function observe(mem, { space, shown, now }) {
  const switched = space !== mem.space;
  const settleUntil = switched ? now + SETTLE_MS : mem.settleUntil;
  if (now < settleUntil) {
    const waiting = mem.awaiting && !shown; // a reopen we sent hasn't landed yet
    const reopen = mem.open && !shown && !waiting;
    return { mem: { ...mem, space, settleUntil, lastShown: shown, awaiting: reopen || waiting }, reopen };
  }
  const open = shown !== mem.lastShown ? shown : mem.open;
  return { mem: { ...mem, space, settleUntil, lastShown: shown, open, awaiting: false }, reopen: false };
}

// The PRs button was clicked: the person's choice wins at once, settle or not.
export function clicked(mem, open, now) {
  return { ...mem, open, lastShown: open, awaiting: false, settleUntil: now };
}

export function parseOpen(text) {
  return text === "true";
}
