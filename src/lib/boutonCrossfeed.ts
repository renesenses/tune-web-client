/**
 * web#2073 (fil 2214) — l'état du bouton crossfeed de Lecture en cours.
 *
 * En mode PURE, le serveur ne construit aucun traitement : ni le crossfeed
 * intégré ni le greffon de crossfeed ne touchent le signal. Le bouton ne doit
 * donc jamais s'allumer en PURE, même si un réglage est coché ; il porte
 * alors le même voile que les écrans dédiés (`VoilePur`).
 */
export interface EtatBoutonCrossfeed {
  /** Le crossfeed intégré traite la zone (style `.active`). */
  actif: boolean;
  /** Le greffon de crossfeed traite la zone (style `.cf-pro`). */
  pro: boolean;
  /** La clé du voile PURE à montrer, ou `null` hors PURE. */
  voile: 'v2.pure.veilCfPro' | 'v2.pure.veilCf' | null;
}

/** web#2580 — `crosstalk` : Crosstalk (enceintes) traite la zone ; tout
 *  crossfeed (casque) y est écarté, le bouton ne s'allume donc pas. */
export function etatBoutonCrossfeed(
  o: { cfEnabled: boolean; cfProTraite: boolean; pur: boolean; crosstalk?: boolean },
): EtatBoutonCrossfeed {
  if (o.crosstalk && !o.pur) return { actif: false, pro: false, voile: null };
  if (o.pur) {
    return { actif: false, pro: false, voile: o.cfProTraite ? 'v2.pure.veilCfPro' : 'v2.pure.veilCf' };
  }
  return { actif: o.cfEnabled, pro: o.cfProTraite, voile: null };
}
