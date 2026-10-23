<!--
  tune-server-rust#6287, étape 2 — « Requête avancée » dans l'éditeur des
  playlists intelligentes : écrire en une ligne ce que l'éditeur compose règle
  par règle (`credit(artiste: "Bill Evans", instrument: piano)`,
  `genre:jazz annee:1955..1965`, `favori jamais_ecoute`…), l'essayer, et la
  reprendre dans l'éditeur quand elle a une forme d'éditeur.

  Rien n'est écrit en base : « Essayer » exécute la requête sur la
  bibliothèque et montre ce qu'elle retient. Seul « Enregistrer » de
  l'éditeur enregistre, et il enregistre les RÈGLES de l'éditeur.
-->
<script lang="ts">
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { decouperALaPosition, essayerRequete, LONGUEUR_MAX_REQUETE, type ResultatRequete } from '../../lib/requeteTextuelle';

  interface Props {
    triPar: string;
    ordre: string;
    maximum: number;
    /** Reprend les règles et le mode rendus par le serveur dans l'éditeur. */
    onReprendre: (rules: any[], mode: 'all' | 'any') => void;
  }
  let { triPar, ordre, maximum, onReprendre }: Props = $props();

  let q = $state('');
  let enCours = $state(false);
  let resultat = $state<ResultatRequete | null>(null);
  let jeton = 0;

  async function essayer() {
    const texte = q.trim();
    if (!texte || enCours) return;
    const j = ++jeton;
    enCours = true;
    const r = await essayerRequete(texte, { sort_by: triPar, sort_order: ordre, max_tracks: maximum }, api.postRequeteTextuelle);
    if (j === jeton) {
      resultat = r;
      enCours = false;
    }
  }

  const APERCU = 8;
  const titreDe = (p: any) => [p?.title, p?.artist_name].filter(Boolean).join(' — ');
</script>

<section class="requete" data-requete-avancee>
  <span class="lbl">{$t('v2.spl.requeteTitre' as any)}</span>
  <p class="aide">{$t('v2.spl.requeteAide' as any)}</p>
  <textarea class="txt" rows="2" maxlength={LONGUEUR_MAX_REQUETE} bind:value={q}
    placeholder={'credit(artiste: "Bill Evans", instrument: piano) annee:1955..1965'}
    aria-label={$t('v2.spl.requeteTitre' as any)}
    onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void essayer(); } }}></textarea>
  <div class="gestes">
    <button class="lnk" onclick={essayer} disabled={enCours || !q.trim()} data-essayer>
      {$t((enCours ? 'v2.spl.requeteEnCours' : 'v2.spl.requeteEssayer') as any)}
    </button>
  </div>

  {#if resultat?.etat === 'invalide'}
    <div class="erreur" role="alert" data-requete-erreur>
      <p>{$t('v2.spl.requeteInvalide' as any)} {resultat.message}</p>
      {#if resultat.position != null}
        {@const d = decouperALaPosition(q.trim(), resultat.position)}
        <code class="extrait">{d.avant}<mark>{d.fautif || ' '}</mark>{d.apres}</code>
      {/if}
    </div>
  {:else if resultat?.etat === 'echec'}
    <p class="erreur" role="alert">{$t('v2.spl.requeteEchec' as any)}</p>
  {:else if resultat?.etat === 'ok'}
    {@const r = resultat.reponse}
    <div class="resultat" data-requete-resultat>
      <p>{$t('v2.spl.requeteCompte' as any).replace('{n}', String(r.total))}</p>
      {#if r.regles_refusees.length}
        <p class="avert">{$t('v2.spl.requeteRefusees' as any).replace('{regles}', r.regles_refusees.join(', '))}</p>
      {/if}
      {#if r.tracks.length}
        <ul>
          {#each r.tracks.slice(0, APERCU) as p, i (p?.id ?? i)}<li>{titreDe(p)}</li>{/each}
        </ul>
      {/if}
      {#if r.rules && r.match_mode}
        {@const regles = r.rules}
        {@const mode = r.match_mode}
        <button class="lnk" onclick={() => onReprendre(regles, mode)} data-reprendre>{$t('v2.spl.requeteReprendre' as any)}</button>
      {:else}
        <p class="precision" data-sans-forme>{$t('v2.spl.requeteSansForme' as any)}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .requete { display: flex; flex-direction: column; gap: 6px; }
  .aide, .precision { margin: 0; font-size: 12px; color: var(--v2-txt2, var(--tune-text-muted)); }
  textarea { font-family: var(--v2-mono, ui-monospace, monospace); resize: vertical; }
  .gestes { display: flex; gap: 10px; }
  .erreur { color: var(--tune-danger, #d33); font-size: 13px; margin: 0; }
  .erreur p { margin: 0 0 4px; }
  .extrait { display: block; white-space: pre-wrap; font-size: 12px; color: var(--tune-text); }
  .extrait mark { background: var(--tune-danger, #d33); color: #fff; border-radius: 2px; }
  .resultat { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .resultat p { margin: 0; }
  .avert { color: var(--tune-warning, #b80); }
  ul { margin: 0; padding-left: 18px; font-size: 12px; }
</style>
