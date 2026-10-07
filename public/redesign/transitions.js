// A skipped snapshot must never prevent the action underneath it from running.
export function createTransitionRunner(document, {enabled = true} = {}) {
  let active;
  let disposed = false;
  const skip = (transition) => {
    try { transition?.skipTransition(); } catch { /* Animation is optional. */ }
  };
  return {
    run(update, finish = () => {}) {
      if (disposed) return;
      let applied = false;
      const apply = () => {
        if (disposed || applied) return;
        applied = true;
        update();
      };
      if (!enabled || !document.startViewTransition) { apply(); finish(); return; }
      skip(active);
      let transition;
      try { transition = document.startViewTransition(apply); }
      catch { apply(); finish(); return; }
      active = transition;
      // ready rejects when snapshots are skipped (hidden tabs, quick clicks, etc.),
      // even when updateCallbackDone/finished resolve successfully.
      transition.ready.catch(() => {});
      transition.updateCallbackDone.catch(error => console.error('Page update failed', error));
      const settled = () => {
        if (active !== transition) return;
        active = undefined;
        finish();
      };
      transition.finished.then(settled, settled);
    },
    dispose() { disposed = true; skip(active); active = undefined; },
  };
}
