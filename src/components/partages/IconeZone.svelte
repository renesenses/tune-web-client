<script lang="ts" module>
  /**
   * Les 52 icônes de zone de Rémi (`src/assets/zone-icons/`, CC0), lues comme
   * texte au build. Ce sont des fichiers du dépôt, vérifiés (tracés seuls :
   * ni script, ni lien, ni image — garde `iconesZone.test.ts`), d'où le
   * `{@html}` ci-dessous.
   */
  const SOURCES = import.meta.glob('../../assets/zone-icons/*/*.svg', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>;
  const PAR_NOM: Record<string, string> = Object.fromEntries(
    Object.entries(SOURCES).map(([chemin, svg]) => [chemin.replace(/^.*zone-icons\//, '').replace(/\.svg$/, ''), svg]),
  );
</script>

<script lang="ts">
  /**
   * L'icône d'une zone (thème Roon-like, itération 7). `nom` : une icône
   * précise (`famille/nom`) ; sinon celle de `zone`, choix de l'utilisateur
   * d'abord, défaut d'après le type de sortie ensuite (`lib/iconesZone`).
   */
  import { t } from '../../lib/i18n';
  import { iconeDeZone, choixIconesZones, cleLibelleIcone, type ZoneIconeSource } from '../../lib/iconesZone';

  interface Props {
    zone?: ZoneIconeSource | null;
    nom?: string | null;
    groupe?: boolean;
    taille?: number;
    /** Nommée pour les lecteurs d'écran ; décorative par défaut. */
    nommee?: boolean;
  }
  let { zone = null, nom = null, groupe = false, taille = 20, nommee = false }: Props = $props();

  const choisi = $derived(nom ?? iconeDeZone(zone, $choixIconesZones, { groupe }));
  const svg = $derived(PAR_NOM[choisi] ?? PAR_NOM['appareils/enceinte'] ?? '');
</script>

<span class="icone-zone" data-icone-zone={choisi} style:--taille-icone-zone={`${taille}px`}
  role={nommee ? 'img' : undefined} aria-label={nommee ? $t(cleLibelleIcone(choisi) as any) : undefined}
  aria-hidden={nommee ? undefined : 'true'}>{@html svg}</span>

<style>
  .icone-zone { display: inline-grid; place-items: center; width: var(--taille-icone-zone, 20px); height: var(--taille-icone-zone, 20px); flex: none; color: inherit; }
  .icone-zone :global(svg) { width: 100%; height: 100%; display: block; }
</style>
