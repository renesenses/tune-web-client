// Branché dans `vitest.config.ts` → `setupFiles` (#1555) : rend aux bancs
// jsdom le `localStorage` de jsdom quand celui de Node (≥ 25) le masque.
// Le pourquoi est dans `stockageWeb.ts`.
import { reparerStockageWeb } from './stockageWeb';

reparerStockageWeb(
  globalThis as unknown as Record<string, unknown>,
  (globalThis as unknown as { jsdom?: { window?: { localStorage?: unknown; sessionStorage?: unknown } } }).jsdom?.window,
);
