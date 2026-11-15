/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/** Identifiant du build (rc10) — voir src/build/serviceWorker.ts. */
declare const __TUNE_BUILD__: string;

/** Garde de démarrage posée par `index.html` (tune-web-client#3054). */
interface Window {
  __tuneDemarrage?: { monte: () => void; echec: () => void; message: () => void };
}
