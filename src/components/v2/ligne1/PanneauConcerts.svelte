<script lang="ts">
  /**
   * LE PANNEAU DES CONCERTS de la première ligne.
   *
   * Il répond à la question de l'écran Concerts, en plus court : « les
   * artistes que j'écoute jouent-ils près de chez moi ? » (FabienM et Didier,
   * fil 1540).
   *
   * ## 🔴 CE PANNEAU SAIT DISPARAÎTRE
   *
   * Les concerts sont un GREFFON PREMIUM : ses routes ne sont montées que si
   * le greffon tourne (`concertsCharge`), et le serveur refuse par 402/403 qui
   * n'a pas le module ou n'a pas relié son compte. Décision du 27/09/2026 :
   * sur la première ligne, on n'affiche RIEN dans ces cas-là.
   *
   * Pourquoi ne pas y mettre une invitation, comme ailleurs ? Parce que cette
   * ligne est la ligne d'en-tête de l'accueil, la première chose que voit
   * quelqu'un qui ouvre Tune. Une réclame y tiendrait la place d'un panneau
   * utile à chaque ouverture. L'écran Concerts, lui, explique le geste — c'est
   * sa place, pas celle-ci.
   *
   * ⚠️ `concertsCharge` ne se contente pas de « le greffon est installé » :
   * les routeurs de greffons sont montés UNE SEULE FOIS au démarrage, et entre
   * l'installation et le redémarrage chaque appel reçoit le 404 nu d'axum,
   * sans corps JSON (leçon de Bandcamp, #1768).
   */
  import * as api from '../../../lib/api';
  import { t } from '../../../lib/i18n';
  import { concertsCharge } from '../../../lib/stores/concerts';
  import { refusConcerts } from '../../../lib/concertsRefus';
  import { activeView } from '../../../lib/stores/navigation';
  import { LARGEUR_PANNEAU } from '../../../lib/premiereLigne';
  import PanneauL1 from './PanneauL1.svelte';

  let phase = $state<'attente' | 'charge' | 'echec' | 'refus'>('attente');
  let concerts = $state<api.Concert[]>([]);

  $effect(() => {
    // Ne RIEN demander tant que le routeur du greffon n'est pas monté.
    if (!$concertsCharge) return;
    let vivant = true;
    api
      .getConcertsAVenir()
      .then((r) => {
        if (!vivant) return;
        concerts = (r?.concerts ?? []).slice();
        phase = 'charge';
      })
      .catch((e) => {
        if (!vivant) return;
        // Un refus d'offre n'est pas une panne : le panneau s'efface.
        phase = refusConcerts(e) ? 'refus' : 'echec';
      });
    return () => { vivant = false; };
  });

  /** La date dans la langue de l'écran. Une DONNÉE, donc jamais une phrase
   *  écrite ici : `check-i18n` ne lit pas les valeurs calculées, et du
   *  français y passerait inaperçu dans une interface anglaise. */
  function dateLisible(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }

  /** « Salle, Ville » — sans virgule orpheline quand l'un des deux manque. */
  function lieu(c: api.Concert): string {
    return [c.venue, c.city].filter((x) => x && String(x).trim()).join(', ');
  }
</script>

<!-- Le panneau n'existe pas quand le greffon n'est pas là ou refuse. -->
{#if $concertsCharge && phase !== 'refus'}
  <PanneauL1 titre={$t('concerts.titre' as any)} largeur={LARGEUR_PANNEAU}>
    {#snippet icone()}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round"><path d="M21 10c0-5-4-8-9-8s-9 3-9 8c0 4.5 4.5 9 9 12 4.5-3 9-7.5 9-12z"/><circle cx="12" cy="10" r="3"/></svg>
    {/snippet}

    {#if phase === 'attente'}
      <p class="etat">{$t('concerts.chargement' as any)}</p>
    {:else if phase === 'echec'}
      <p class="etat">{$t('v2.home.widgetFailed' as any)}</p>
    {:else if !concerts.length}
      <p class="etat">{$t('concerts.aucun' as any)}</p>
    {:else}
      <ul>
        {#each concerts as c, i (`${c.artist_name}-${c.event_date}-${c.venue ?? ''}-${i}`)}
          <li>
            <div class="txt">
              <span class="art" title={c.artist_name}>{c.artist_name}</span>
              <span class="sous" title={lieu(c)}>{dateLisible(c.event_date)}{#if lieu(c)} · {lieu(c)}{/if}</span>
            </div>
            {#if c.event_url}
              <!-- `noopener` : une page de billetterie ouverte depuis Tune ne
                   doit pas garder la main sur l'onglet qui l'a ouverte. -->
              <a href={c.event_url} target="_blank" rel="noopener noreferrer"
                 title={$t('concerts.titre' as any)} aria-label={$t('concerts.titre' as any)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                     stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
              </a>
            {/if}
          </li>
        {/each}
      </ul>
      <!-- Le panneau montre ; l'écran règle le périmètre et la commune. -->
      <button class="tout" onclick={() => activeView.set('concerts')}>{$t('concerts.titre' as any)}</button>
    {/if}
  </PanneauL1>
{/if}

<style>
  .etat { margin: 0; color: var(--v2-txt3); font: 400 12px var(--v2-sans); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  li {
    display: flex; align-items: center; gap: 8px; min-width: 0;
    padding: 6px 8px; border-radius: var(--v2-r-md); background: var(--v2-surface);
  }
  .txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .art {
    color: var(--v2-txt); font: 500 12px var(--v2-sans);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sous {
    color: var(--v2-txt3); font: 400 11px var(--v2-sans);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  a { flex: 0 0 auto; display: inline-flex; color: var(--v2-txt3); }
  a:hover { color: var(--v2-acc1); }
  a svg { width: 14px; height: 14px; }

  .tout {
    margin-top: 8px; padding: 4px 11px; border-radius: var(--v2-r-pill);
    border: 1px solid color-mix(in srgb, var(--v2-acc1) 32%, transparent);
    background: none; color: var(--v2-txt2); font: 500 11px var(--v2-sans); cursor: pointer;
  }
  .tout:hover { border-color: var(--v2-acc1); color: var(--v2-txt); }
</style>
