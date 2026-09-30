<script lang="ts">
  /**
   * LE PANNEAU DES STATISTIQUES D'ÉCOUTE de la première ligne.
   *
   * Quatre lectures de la maquette, dans l'ordre : la tendance et son nombre
   * de lectures, la répartition par source, par zone, et l'heure du jour.
   *
   * ## UNE SEULE REQUÊTE, et même pas toujours une
   *
   * `tableauDeBord()` partage la requête EN VOL : si la page porte déjà un
   * widget de statistiques sur la même période, ce panneau ne coûte rien. La
   * période est `7d` et non `30d` — sur trente jours la route dépasse le chien
   * de garde de 8 s, mesure écrite dans `accueilWidgets`.
   *
   * ## Aucune bibliothèque de graphiques
   *
   * Il n'y en a aucune dans ce projet, et il n'en entre pas une ici. Les
   * barres sont des `<div>` dont la LARGEUR porte la valeur, l'heure du jour
   * vingt-quatre cases dont l'OPACITÉ la porte : exactement le rendu de
   * l'ancien Tableau de bord et des blocs qui en sont sortis.
   *
   * ## Les listes sont COUPÉES, et c'est la hauteur qui le commande
   *
   * `LIGNES_BARRES` lignes par liste. La hauteur de la ligne est fixe : une
   * liste de douze sources ferait défiler le panneau au lieu de le lire d'un
   * coup d'œil, ce qui est tout ce qu'on lui demande.
   */
  import * as api from '../../../lib/api';
  import { t, locale } from '../../../lib/i18n';
  import { tableauDeBord } from '../../../lib/accueilWidgets';
  import { activeView } from '../../../lib/stores/navigation';
  import { LARGEUR_PANNEAU, LIGNES_BARRES, PERIODE_L1 } from '../../../lib/premiereLigne';
  import PanneauL1 from './PanneauL1.svelte';

  let phase = $state<'attente' | 'charge' | 'echec'>('attente');
  let d = $state<api.DashboardData | null>(null);

  $effect(() => {
    let vivant = true;
    // #1763 — quitter l'Accueil abandonne la requête partagée : sans signal,
    // ce panneau la tenait en vie pour tous, jusqu'à la réponse du serveur.
    const controle = new AbortController();
    tableauDeBord(PERIODE_L1, controle.signal)
      .then((r) => {
        if (!vivant) return;
        d = r;
        phase = 'charge';
      })
      .catch(() => {
        if (vivant) phase = 'echec';
      });
    return () => { vivant = false; controle.abort(); };
  });

  /** Un nombre écrit dans la langue de l'écran. */
  const nombre = (n: number) => {
    try {
      return new Intl.NumberFormat($locale).format(n);
    } catch {
      return String(n);
    }
  };

  const total = $derived(d?.totals?.plays ?? 0);

  /** La tendance, jour par jour. Les jours SANS écoute comptent : le serveur
   *  ne les envoie pas, et une semaine à cinq barres se lirait comme une
   *  semaine de cinq jours (repris de `joursPleins`, Tableau de bord). */
  const tendance = $derived.by(() => {
    const par = new Map((d?.trend ?? []).map((x) => [x.day, x.plays]));
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const out: { jour: string; plays: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const j = new Date(base);
      j.setDate(base.getDate() - i);
      const cle = `${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, '0')}-${String(j.getDate()).padStart(2, '0')}`;
      out.push({ jour: cle, plays: par.get(cle) ?? 0 });
    }
    return out;
  });
  const maxTendance = $derived(Math.max(1, ...tendance.map((x) => x.plays)));

  const sources = $derived(
    (d?.by_source ?? [])
      .filter((s) => s?.source)
      .slice(0, LIGNES_BARRES)
      .map((s) => ({ label: String(s.source), valeur: s.plays })),
  );
  const zonesEcoute = $derived(
    (d?.by_zone ?? [])
      .slice(0, LIGNES_BARRES)
      .map((z) => ({ label: z.zone_name ?? String(z.zone_id ?? ''), valeur: z.plays })),
  );

  /** Les vingt-quatre heures, trous compris — même raison que la tendance. */
  const heures = $derived.by(() => {
    const par = new Map((d?.hourly ?? []).map((h) => [h.hour, h.plays]));
    return Array.from({ length: 24 }, (_, h) => par.get(h) ?? 0);
  });
  const maxHeure = $derived(Math.max(1, ...heures));

  const max = (l: { valeur: number }[]) => Math.max(1, ...l.map((x) => x.valeur));
</script>

