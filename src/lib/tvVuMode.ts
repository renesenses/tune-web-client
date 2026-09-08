/// Choix d'instrument de niveau du mode Grand écran (#2514).
///
/// Il n'existait qu'un instrument — la paire de cadrans à aiguille — et le
/// réglage était un booléen, `TvSettings.vuMeters`. Le demandeur veut pouvoir
/// choisir un bargraphe ; le booléen devient donc un choix d'instrument.
///
/// La migration est le point délicat : personne ne doit perdre son réglage.
/// L'ancien booléen ne portait que deux états, et ils se traduisent sans
/// ambiguïté — `false` → rien affiché, `true` (ou absent, le défaut historique)
/// → l'aiguille, l'instrument qui était réellement à l'écran. **Aucun réglage
/// existant n'atterrit sur le bargraphe** : c'est un choix neuf, il se prend.

export type VuInstrument = 'off' | 'needle' | 'bars';

/** Ordre d'affichage dans le panneau de réglages. */
export const VU_INSTRUMENTS: readonly VuInstrument[] = ['off', 'needle', 'bars'];

/** Comportement historique : les cadrans étaient affichés par défaut. */
export const VU_INSTRUMENT_DEFAULT: VuInstrument = 'needle';

export function isVuInstrument(value: unknown): value is VuInstrument {
  return typeof value === 'string' && (VU_INSTRUMENTS as readonly string[]).includes(value);
}

/**
 * Lit le choix d'instrument dans les réglages persistés, en migrant l'ancien
 * booléen quand la nouvelle clé n'y est pas encore.
 *
 * Ordre : la nouvelle clé d'abord (elle seule distingue aiguille et bargraphe),
 * l'ancien booléen ensuite, le défaut historique en dernier. Une nouvelle clé
 * corrompue (valeur inconnue) retombe sur l'ancien booléen plutôt que sur le
 * défaut : c'est encore l'intention de l'utilisateur qu'on lit.
 */
export function readVuInstrument(stored: unknown): VuInstrument {
  if (typeof stored !== 'object' || stored === null) return VU_INSTRUMENT_DEFAULT;
  const p = stored as Record<string, unknown>;
  if (isVuInstrument(p.vuMeter)) return p.vuMeter;
  // Migration de `TvSettings.vuMeters` : seul `false` signifiait « masqués ».
  if (p.vuMeters === false) return 'off';
  return VU_INSTRUMENT_DEFAULT;
}

/**
 * Miroir booléen écrit à côté du nouveau choix.
 *
 * Un retour en arrière sur une version antérieure relirait `vuMeters` ; sans
 * ce miroir, celui qui avait masqué les instruments les verrait revenir. La
 * dérivation est à sens unique (on écrit, on ne relit jamais ce miroir quand
 * `vuMeter` est présent), donc les deux clés ne peuvent pas diverger.
 */
export function vuInstrumentLegacyFlag(instrument: VuInstrument): boolean {
  return instrument !== 'off';
}
