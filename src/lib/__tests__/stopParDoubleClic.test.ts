import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arretPossible } from '../arretTransport';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * ⚠️ MISE À JOUR DU 08/09/2026 — le bouton Stop est REVENU.
 *
 * Le 05/09, Bertrand a remplacé le bouton autonome par un double-clic sur
 * Lecture. Le 08/09 : « Et le bouton Stop de la transport barre !! ?? !! ».
 * Les deux chemins cohabitent désormais et appellent le MÊME `arreter` — le
 * double-clic pour qui l'a pris en main, le bouton pour qui ne peut pas le
 * deviner.
 *
 * Ce fichier garde donc le double-clic, tel qu'il a été mis au point ; le
 * bouton, sa condition et l'unicité de l'appel sont gardés par
 * `arretTransport.test.ts`. Le cas retiré ci-dessous — « le bouton autonome a
 * disparu » — a été supprimé parce qu'il affirmait une décision que Bertrand a
 * révoquée, et non parce qu'il gênait.
 */
describe('Stop au double-clic (idée de Bertrand, 05/09/2026)', () => {
  const bar = sansCommentaires(lire('src/components/TransportBar.svelte'));

  it("le stop utilise le double-clic DU SYSTÈME, pas un chronomètre maison", () => {
    // Deux réglages maison ont été faux : 350 ms avalait un re-clic délibéré,
    // 250 ms rendait le double-clic trop difficile — « Pas de stop sur double
    // click !! ». La bonne valeur n'est pas la mienne, c'est celle que
    // l'utilisateur a réglée dans son système. On la lit là où elle est.
    expect(bar).toContain('onclick={clicLecture}');
    expect(bar).toContain('ondblclick={doubleClicLecture}');
    expect(bar, 'un chronomètre maison est revenu').not.toContain('FENETRE_DOUBLE_CLIC');
    expect(bar).not.toContain('dernierClicLecture');
  });

  it('le SECOND clic ne rebascule pas — sinon la musique repart entre les deux', () => {
    // `event.detail` vaut le rang du clic DANS l'intervalle du système.
    const i = bar.indexOf('async function clicLecture(');
    expect(i).toBeGreaterThan(-1);
    const corps = bar.slice(i, i + 260);
    expect(corps).toContain('if (e.detail >= 2) return;');
    expect(corps).toContain('await togglePlayPause();');
    expect(corps, 'le premier clic ne doit pas être retardé').not.toContain('setTimeout');
  });

  it("au clavier, Entrée bascule et n'arrête pas", () => {
    // Entrée sur un bouton donne `detail: 0` : la garde `>= 2` la laisse
    // passer. La touche `S` reste le chemin d'arrêt au clavier.
    const i = bar.indexOf('async function clicLecture(');
    expect(bar.slice(i, i + 260)).toContain('>= 2');
    expect(lire('src/lib/keyboard.ts')).toContain("case 'KeyS':");
  });

  it('le double-clic passe par le même arrêt que le bouton', () => {
    // Une seconde implémentation serait un second comportement.
    expect(bar).toContain('async function doubleClicLecture() {');
    expect(bar.slice(bar.indexOf('async function doubleClicLecture() {'), bar.indexOf('async function doubleClicLecture() {') + 90))
      .toContain('await arreter();');
  });

  it("l'arrêt REPORTE l'état de la zone", () => {
    // Bertrand, 05/09/2026 : « Play - Pause - Stop me semble mal géré ». Après
    // un `api.stop` nu, la zone restait « playing » dans le magasin : le bouton
    // gardait l'icône pause, et le clic suivant envoyait une pause à une zone
    // déjà arrêtée — le bouton paraissait mort.
    const zones = lire('src/lib/stores/zones.ts');
    expect(zones).toContain('export async function stopAndSync(zoneId: number)');
    expect(zones.slice(zones.indexOf('export async function stopAndSync'), zones.indexOf('export async function stopAndSync') + 300))
      .toContain('syncZone(zone)');
    // Plus personne n'appelle `api.stop` sans reporter l'état.
    for (const f of ['src/components/TransportBar.svelte', 'src/lib/keyboard.ts']) {
      expect(sansCommentaires(lire(f)), f).not.toContain('api.stop(');
    }
  });

  it("la RADIO n'a pas de stop", () => {
    // Un flux en direct ne se met pas en pause pour reprendre où l'on était.
    // La condition était écrite en dur ici ; elle vit dans
    // `lib/arretTransport` depuis que le bouton est revenu, pour que le bouton
    // et le double-clic ne puissent pas diverger. Un test l'APPELLE désormais
    // (`arretTransport.test.ts`) au lieu de relire ce fichier.
    expect(bar).toContain('arretPossible(zone?.id, displayTrack?.source)');
    expect(arretPossible(10, 'radio')).toBe(false);
    expect(arretPossible(10, 'local')).toBe(true);
  });

  it("l'infobulle ANNONCE le geste, sinon personne ne le devine", () => {
    expect(bar).toContain('transport.dblClickStop');
    const fr = lire('src/lib/locales/fr.ts');
    expect(fr).toContain('"transport.dblClickStop"');
  });
});
