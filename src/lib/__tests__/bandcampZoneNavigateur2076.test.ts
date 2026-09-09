/**
 * #2076 / #2158 — « Bandcamp sur la zone navigateur : rien ne joue, et le
 * message accuse la zone. »
 *
 * Bilou, fil forum 1509, Tune 0.9.94, zone navigateur « Ce PC ». Tune lui
 * affichait, en rouge : « Ce PC — cette zone n'a pas accepté le MP3 128 kbit/s
 * de Bandcamp. Essayez une autre zone. » Le journal serveur ne portait
 * pourtant AUCUN refus, et la même zone jouait un MP3 local trois minutes
 * plus tard.
 *
 * La condition fautive était `apres.output_sent === false`
 * (`BandcampView.svelte:220`). Sur une zone navigateur, ce champ est faux PAR
 * CONSTRUCTION : l'onglet est la sortie, il n'y a aucun périphérique, et le
 * serveur l'écrit noir sur blanc (`tune-core/src/orchestrator.rs:724`,
 * `orchestrator/transport.rs:1036-1041`). Le message se déclenchait donc à
 * chaque écoute Bandcamp sur zone navigateur — y compris depuis que le relais
 * sert le flux à ces zones (#2158, PR #2596), c'est-à-dire y compris quand le
 * son sort.
 */
import { describe, it, expect } from 'vitest';
import { verdictEnvoiBandcamp } from '../bandcampEnvoi';

const NAVIGATEUR = true;
const SORTIE_REELLE = false;

describe('#2076 — ce que Tune dit après un envoi Bandcamp', () => {
  it('🔴 n’accuse JAMAIS une zone navigateur qui a reçu un flux — c’était le défaut', () => {
    // Exactement ce que le serveur rend à Bilou : pas de périphérique, donc
    // output_sent=false, mais une stream_url que l'onglet va tirer.
    expect(
      verdictEnvoiBandcamp(
        { output_sent: false, stream_url: 'http://192.168.1.18:8888/stream/abc.mp3' },
        NAVIGATEUR,
      ),
    ).toBe('succes');
  });

  it('le dit quand même une sortie RÉELLE refuse le flux (#1768 reste couvert)', () => {
    // Un renderer DLNA qui n'a pas pris le MP3 : là, nommer la zone est juste.
    expect(
      verdictEnvoiBandcamp(
        { output_sent: false, stream_url: 'http://192.168.1.18:8888/stream/abc.mp3' },
        SORTIE_REELLE,
      ),
    ).toBe('refusDeLaZone');
  });

  it('une zone navigateur SANS flux est un vrai échec — mais pas celui de la zone', () => {
    expect(verdictEnvoiBandcamp({ output_sent: false, stream_url: null }, NAVIGATEUR)).toBe(
      'aucunFlux',
    );
    expect(verdictEnvoiBandcamp({ output_sent: false }, NAVIGATEUR)).toBe('aucunFlux');
  });

  it('n’empile pas un « succès » vert par-dessus le rouge déjà affiché', () => {
    // `playAndSync` a déjà montré `zone.error` (`checkPlayError`). L'ancien
    // code enchaînait une notification de succès : deux messages
    // contradictoires pour une seule lecture.
    expect(
      verdictEnvoiBandcamp(
        { output_sent: false, error: 'renderer refused', stream_url: null },
        SORTIE_REELLE,
      ),
    ).toBe('dejaSignale');
    expect(
      verdictEnvoiBandcamp({ output_sent: true, error: 'boom' }, NAVIGATEUR),
    ).toBe('dejaSignale');
  });

  it('une sortie réelle qui a pris le flux reste un succès', () => {
    expect(
      verdictEnvoiBandcamp({ output_sent: true, stream_url: 'http://x/y.mp3' }, SORTIE_REELLE),
    ).toBe('succes');
  });
});

describe('#2076 — le message qui remplace l’accusation existe partout', () => {
  it('« aucun flux » est traduit dans les 11 locales du client', async () => {
    // Une clef absente retombe silencieusement sur autre chose : l'auditeur
    // verrait la clef brute, ou pire, un message d'une autre langue.
    const locales = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const code of locales) {
      const mod = await import(`../locales/${code}.ts`);
      const dict = mod.default as Record<string, string>;
      expect(dict['bandcamp.noStream'], `bandcamp.noStream manque dans ${code}`).toBeTruthy();
    }
  });
});