<PanneauL1 titre={$t('dashboard.title' as any)} largeur={LARGEUR_PANNEAU}>
  {#snippet icone()}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round"><path d="M4 19V5M9 19v-7M14 19V8M19 19v-4"/></svg>
  {/snippet}

  {#if phase === 'attente'}
    <p class="etat">{$t('common.loading' as any)}</p>
  {:else if phase === 'echec'}
    <p class="etat">{$t('v2.home.widgetFailed' as any)}</p>
  {:else if !total && !sources.length && !zonesEcoute.length}
    <p class="etat">{$t('dashboard.empty' as any)}</p>
  {:else}
    <button class="ouvrir" onclick={() => activeView.set('tableaudebord')}>
      <section class="tend">
        <div class="chiffre">
          <strong>{nombre(total)}</strong>
          <span>{$t('dashboard.totals.plays' as any)}</span>
        </div>
        <div class="courbe" aria-hidden="true">
          {#each tendance as j (j.jour)}
            <i style:height="{Math.max((j.plays / maxTendance) * 100, 4)}%"></i>
          {/each}
        </div>
      </section>

      {#each [{ cle: 'dashboard.section.by_source', lignes: sources }, { cle: 'dashboard.section.by_zone', lignes: zonesEcoute }] as groupe (groupe.cle)}
        {#if groupe.lignes.length}
          <section class="barres">
            <h4>{$t(groupe.cle as any)}</h4>
            <!-- #1763 — clé par RANG : deux zones homonymes (groupées par
                 `zone_id` côté serveur) levaient `each_key_duplicate`, et
                 l'erreur figeait tout le rendu de la coquille. -->
            {#each groupe.lignes as l, i (i)}
              <div class="ligne">
                <span class="nom" title={l.label}>{l.label}</span>
                <span class="rail"><i style:width="{Math.max((l.valeur / max(groupe.lignes)) * 100, 3)}%"></i></span>
                <span class="val">{nombre(l.valeur)}</span>
              </div>
            {/each}
          </section>
        {/if}
      {/each}

      <section class="heures">
        <h4>{$t('dashboard.section.hourly' as any)}</h4>
        <!-- L'OPACITÉ porte la valeur : vingt-quatre cases, aucune image, aucun
             graphique — c'est le rendu de l'ancien Tableau de bord. -->
        <div class="cases" aria-hidden="true">
          {#each heures as v, h (h)}
            <i style:opacity={0.14 + (v / maxHeure) * 0.86}></i>
          {/each}
        </div>
      </section>
    </button>
  {/if}
</PanneauL1>

<style>
  .etat { margin: 0; color: var(--v2-txt3); font: 400 12px var(--v2-sans); }

  /* Le panneau entier ouvre le Tableau de bord : c'est un raccourci vers
     l'écran qui développe ces quatre lectures, pas un bouton de plus. */
  .ouvrir {
    display: flex; flex-direction: column; gap: 10px; width: 100%;
    padding: 0; border: 0; background: none; text-align: left; cursor: pointer;
  }

  .tend { display: flex; align-items: flex-end; gap: 12px; }
  .chiffre { display: flex; flex-direction: column; }
  .chiffre strong {
    color: var(--v2-acc1); font: 700 26px/1 var(--v2-sans); font-variant-numeric: tabular-nums;
  }
  .chiffre span { color: var(--v2-txt3); font: 500 10px var(--v2-sans); text-transform: uppercase; letter-spacing: .06em; }
  .courbe { flex: 1 1 auto; display: flex; align-items: flex-end; gap: 4px; height: 38px; }
  .courbe i {
    flex: 1 1 0; min-width: 0; border-radius: 2px 2px 0 0;
    background: color-mix(in srgb, var(--v2-acc1) 55%, transparent);
  }

  .barres { display: flex; flex-direction: column; gap: 4px; }
  h4 {
    margin: 0 0 2px; color: var(--v2-txt3);
    font: 500 10px var(--v2-sans); text-transform: uppercase; letter-spacing: .06em;
  }
  .ligne { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .nom {
    flex: 0 0 88px; min-width: 0; color: var(--v2-txt2); font: 400 11px var(--v2-sans);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .rail {
    flex: 1 1 auto; height: 7px; border-radius: 4px; overflow: hidden;
    background: color-mix(in srgb, var(--v2-acc1) 12%, transparent);
  }
  .rail i { display: block; height: 100%; border-radius: 4px; background: var(--v2-acc1); }
  .val {
    flex: 0 0 34px; text-align: right; color: var(--v2-txt2);
    font: 500 11px var(--v2-sans); font-variant-numeric: tabular-nums;
  }

  .heures { display: flex; flex-direction: column; gap: 4px; }
  .cases { display: flex; gap: 2px; height: 16px; }
  .cases i { flex: 1 1 0; min-width: 0; border-radius: 2px; background: var(--v2-acc1); }
</style>
