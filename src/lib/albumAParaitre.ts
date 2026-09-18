/**
 * Albums À PARAÎTRE — point 10 d'Yves Corbat (17/09/2026) : « Nouveautés Qobuz
 * à paraître : les titres indisponibles ne sont pas grisés ».
 *
 * Les sections éditoriales de Qobuz mêlent des albums déjà sortis et des
 * albums annoncés. Les seconds s'affichaient comme les autres, avec un disque
 * de lecture — et la lecture échouait (« no url », 502 côté service). Rien à
 * l'écran ne les distinguait.
 *
 * Le serveur porte désormais `released_at` (secondes d'époque) sur les albums
 * de service qui en annoncent une. Absente, on ne conclut rien : un album sans
 * date n'est pas « à paraître », il est simplement sans date.
 */

/**
 * La PISTE est-elle indisponible ?
 *
 * C'est la granularité juste (Bertrand, 17/09/2026 : « les albums ne sont pas
 * entièrement grisés, seulement certaines pistes ») : un album annoncé laisse
 * souvent écouter ses singles déjà sortis. Le serveur porte `disponible`
 * (Qobuz : `streamable`). `undefined` = le service n'a rien dit, et on ne
 * grise pas ce qu'on ne sait pas.
 */
export function pisteIndisponible(p: any): boolean {
  return p?.disponible === false;
}

/** La date de parution annoncée, en millisecondes, ou `null`. */
export function parutionMs(o: any): number | null {
  const ts = o?.released_at;
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null;
  return ts * 1000;
}

/** L'album n'est-il pas encore sorti ? */
export function estAParaitre(o: any, maintenant: number = Date.now()): boolean {
  const ms = parutionMs(o);
  return ms !== null && ms > maintenant;
}

/** La date de parution, écrite dans la langue de l'interface. */
export function dateDeParution(o: any, locale?: string): string | null {
  const ms = parutionMs(o);
  if (ms === null) return null;
  try {
    return new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
