

## Angle mort (hors `api.ts`) — télémétrie

| Écran supprimé | Route | Chemin v2 |
|---|---|---|
| `SettingsView` (`etatTelemetrie.ts`) | `GET /cloud/telemetry/status`, `POST /cloud/telemetry/enable\|disable` | ✅ **porté** (`feat/v2-porte-telemetrie`) : Réglages › Système › Cloud, bascule « Télémétrie » par `api.getTelemetryStatus` / `api.setTelemetryConsent` ; état effectif du serveur (#3383), verrou `TUNE_TELEMETRY` dit, identifiant d'instance et pause cloud affichés. Témoin : `src/lib/__tests__/telemetrieV2.test.ts` |
