import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Lot 4 du portage — contenus portés de l'ancienne interface, seule à les
 * offrir : préréglages d'égaliseur enregistrés, YouTube Music (tendances,
 * ambiances), diagnostic réseau et réarmement ASIO, tâches de fond, pochette
 * de radio téléversée. (Concerts, Hors ligne, Tableau de bord et
 * Recommandations : `vuesHeriteesLot4.test.ts`.)
 */
const lire = (f: string) => readFileSync(f, 'utf8');
const corps = (src: string, nom: string) => {
  const i = src.indexOf(`async function ${nom}(`) >= 0 ? src.indexOf(`async function ${nom}(`) : src.indexOf(`function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n  }\n', i));
};

describe('égaliseur : mes préréglages', () => {
  const EQ = lire('src/components/v2/EqualizerV2.svelte');
  it('lister, enregistrer, appliquer, supprimer', () => {
    expect(EQ).toContain('api.listEqPresets()');
    expect(EQ).toContain('onclick={enregistrerPreset}');
    expect(EQ).toContain('onclick={() => appliquerMonPreset(p)}');
    expect(EQ).toContain('onclick={() => supprimerMonPreset(p)}');
  });
  it('🔴 une suppression refusée remet la liste, et le dit', () => {
    const c = corps(EQ, 'supprimerMonPreset');
    expect(c).toMatch(/catch \{[\s\S]*mesPresets = avant;[\s\S]*notifications\.error/);
  });
  it('appliquer allume l’égaliseur et envoie la courbe', () => {
    const c = corps(EQ, 'appliquerMonPreset');
    expect(c).toContain('if (!enabled) enabled = true;');
    expect(c).toContain('void save();');
  });
});

describe('YouTube Music : tendances et ambiances', () => {
  const S = lire('src/components/v2/StreamingV2.svelte');
  const Y = lire('src/components/v2/YouTubeDecouverteV2.svelte');
  it('l’onglet n’existe que pour YouTube', () => {
    expect(S).toContain("const ongletYouTube = $derived(active === 'youtube');");
    expect(S).toContain("...(ongletYouTube ? [{ id: 'ytmusic' as Sub,");
    expect(S).toMatch(/\{:else if sub === 'ytmusic' && ongletYouTube\}\s*<YouTubeDecouverteV2 \/>/);
  });
  it('les trois routes sont appelées, et la lecture passe par YouTube', () => {
    for (const f of ['getYouTubeCharts(', 'getYouTubeMoods()', 'getYouTubeMoodPlaylists(']) expect(Y).toContain(f);
    expect(Y).toContain("source: 'youtube' as any, source_id: String(sid)");
    expect(Y).toContain("streaming_playlist_id: id, source: 'youtube' as any");
  });
});

describe('Santé : ASIO et réseau', () => {
  const H = lire('src/components/v2/TuneHealthV2.svelte');
  it('🔴 la détection ASIO bloquée après un plantage se réarme, après confirmation', () => {
    expect(H).toContain('asio_warm_scan?.blocked_after_crash');
    const c = corps(H, 'rearmerAsio');
    // `> -1` d'abord : sans confirmation, indexOf vaut -1, qui est bien
    // « inférieur » — l'ordre seul ne garde rien (contre-épreuve du 19/09).
    const conf = c.indexOf('dialogs.confirm(');
    expect(conf, 'le réarmement ne demande plus confirmation').toBeGreaterThan(-1);
    expect(conf).toBeLessThan(c.indexOf('api.rearmAsioWarmScan()'));
  });
  it('le diagnostic réseau se lit à la demande', () => {
    expect(H).toContain('onclick={basculerReseau}');
    expect(corps(H, 'lireReseau')).toContain('api.getNetworkDiagnostics()');
  });
});

describe('tâches de fond (#2227) et pochette de radio', () => {
  it('v2Live suit system.background_tasks, la barre en tire sa ligne', () => {
    const live = lire('src/lib/v2Live.ts');
    const barre = lire('src/components/v2/Sidebar.svelte');
    expect(live).toContain("if (type === 'system.background_tasks')");
    expect(barre).toContain('api.getBackgroundTasks()');
    expect(barre).toContain('libelleBanniereEnrichissement($tachesDeFond');
  });
  it('une station existante accepte une image téléversée', () => {
    const R = lire('src/components/v2/RadioEditModale.svelte');
    expect(R).toContain('onchange={televerserPochette}');
    expect(corps(R, 'televerserPochette')).toContain('api.uploadRadioCover(radio.id, f)');
  });
});
