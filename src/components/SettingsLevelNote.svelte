<script lang="ts">
  /**
   * « n réglage(s) masqué(s) ici » — la trace laissée SUR PLACE par le filtre
   * de niveau (tune-server-rust#1617).
   *
   * Le pied d'onglet annonce déjà un total par onglet. Il ne dit pas OÙ, et
   * surtout il ne voyait pas les sous-réglages : une ligne commandée par un
   * interrupteur parent (« Valeurs par facette » sous Oxygen, le préampli
   * ReplayGain sous le mode ReplayGain) disparaissait sans que rien, ni dans
   * la section ni en pied de page, n'en garde la trace — alors qu'elle
   * continuait d'agir. C'est le défaut décrit dans #2131 : le seul levier qui
   * débloque l'utilisateur existe, agit, et rien ne dit comment l'atteindre.
   *
   * Deux règles tenues ici :
   *  - on ne rend RIEN quand il n'y a rien à annoncer (0 masqué), sinon la
   *    note devient un bruit permanent que personne ne lit plus ;
   *  - le bouton monte au plus bas niveau qui révèle vraiment quelque chose
   *    (`revealLevel`), jamais d'un cran à l'aveugle : proposer
   *    « intermédiaire » à un débutant dont les seuls masqués sont EXPERT est
   *    un clic qui ne montre rien, et le réglage reste hors d'atteinte.
   */
  import { t } from '../lib/i18n';
  import {
    revealLevel,
    type SettingKey,
    type SettingsLevel,
  } from '../lib/settingLevels';

  interface Props {
    /** Réglages de CETTE section actuellement masqués par le niveau. */
    hidden: SettingKey[];
    /** Niveau d'affichage courant. */
    current: SettingsLevel;
    /** Appliquer un nouveau niveau (le composant ne persiste rien lui-même). */
    onRaise: (level: SettingsLevel) => void;
  }
  let { hidden, current, onRaise }: Props = $props();

  let cible = $derived(hidden.length > 0 ? revealLevel(hidden, current) : null);
</script>

{#if hidden.length > 0 && cible}
  <p class="lvnote" data-hidden={hidden.length}>
    <span class="lvnote-text">
      {$t('settings.hiddenHere' as any).replace('{n}', String(hidden.length))}
    </span>
    <button type="button" class="lvnote-raise" onclick={() => onRaise(cible as SettingsLevel)}>
      {$t('settings.hiddenHereReveal' as any)}
    </button>
  </p>
{/if}

<style>
  .lvnote {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--tune-text-secondary, #9ca3af);
  }

  .lvnote-raise {
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: var(--tune-accent);
    cursor: pointer;
    text-decoration: underline;
  }
</style>
