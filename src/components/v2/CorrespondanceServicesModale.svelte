<!--
  web#3270 (tune-server-rust#9166, go de Bertrand du 19/11/2026) — « Changer
  la correspondance » : un disque de Ma collection physique déjà rapproché
  d'un album de service (Qobuz, TIDAL…) se corrige à la main quand le
  rapprochement automatique s'est trompé.

  La recherche « Chercher sur les services » (#7928) se relance ; la
  correspondance actuelle est en tête, chacune avec « Retirer » (confirmé),
  et mise en évidence dans les résultats ; un autre résultat la REMPLACE
  pour son service. Le serveur range le choix : le rapprochement automatique
  suivant ne recrée pas une correspondance retirée.

  Déplacée à la racine du document (`portail`), comme `AssocierAlbumModale`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { dialogs } from '../../lib/stores/dialogs';
  import {
    chercherSurLesServices, correspondanceDuService, estCorrespondanceActuelle, messageErreurCollection,
    nomService, remplacerCorrespondance, retirerCorrespondance,
    type Disque, type PropositionService, type ResultatServices, type SurUnService,
  } from '../../lib/collectionPhysique';

  interface Props {
    disque: Disque;
    onClose: () => void;
    /** Le disque relu par le serveur, après un remplacement ou un retrait. */
    onChange: (d: Disque) => void;
  }
  let { disque, onClose, onChange }: Props = $props();

  /** Le disque tel qu'il est maintenant (relu après chaque geste). */
  let actuel = $state<Disque>(disque);
  let resultat = $state<ResultatServices | null>(null);
  let enCours = $state(true);
  let travail = $state(false);
  let erreur = $state<unknown>(null);

  const traduire = (cle: string) => $t(cle as any) as string;
  const texte = (cle: string, valeurs: Record<string, string>) => {
    let s = traduire(cle);
    for (const [k, v] of Object.entries(valeurs)) s = s.replace(`{${k}}`, v);
    return s;
  };

  async function chercher() {
    enCours = true;
    erreur = null;
    try {
      resultat = await chercherSurLesServices(actuel.release_id);
    } catch (e) {
      erreur = e;
    } finally {
      enCours = false;
    }
  }

  async function remplacer(p: PropositionService) {
    if (travail) return;
    travail = true;
    erreur = null;
    try {
      const r = await remplacerCorrespondance(actuel.release_id, p);
      actuel = r.disque;
      onChange(r.disque);
    } catch (e) {
      erreur = e;
    } finally {
      travail = false;
    }
  }

  async function retirer(s: SurUnService) {
    if (travail) return;
    const ok = await dialogs.confirm(
      texte('collectionPhysique.correspondance.retirerConfirmer', { service: nomService(s.service), titre: s.titre }),
      { danger: true },
    );
    if (!ok) return;
    travail = true;
    erreur = null;
    try {
      const r = await retirerCorrespondance(actuel.release_id, s.service);
      actuel = r.disque;
      onChange(r.disque);
    } catch (e) {
      erreur = e;
    } finally {
      travail = false;
    }
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => { void chercher(); });
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events : le clic ne fait
       qu'empêcher la fermeture par le fond ; Échap ferme au clavier. -->
  <div class="panneau" role="dialog" aria-modal="true" tabindex="-1" aria-label={$t('collectionPhysique.correspondance.titre' as any)}
    onclick={(e) => e.stopPropagation()} data-correspondance-services={actuel.release_id}>
    <h2>{$t('collectionPhysique.correspondance.titre' as any)}</h2>
    <p class="disque">{actuel.artiste} — {actuel.titre}</p>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    {#if erreur}
      <p class="err" data-erreur-correspondance>{messageErreurCollection(erreur, traduire)}</p>
    {/if}

    <div class="listes">
      <h3>{$t('collectionPhysique.correspondance.actuelle' as any)}</h3>
      {#if actuel.streaming.length}
        <ul data-correspondances-actuelles>
          {#each actuel.streaming as s (s.service)}
            <li class="ligne actuelle" data-correspondance-actuelle={s.service}>
              <span class="ti">
                <span class="tt" title={s.titre}>{s.titre}</span>
                <em title={s.artiste}>{nomService(s.service)} · {s.artiste}{#if s.par === 'manuel'} · {$t('collectionPhysique.correspondance.manuelle' as any)}{/if}</em>
              </span>
              <button class="sec" onclick={() => void retirer(s)} disabled={travail} data-retirer-correspondance={s.service}>
                {$t('collectionPhysique.correspondance.retirer' as any)}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="q" data-sans-correspondance>{$t('collectionPhysique.correspondance.vide' as any)}</p>
      {/if}

      <div class="tete-resultats">
        <h3>{$t('collectionPhysique.associer.resultats' as any)}</h3>
        <button class="sec" onclick={() => void chercher()} disabled={enCours || travail} data-chercher-a-nouveau>
          {$t('collectionPhysique.correspondance.chercherANouveau' as any)}
        </button>
      </div>
      {#if enCours}
        <p class="q">{$t('collectionPhysique.recherche.enCours' as any)}</p>
      {:else if resultat && resultat.propositions.length}
        <ul data-propositions>
          {#each resultat.propositions as p (`${p.service}:${p.id}`)}
            {@const courante = estCorrespondanceActuelle(actuel, p)}
            <li class="ligne" class:actuelle={courante} data-proposition={`${p.service}:${p.id}`} data-courante={courante}>
              <span class="ti">
                <span class="tt" title={p.titre}>{p.titre}</span>
                <em title={p.artiste}>{nomService(p.service)} · {p.artiste} · {p.score} %{#if p.exact} · {$t('collectionPhysique.correspondance.exact' as any)}{/if}</em>
              </span>
              {#if courante}
                <span class="marque" data-marque-actuelle>{$t('collectionPhysique.correspondance.marqueActuelle' as any)}</span>
              {:else}
                <button class="pri" onclick={() => void remplacer(p)} disabled={travail} data-remplacer={`${p.service}:${p.id}`}>
                  {correspondanceDuService(actuel, p.service)
                    ? $t('collectionPhysique.correspondance.remplacer' as any)
                    : $t('collectionPhysique.correspondance.choisir' as any)}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else if resultat}
        <p class="q" data-recherche-vide>
          {resultat.services.length ? $t('collectionPhysique.recherche.rienDeProche' as any) : $t('collectionPhysique.recherche.aucunService' as any)}
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center; background:rgba(0,0,0,.55); padding:20px}
  .panneau{position:relative; width:min(600px,100%); max-height:min(80vh,720px); display:flex; flex-direction:column;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card);
    padding:20px 22px 16px; font-family:var(--v2-sans)}
  h2{font-size:calc(17px * var(--v2-txt-echelle, 1)); font-weight:700; margin:0 32px 4px 0}
  h3{margin:12px 0 6px; font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em;
    text-transform:uppercase; color:var(--v2-txt3)}
  .tete-resultats{display:flex; align-items:center; justify-content:space-between; gap:8px}
  .disque{margin:0 0 4px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:calc(20px * var(--v2-txt-echelle, 1)); line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .listes{overflow-y:auto; margin-top:4px}
  ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
  .ligne{display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:10px; padding:6px 8px; border-radius:8px;
    border:1px solid transparent}
  .ligne:hover{background:var(--v2-hover)}
  .ligne.actuelle{border-color:var(--v2-acc1); background:var(--v2-surface2)}
  .ti{min-width:0; display:flex; flex-direction:column; gap:2px}
  .tt{font-size:calc(13px * var(--v2-txt-echelle, 1)); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); font-style:normal; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .marque{font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc1)}
  button.pri, button.sec{border-radius:8px; font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:7px 12px; cursor:pointer}
  .sec{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2)}
  .pri{border:0; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .pri:disabled, .sec:disabled{opacity:.5; cursor:default}
  .q{margin:8px 0; font:calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .err{margin:8px 0 0; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-danger)}
</style>
