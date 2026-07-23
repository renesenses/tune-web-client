import type { Action } from 'svelte/action';

/**
 * Svelte action: call `callback` with the element's content-box height whenever
 * it changes (and once immediately with the current height). Extracted from
 * LibraryView so the sizing behaviour lives in one reusable place.
 */
export const observeHeight: Action<HTMLElement, (h: number) => void> = (node, callback) => {
  let cb = callback;
  const ro = new ResizeObserver(entries => {
    for (const e of entries) cb(e.contentRect.height);
  });
  ro.observe(node);
  cb(node.clientHeight);
  return {
    update(next) {
      cb = next;
    },
    destroy() {
      ro.disconnect();
    },
  };
};

/** Svelte action: like {@link observeHeight}, but reports the element width. */
export const observeWidth: Action<HTMLElement, (w: number) => void> = (node, callback) => {
  let cb = callback;
  const ro = new ResizeObserver(entries => {
    for (const e of entries) cb(e.contentRect.width);
  });
  ro.observe(node);
  cb(node.clientWidth);
  return {
    update(next) {
      cb = next;
    },
    destroy() {
      ro.disconnect();
    },
  };
};
