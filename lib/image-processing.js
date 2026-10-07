// Thumbnails, avatars and share cards all decode uploaded photos. Share one
// bounded queue so simultaneous requests cannot multiply memory use on the VPS.
let running = 0;
/** @type {Array<() => void>} */
const waiting = [];

/**
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withImageProcessingSlot(work) {
  if (running < 2) running++;
  else await new Promise(resolve => waiting.push(resolve));
  try { return await work(); }
  finally {
    // Pass the reserved slot directly to the next waiter. Decrementing first
    // would let a new request race a queued task and exceed the two-slot limit.
    const next = waiting.shift();
    if (next) next(); else running--;
  }
}
