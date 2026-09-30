/**
 * Comparaison de versions de Tune, pré-versions comprises (1.0.0-rc1).
 *
 * Le 29/09/2026, la version qui aurait été la 0.9.170 devient la 1.0.0-rc1.
 * L'ancien `isNewer` de `stores/updates.ts` découpait sur les points et passait
 * chaque morceau à `Number` : `Number('0-rc1')` vaut NaN, et toute comparaison
 * avec NaN est fausse. Résultat : rc1 → rc2, rc1 → 1.0.0 et rc1 → 1.0.1
 * rendaient tous « pas plus récent ».
 *
 * Règles semver (§11), réduites à ce que Tune publie :
 *   - on compare MAJEUR.MINEUR.CORRECTIF numériquement ;
 *   - à base égale, une pré-version passe AVANT la version finale
 *     (1.0.0-rc1 < 1.0.0) ;
 *   - deux pré-versions se comparent identifiant par identifiant, séparés par
 *     des points : numérique contre numérique, sinon ordre ASCII, un
 *     identifiant numérique avant un alphanumérique, le plus court d'abord ;
 *   - `v` en tête et métadonnées de build (`+…`) sont ignorés.
 *
 * `rc10` > `rc9` n'est PAS garanti par semver strict (identifiant
 * alphanumérique, ordre ASCII : « rc10 » < « rc9 »). On compare donc le
 * préfixe alphabétique puis le nombre qui suit : rc9 < rc10, comme le
 * serveur (`tune-core/src/updater.rs`, `is_newer`, qui ne lit que les nombres
 * du suffixe).
 */

interface Version {
  base: [number, number, number];
  pre: string[];
}

function lire(v: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return null;
  return {
    base: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split('.') : [],
  };
}

/** `rc10` → ['rc', 10] ; `12` → ['', 12] ; `beta` → ['beta', null]. */
function decouper(id: string): [string, number | null] {
  const m = /^([A-Za-z-]*)(\d*)$/.exec(id);
  if (!m) return [id, null];
  return [m[1], m[2] === '' ? null : Number(m[2])];
}

function comparerIdentifiant(a: string, b: string): number {
  const [pa, na] = decouper(a);
  const [pb, nb] = decouper(b);
  // Purement numériques : ils passent avant tout alphanumérique (semver §11.4.3).
  if (pa === '' && pb !== '' && na !== null) return -1;
  if (pb === '' && pa !== '' && nb !== null) return 1;
  if (pa !== pb) return pa < pb ? -1 : 1;
  if (na === nb) return 0;
  if (na === null) return -1;
  if (nb === null) return 1;
  return na < nb ? -1 : 1;
}

/**
 * -1 si a < b, 0 si égales, 1 si a > b. `null` si l'une des deux n'est pas
 * une version lisible : l'appelant décide, on ne devine pas.
 */
export function comparerVersions(a: string, b: string): -1 | 0 | 1 | null {
  const va = lire(a);
  const vb = lire(b);
  if (!va || !vb) return null;
  for (let i = 0; i < 3; i++) {
    if (va.base[i] !== vb.base[i]) return va.base[i] < vb.base[i] ? -1 : 1;
  }
  if (va.pre.length === 0 && vb.pre.length === 0) return 0;
  if (va.pre.length === 0) return 1; // 1.0.0 > 1.0.0-rc1
  if (vb.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    if (i >= va.pre.length) return -1;
    if (i >= vb.pre.length) return 1;
    const c = comparerIdentifiant(va.pre[i], vb.pre[i]);
    if (c !== 0) return c < 0 ? -1 : 1;
  }
  return 0;
}

/** `b` est-elle STRICTEMENT plus récente que `a` ? Faux si l'une est illisible. */
export function estPlusRecente(a: string, b: string): boolean {
  return comparerVersions(a, b) === -1;
}

/**
 * La base X.Y.Z d'une version : `1.0.0-rc1` → `1.0.0`.
 *
 * En convention A (29/09/2026), le client web embarqué porte `1.0.0` dans
 * `package.json` pendant que le serveur, lui, se déclare `1.0.0-rc1` (sa
 * version vient du tag). Comparer les chaînes brutes ferait crier « client
 * périmé » sur une installation saine.
 */
export function versionDeBase(v: string): string {
  return v.trim().replace(/^v/, '').replace(/[-+].*$/, '');
}
