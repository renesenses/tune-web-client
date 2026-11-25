<script lang="ts">
  /**
   * L'icône TESS de la barre de lecture (maquettes A1 et A5 ; refonte rc14,
   * lot 1, spécification § 2.3).
   *
   * - Absente tant que le serveur n'annonce pas TESS (`capaciteTess`).
   * - Le SYMBOLE seul (« Wave T »), plus le mot « TESS » : libellé accessible
   *   `tess.open`, infobulle qui dit aussi l'état.
   * - Rangée à côté du bouton du chemin du signal et du bouton PURE.
   * - SANS cadre quand aucun traitement n'agit, ENCADRÉE dès qu'un traitement
   *   agit — d'après l'état publié par le serveur (`lib/etatTraitementTess`) :
   *   le bloc `tess` du chemin du signal de la zone courante, sinon, zone à
   *   l'arrêt, `GET /zones/{id}/tess`. En PURE, jamais de cadre.
   * - Un geste : ouvrir l'écran TESS (sans greffon choisi).
   */
  import { t } from '../../../lib/i18n';
  import * as api from '../../../lib/api';
  import { capaciteTess } from '../../../lib/stores/tess';
  import { activeView } from '../../../lib/stores/navigation';
  import { ouvrirTess } from '../../../lib/stores/tessOuverture';
  import { traitementActifDuChemin, traitementTessActif } from '../../../lib/etatTraitementTess';
  import IconeTess from './IconeTess.svelte';

  let { signalPath = null, zoneId = null, pure = false }: {
    /** Le chemin du signal de la zone courante (`zone.signal_path`). */
    signalPath?: unknown;
    zoneId?: number | null;
    /** PURE armé sur la zone courante. */
    pure?: boolean;
  } = $props();

  /** La réponse de `GET /zones/{id}/tess`, lue seulement quand le chemin ne dit rien. */
  let reponseZone = $state<Parameters<typeof traitementTessActif>[1]>(null);
  let jeton = 0;
  const cheminMuet = $derived(traitementActifDuChemin(signalPath) === null);

  // Relue au changement de zone, et au retour de l'écran TESS (la chaîne a pu
  // y changer). Rien tant que le chemin publié suffit.
  $effect(() => {
    const id = zoneId;
    void $activeView;
    if ($capaciteTess !== 'oui' || id == null || !cheminMuet) return;
    const moi = ++jeton;
    api.getTessZone(id)
      .then((r) => { if (moi === jeton) reponseZone = r.ok ? (r.reponse as any) : null; })
      .catch(() => { /* panne : l'état connu reste */ });
  });

  const actif = $derived(traitementTessActif(signalPath, cheminMuet ? reponseZone : null, pure));
  const infobulle = $derived($t((actif ? 'tess.bar.active' : 'tess.bar.idle') as any));
</script>

{#if $capaciteTess === 'oui'}
  <button
    type="button"
    class="pastille-tess"
    class:encadree={actif}
    data-pastille-tess
    data-traitement-actif={actif ? 'oui' : 'non'}
    onclick={(e) => { e.stopPropagation(); ouvrirTess(); }}
    title={infobulle}
    aria-label={$t('tess.open' as any)}
  >
    <IconeTess taille={18} />
  </button>
{/if}

<style>
  .pastille-tess{display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; padding:0;
    border-radius:8px; border:1px solid transparent; background:none; color:var(--v2-acc1, currentColor);
    cursor:pointer; flex:0 0 auto; position:relative}
  .pastille-tess:hover{background:var(--tune-surface-hover, rgba(255,255,255,.06))}
  .pastille-tess.encadree{border-color:var(--v2-acc2, currentColor); background:var(--v2-surface2, transparent)}
  .pastille-tess:focus-visible{outline:2px solid var(--v2-acc2, currentColor); outline-offset:2px}
</style>
