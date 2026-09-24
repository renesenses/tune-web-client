<script lang="ts">
  /**
   * CORRECTION ACOUSTIQUE (FIR) d'UNE zone — le bloc, et le seul.
   *
   * ## Pourquoi il est devenu un composant partagé — #1427
   *
   * GgB, fil 1671, 21/09/2026 : « Il y a une raison particulière a la
   * disparition de la prise en compte des fichiers FIR (wav) dans les
   * paramètres de la zone ? »
   *
   * Il ne se trompait pas. Le bloc ne vivait que dans `ZoneConfigModal`, et
   * le seul geste qui l'ouvre dans l'interface livrée est un CLIC DROIT sur
   * la pastille de zone de la barre de lecture : annoncé nulle part, sans
   * infobulle, sans entrée de menu, et sans aucun équivalent tactile — sur
   * tablette ou téléphone, le panneau était inatteignable. Les deux écrans
   * qui s'appellent « les réglages de la zone » — l'écran Zones, et
   * Réglages ▸ Appareils ▸ Réglages par zone, où mène justement le geste
   * nommé « Ouvrir les réglages » — n'en portaient rien.
   *
   * Arbitrage de Bertrand du 22/09/2026 : le porter dans Réglages ▸
   * Appareils ▸ Réglages par zone, et garder le clic droit puisqu'il ne
   * coûte rien.
   *
   * 🔴 Une SECONDE copie du balisage aurait divergé. C'est déjà arrivé à ce
   * bloc précis : la section était réservée aux sorties LOCALES par une
   * condition d'affichage, le serveur a été étendu aux zones réseau
   * (`zone_has_active_ir` force le transcodage « so the FIR reaches network
   * renderers, not just local »), et l'écran est resté sur l'ancienne
   * condition — un abonné Premium, Alexander Jam, en a conclu que la
   * fonction n'existait pas. Un seul composant, monté par les deux écrans.
   *
   * ## Ce que ce composant NE prétend pas régler
   *
   * GgB n'a jamais dit s'il avait perdu l'ACCÈS au réglage ou le SON de sa
   * correction. Ce composant répond à la première lecture — la seule que le
   * code établisse. Si l'IR cessait d'atteindre le flux, ce serait un défaut
   * serveur, et rien ici ne l'écarte ni ne le démontre.
   */
  import type { Zone } from '../../lib/types';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { messageRefusPremium } from '../../lib/premiumRefus';
  import FirResponseCurve from './FirResponseCurve.svelte';

  interface Props {
    zone: Zone;
  }
  let { zone }: Props = $props();

  let irActive = $state(false);
  let irPath = $state<string | null>(null);
  let irLoading = $state(true);
  let irMessage = $state<string | null>(null);
  let irError = $state(false);
  /** Incrémenté après chaque upload réussi → la courbe de réponse se recharge. */
  let irRefresh = $state(0);

  /**
   * 🔴 L'état suit la ZONE, pas le montage.
   *
   * Dans le panneau du clic droit, une instance = une zone. Dans
   * Réglages ▸ Appareils, la liste en monte une PAR zone et les cartes se
   * recomposent quand les zones se republient : un `loadIrStatus()` appelé
   * une seule fois à la création aurait affiché l'IR d'une zone sous le nom
   * d'une autre. L'effet relit dès que l'identifiant change.
   */
  $effect(() => {
    const id = zone.id;
    let vivant = true;
    irLoading = true;
    irMessage = null;
    irError = false;
    if (id == null) { irLoading = false; return; }
    api
      .fetchJSON<any>(`${api.BASE}/room-correction/ir/status/${id}`)
      .then((res) => {
        if (!vivant) return;
        irActive = res?.active ?? false;
        irPath = res?.ir_path ?? null;
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (vivant) irLoading = false; });
    return () => { vivant = false; };
  });

  async function handleIrUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !zone.id) return;
    irMessage = null;
    irLoading = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const res = await fetch(`${api.BASE}/room-correction/ir/upload/${zone.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      const data = await res.json();
      /**
       * 🔴 #884 — SEUL `fetch` NU DU CLIENT SUR UNE ROUTE GARDÉE PREMIUM.
       *
       * `routes/room_correction.rs` porte SIX `require_premium(` et pas un
       * seul `require_premium_localise` : sur un serveur gratuit, cette
       * réponse est un 402 dont le `message` est composé en français. Cet
       * écran l'affichait tel quel (`data.error`), au milieu d'une interface
       * traduite. Il ne passe pas par `lib/api.ts` — c'est un envoi en octets
       * bruts — donc il applique la règle lui-même, avec la MÊME aide et donc
       * la même phrase que les onze autres points d'entrée.
       */
      if (res.status === 402) {
        irMessage = messageRefusPremium(data);
        irError = true;
        irLoading = false;
        input.value = '';
        return;
      }
      if (data.ok) {
        irActive = true;
        irPath = data.ir_path;
        irMessage = $t('zoneConfig.irLoaded').replace('{size}', (file.size / 1024).toFixed(0));
        irError = false;
        irRefresh++;
      } else {
        irMessage = $t('common.error') + ' : ' + data.error;
        irError = true;
      }
    } catch (e: any) {
      irMessage = $t('common.error') + ' : ' + (e?.message || String(e));
      irError = true;
    }
    irLoading = false;
    input.value = '';
  }

  async function clearIr() {
    if (!zone.id) return;
    irLoading = true;
    try {
      await fetch(`${api.BASE}/room-correction/ir/clear/${zone.id}`, { method: 'POST' });
      irActive = false;
      irPath = null;
      irMessage = $t('zoneConfig.firDisabled');
      irError = false;
    } catch { irMessage = $t('common.error'); irError = true; }
    irLoading = false;
  }
</script>

<!--
  La correction de pièce vaut pour TOUTE zone : une zone, un appareil, un FIR.
  Aucune condition sur `output_type` — voir l'en-tête du script.
-->
<div class="fir">
  <h3 class="fir-tl">{$t('zoneConfig.firTitle')}</h3>
  <!--
    🔴 #1481 — CE QUE L'ÉCRAN ACCEPTE, écrit sur l'écran.

    GgB, fil 1895, 23/09/2026 : « Concernant les fichiers FIR, que prend en
    compte Tune ? Fichier unique G/D ? ou fichier stéréo avec correction
    independante de chaque canal ? » La question porte exactement sur ce que
    ce bloc ne disait pas : `firDesc` nommait trois logiciels de mesure et
    l'extension, rien d'autre.

    Les deux réponses sont dans `ConvolverConfig::build_for`
    (`tune-core/src/audio/convolver.rs`) :

      - une IR à UN canal est dupliquée sur tous les canaux du flux ;
      - une IR au NOMBRE de canaux du flux est appliquée canal par canal ;
      - tout autre compte est refusé.

    Et la cadence ne pardonne pas : « Aucun rééchantillonnage silencieux »
    y est écrit noir sur blanc — `self.sample_rate != target_sample_rate`
    rend une erreur, jamais un filtre approché. Sur une zone LOCALE le refus
    remonte au dépôt ; sur une zone réseau il n'apparaît qu'à la lecture,
    donc l'écran doit le dire AVANT.

    Une seule phrase de plus, dans le même paragraphe : deux paragraphes
    auraient fait un pavé au-dessus du bouton.
  -->
  <p class="fir-desc">{$t('zoneConfig.firDesc')} {$t('zoneConfig.firFormats')}</p>
  {#if irLoading}
    <div class="ir-status">{$t('common.loading')}</div>
  {:else if irActive}
    <div class="ir-status ir-active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
      {$t('zoneConfig.firActive')}
      {#if irPath}<span class="ir-path">{irPath.split('/').pop()}</span>{/if}
    </div>
    <div class="ir-actions">
      <label class="ir-btn ir-btn-2 ir-upload-btn">
        {$t('zoneConfig.replace')}
        <input type="file" accept=".wav" class="ir-file-input" onchange={handleIrUpload} />
      </label>
      <button class="ir-btn ir-btn-danger" onclick={clearIr}>{$t('zoneConfig.disable')}</button>
    </div>
    {#if zone.id !== null}
      <FirResponseCurve
        zoneId={zone.id}
        refreshKey={irRefresh}
        currentSampleRate={zone.current_track?.sample_rate ?? null}
      />
    {/if}
  {:else}
    <label class="ir-btn ir-btn-1 ir-upload-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
      {$t('zoneConfig.loadIrFile')}
      <input type="file" accept=".wav" class="ir-file-input" onchange={handleIrUpload} />
    </label>
  {/if}
  {#if irMessage}
    <div class="ir-message" class:ir-error={irError}>{irMessage}</div>
  {/if}
</div>

<style>
  /*
    🔴 Des classes PROPRES à ce composant, et des jetons `--tune-*`.

    Propres, parce que le bloc est désormais monté dans DEUX écrans dont les
    feuilles de style ne se connaissent pas : reprendre `.btn`, `.section-title`
    ou `.monote` l'aurait fait dépendre de l'hôte, et il aurait changé d'allure
    selon l'écran — ou disparu dans celui qui ne définit pas la classe. Le
    <style> d'un composant Svelte est scopé : ces règles ne fuient pas non plus
    vers l'hôte.

    Jetons `--tune-*`, parce qu'ils existent des DEUX côtés : `tune-theme.css`
    les définit pour l'ancienne interface, et `tune-v2.css` les fait pointer sur
    les `--v2-*` de la nouvelle. Le bloc suit donc le thème de l'écran qui le
    porte, sans le savoir.
  */
  .fir { margin-top: 13px; }
  .fir-tl {
    font-family: var(--font-label);
    font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin: 0 0 6px;
  }
  .fir-desc {
    font-family: var(--font-body);
    font-size: 12px; line-height: 1.55;
    color: var(--tune-text-secondary);
    margin: 0 0 12px;
  }
  .ir-status {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px; color: var(--tune-text-muted); margin-bottom: 8px;
  }
  .ir-active { color: var(--tune-success, #4ade80); font-weight: 600; }
  .ir-path { font-size: 11px; color: var(--tune-text-muted); font-weight: 400; }
  .ir-actions { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .ir-btn {
    font-family: var(--font-body);
    font-size: 12px; font-weight: 500;
    padding: 6px 14px;
    border-radius: var(--radius-sm, 6px);
    border: none; cursor: pointer;
    transition: all 0.12s ease-out;
  }
  .ir-btn-1 { background: var(--tune-accent); color: #fff; }
  .ir-btn-1:hover { filter: brightness(1.1); }
  .ir-btn-2 {
    background: var(--tune-bg); color: var(--tune-text-secondary);
    border: 1px solid var(--tune-border);
  }
  .ir-btn-2:hover { background: var(--tune-surface-hover); color: var(--tune-text); }
  .ir-btn-danger {
    background: none; border: 1px solid var(--tune-error, #ef4444);
    color: var(--tune-error, #ef4444);
  }
  .ir-btn-danger:hover { background: rgba(239, 68, 68, 0.1); }
  .ir-upload-btn { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .ir-file-input { display: none; }
  .ir-message { font-size: 12px; color: var(--tune-text-muted); margin-top: 4px; }
  .ir-message.ir-error { color: var(--tune-error, #ef4444); }
</style>
