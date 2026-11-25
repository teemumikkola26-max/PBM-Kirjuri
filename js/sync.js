/* =========================================================================
   sync.js – kohteen synkronointi pilveen (SharePoint, ks. sharepoint.js)

   Laite ensin: kaikki tallentuu ensin laitteelle, ja synkronointi siirtää
   muutokset pilveen ja hakee muiden tutkijoiden muutokset, kun yhteys on.

   Kohde puretaan riveiksi (SharePoint-lista, avain kohde + laji + id):
     kohde        kohteen perustiedot
     kerros, tila, kohta (suunnitelma), mir (mittalaite), ka (kuntoarvion perustiedot),
     kaosa (kuntoarvion rakennusosa), havainto, tiedosto (kuvan tiedot; kuva kirjastossa)
   Kaksi tutkijaa voi kirjata yhtä aikaa: eri rivit eivät koske toisiinsa.

   Muutosten tunnistus: jokaisen rivin viimeksi synkronoitu sisältö (tiiviste)
   on tallessa (asetukset/sync:<kohde>). Erilainen tiiviste = lähetettävä muutos.
   Ristiriita (sama rivi muuttunut täällä ja muualla): uudempi voittaa, ja
   tutkija näkee ilmoituksen. Poisto on merkintä (deleted), ei hävitä tietoa.
   ========================================================================= */
(function () {
  "use strict";
  const { S, Model } = App;
  const ARRAYS = { kerros: "kerrokset", tila: "tilat", kohta: "suunnitelma", mir: "seuranta", yleiskuva: "yleiskuvat", muistiinpano: "muistiinpanot" };
  const LOCAL_ONLY = ["paikannus", "kalusto", "kerrokset", "tilat", "suunnitelma", "seuranta", "kuntoarvio", "akk", "muistiinpanot", "muisti", "viimeisin", "seuraavaNro", "updated", "viety", "pilvi", "avattu", "__uusiPdf"];
  const P = () => Cloud.palvelu;
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" };
  const tiedostonimi = (f) => f.id + "." + (EXT[(f.type || (f.blob && f.blob.type) || "").split(";")[0]] || "bin");
  const turvallinen = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "kohde";
  const state = { tila: "pois", jono: 0, viesti: "", aika: 0, kaynnissa: false };
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(state); } catch (e) { console.warn(e); } });

  /* ---------- Apuneuvot ---------- */
  function stable(o) {
    if (Array.isArray(o)) return "[" + o.map(stable).join(",") + "]";
    if (o && typeof o === "object") return "{" + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}";
    return JSON.stringify(o === undefined ? null : o);
  }
  function hash(s) {   // FNV-1a 32-bit + pituus: riittää muutosten tunnistukseen
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36) + "." + s.length.toString(36);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* Kohde + havainnot + tiedostojen tiedot -> rivit { "laji:id": data } */
  function toRows(k, havainnot, tiedostot) {
    const rows = {};
    const base = {};
    Object.keys(k).forEach((x) => { if (!LOCAL_ONLY.includes(x)) base[x] = k[x]; });
    rows["kohde:" + k.id] = base;
    Object.entries(ARRAYS).forEach(([laji, key]) => (k[key] || []).forEach((it, j) => { rows[laji + ":" + it.id] = Object.assign(clone(it), { _j: j }); }));
    if (k.kuntoarvio) {
      const ka = k.kuntoarvio;
      rows["ka:ka"] = { perustiedot: ka.perustiedot || {}, rajaukset: ka.rajaukset || "", ptsVuodet: ka.ptsVuodet || 10 };
      Object.entries(ka.osat || {}).forEach(([id, o]) => { rows["kaosa:" + id] = clone(o); });
    }
    if (k.akk) {
      rows["akk:akk"] = { tiedot: k.akk.tiedot || {} };
      Object.entries(k.akk.osiot || {}).forEach(([id, o]) => { rows["akkosa:" + id] = clone(o); });
    }
    havainnot.forEach((h) => { rows["havainto:" + h.id] = clone(h); });
    tiedostot.forEach((f) => { rows["tiedosto:" + f.id] = { id: f.id, type: f.type || (f.blob && f.blob.type) || "", kind: f.kind || null, havaintoId: f.havaintoId || null, seuranta: f.seuranta || null, created: f.created || null }; });
    return rows;
  }

  /* Rivit -> kohteen rakenteet (järjestys _j:n mukaan) */
  function applyRow(k, havainnot, laji, id, data, deleted) {
    if (laji === "kohde") { if (!deleted) Object.keys(data).forEach((x) => { if (!LOCAL_ONLY.includes(x)) k[x] = data[x]; }); return; }
    if (ARRAYS[laji]) {
      const arr = k[ARRAYS[laji]] = k[ARRAYS[laji]] || [];
      const i = arr.findIndex((x) => x.id === id);
      if (deleted) { if (i >= 0) arr.splice(i, 1); return; }
      const it = clone(data);
      const j = it._j; delete it._j;
      if (i >= 0) arr[i] = it; else arr.splice(Math.min(j != null ? j : arr.length, arr.length), 0, it);
      return;
    }
    if (laji === "ka") { k.kuntoarvio = k.kuntoarvio || { osat: {} }; if (!deleted) Object.assign(k.kuntoarvio, clone(data)); return; }
    if (laji === "kaosa") { k.kuntoarvio = k.kuntoarvio || { perustiedot: {}, rajaukset: "", ptsVuodet: 10, osat: {} }; if (deleted) delete k.kuntoarvio.osat[id]; else k.kuntoarvio.osat[id] = clone(data); return; }
    if (laji === "akk") { k.akk = k.akk || { tiedot: {}, osiot: {} }; if (!deleted) k.akk.tiedot = clone(data.tiedot || {}); return; }
    if (laji === "akkosa") { k.akk = k.akk || { tiedot: {}, osiot: {} }; if (deleted) delete k.akk.osiot[id]; else k.akk.osiot[id] = clone(data); return; }
    if (laji === "havainto") {
      const i = havainnot.findIndex((x) => x.id === id);
      if (deleted) { if (i >= 0) havainnot.splice(i, 1); return; }
      if (i >= 0) Object.keys(havainnot[i]).forEach((x) => delete havainnot[i][x]);
      const h = i >= 0 ? Object.assign(havainnot[i], clone(data)) : clone(data);
      if (i < 0) havainnot.push(h);
    }
  }

  async function meta(kid) { return (await DB.get("asetukset", "sync:" + kid)) || { id: "sync:" + kid, hashes: {}, cursor: null, files: {} }; }
  const saveMeta = (m) => DB.put("asetukset", m);

  /* ---------- Yhden kohteen synkronointi ---------- */
  async function syncKohde(kid, opts) {
    opts = opts || {};
    const me = Cloud.user();
    const open = S.kohde && S.kohde.id === kid;
    let k = open ? S.kohde : await DB.get("kohteet", kid);
    if (!k) return;
    const m = await meta(kid);
    let havainnot = open ? S.havainnot : await DB.byKohde("havainnot", kid);
    const tied = await DB.byKohde("tiedostot", kid);

    // 1) Haku: muiden muutokset kursorista lähtien (palvelu limittää minuutin)
    const remote = await P().muutokset(kid, m.cursor);
    const ristiriidat = [];
    let muuttui = false, maxAika = m.cursor;
    const kesken = opts.kesken || null;     // juuri muokattava havainto: ei korvata kesken kirjauksen
    let local = toRows(k, havainnot, tied);
    remote.forEach((r) => {
      const key = r.laji + ":" + r.id;
      const rh = r.deleted ? "DEL" : hash(stable(r.data));
      if (!maxAika || r.updated_at > maxAika) maxAika = r.updated_at;
      if (m.hashes[key] === rh) return;                        // jo ajan tasalla
      if (r.laji === "tiedosto") { m.hashes[key] = m.hashes[key] || rh; if (!m.tiedot) m.tiedot = {}; m.tiedot[r.id] = r.data; return; }   // kuvan tiedot kirjoitetaan kerran
      const lh = local[key] ? hash(stable(local[key])) : (m.hashes[key] ? "DEL" : null);
      const paikallinenMuutos = lh !== null && lh !== m.hashes[key];
      if (kesken && key === "havainto:" + kesken) return;    // haetaan seuraavalla kerralla
      // Molemmat muuttuneet: pilvessä jo oleva versio jää voimaan (kaikilla sama lopputulos).
      // Havainnossa oma, korvautuva versio jää talteen havaintoon (ristiriita), joten mitään ei häviä.
      let oma = null;
      if (paikallinenMuutos && lh !== rh) {
        ristiriidat.push(key);
        if (r.laji === "havainto" && local[key] && !r.deleted) {
          const L = local[key];
          oma = { aika: Date.now(), tekija: (me && (me.nimi || me.email)) || "", sanelu: L.sanelu || "", tulkinta: L.tulkinta || "", tulos: L.tulos || null, menetelma: L.menetelma || null, kentat: L.kentat || {}, sijainti: L.sijainti || null };
        }
      }
      applyRow(k, havainnot, r.laji, r.id, r.data, r.deleted);
      m.hashes[key] = rh; muuttui = true;
      if (oma) { const h = havainnot.find((x) => x.id === r.id); if (h) { h.ristiriita = oma; h.updated = Date.now(); } }
    });
    if (muuttui) {
      if (open) S.havainnot.sort((a, b) => (a.created || 0) - (b.created || 0));
      await DB.put("kohteet", k);
      for (const h of havainnot) await DB.put("havainnot", h);
      const ids = new Set(havainnot.map((h) => h.id));
      for (const h of await DB.byKohde("havainnot", kid)) if (!ids.has(h.id)) await DB.del("havainnot", h.id);
    }
    // Kohteen kansio kirjastossa: nimetään kerran luettavaksi (näkyy toimistolla SharePointissa)
    if (!k.kansio) { k.kansio = turvallinen(k.nimi) + "_" + String(k.id).slice(-6); await DB.put("kohteet", k); }
    local = toRows(k, havainnot, tied);

    // 2) Kuvat ja muut tiedostot: lähetetään puuttuvat (kerran)
    for (const f of tied) {
      if (m.files[f.id] || !f.blob) continue;
      await P().lahetaTiedosto(kid, k.kansio, tiedostonimi(f), f.blob, f.type || f.blob.type);
      m.files[f.id] = true;
      await saveMeta(m);
    }

    // 3) Lähetys: muuttuneet ja poistetut rivit
    const up = [];
    Object.entries(local).forEach(([key, data]) => {
      const h = hash(stable(data));
      if (key.startsWith("tiedosto:") && m.hashes[key]) return;      // kuvan tiedot lähetetään vain kerran
      if (m.hashes[key] !== h) up.push({ key, h, row: { laji: key.split(":")[0], id: key.slice(key.indexOf(":") + 1), data, deleted: false } });
    });
    Object.keys(m.hashes).forEach((key) => {
      if (!local[key] && m.hashes[key] !== "DEL" && !key.startsWith("tiedosto:")) up.push({ key, h: "DEL", row: { laji: key.split(":")[0], id: key.slice(key.indexOf(":") + 1), data: {}, deleted: true } });
    });
    // Kohderivi ensin (pilven kohdelista), sitten muut 50 kerrallaan; edistyminen talteen välillä
    up.sort((a, b) => (a.key.startsWith("kohde:") ? -1 : b.key.startsWith("kohde:") ? 1 : 0));
    for (let i = 0; i < up.length; i += 50) {
      const part = up.slice(i, i + 50);
      await P().tallennaRivit(kid, part.map((x) => x.row), k.kansio);
      part.forEach((x) => { m.hashes[x.key] = x.h; });
      await saveMeta(m);
    }
    m.cursor = maxAika; m.viimeksi = Date.now();
    await saveMeta(m);
    return { haettu: remote.length, lahetetty: up.length, ristiriidat, muuttui };
  }

  /* Lähettämättömät muutokset (näytetään tilarivillä) */
  async function jonossa(kid) {
    const k = S.kohde && S.kohde.id === kid ? S.kohde : await DB.get("kohteet", kid);
    if (!k) return 0;
    const m = await meta(kid);
    const hv = S.kohde && S.kohde.id === kid ? S.havainnot : await DB.byKohde("havainnot", kid);
    const tied = await DB.byKohde("tiedostot", kid);
    const rows = toRows(k, hv, tied);
    let n = Object.entries(rows).filter(([key, d]) => !(key.startsWith("tiedosto:") && m.hashes[key]) && m.hashes[key] !== hash(stable(d))).length;
    n += Object.keys(m.hashes).filter((key) => !rows[key] && m.hashes[key] !== "DEL" && !key.startsWith("tiedosto:")).length;
    n += tied.filter((f) => !m.files[f.id]).length;
    return n;
  }

  /* ---------- Ajastus ---------- */
  let timer = null, pending = false;
  async function run(reason) {
    if (!Cloud.enabled || !Cloud.kirjautunut) { state.tila = Cloud.enabled ? "kirjaudu" : "pois"; emit(); return; }
    if (state.kaynnissa) { pending = true; return; }
    if (!navigator.onLine) { state.tila = "offline"; state.jono = S.kohde && S.kohde.pilvi ? await jonossa(S.kohde.id) : 0; emit(); return; }
    state.kaynnissa = true; state.tila = "kaynnissa"; emit();
    try {
      const kohteet = (await DB.all("kohteet")).filter((k) => k.pilvi);
      // Avoin kohde ensin
      kohteet.sort((a, b) => (S.kohde && a.id === S.kohde.id ? -1 : S.kohde && b.id === S.kohde.id ? 1 : 0));
      for (const k of kohteet) {
        const r = await syncKohde(k.id, { kesken: Sync.kesken });
        if (r && r.ristiriidat.length) Sync.viimeRistiriidat = r.ristiriidat;
        if (r && r.ristiriidat.length && S.kohde && S.kohde.id === k.id) UI.toast("Toinen tutkija muokkasi samaa tietoa (" + r.ristiriidat.length + "). Pilvessä ollut versio jäi voimaan; havainnon oma versiosi on tallessa havaintokortilla.", 5500);
        if (r && r.muuttui && S.kohde && S.kohde.id === k.id) Sync.paivitaNakyma();
      }
      state.tila = "ok"; state.aika = Date.now(); state.viesti = "";
      state.jono = S.kohde && S.kohde.pilvi ? await jonossa(S.kohde.id) : 0;
    } catch (e) {
      console.warn("Synkronointi", e);
      const auth = e.status === 401 || e.code === "kirjaudu" || /token|not authorized/i.test(String(e.message || e));
      const oikeus = e.status === 403 || e.code === "asetus";
      state.tila = auth ? "kirjaudu" : "virhe";
      state.viesti = auth ? "Kirjaudu uudelleen, niin muutokset siirtyvät pilveen." : oikeus ? "Ei pääsyä Kirjuri-sivustolle (" + (e.message || e.status) + "). Ota yhteys ylläpitoon." : "Synkronointi epäonnistui. Yritetään uudelleen.";
      state.jono = S.kohde && S.kohde.pilvi ? await jonossa(S.kohde.id).catch(() => 0) : 0;
    } finally {
      state.kaynnissa = false; emit();
      if (pending) { pending = false; setTimeout(() => run("jono"), 500); }
    }
  }
  const soon = UI.debounce(() => run("muutos"), 2500);

  function start() {
    if (!Cloud.enabled) return;
    window.addEventListener("online", () => run("online"));
    window.addEventListener("offline", () => { state.tila = "offline"; emit(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) run("näkyvä"); });
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) run("ajastus"); }, 30000);
    Cloud.onChange(() => run("kirjautuminen"));
    run("käynnistys");
  }

  /* ---------- Pilven kohteet ---------- */
  async function pilviKohteet() {
    if (!Cloud.kirjautunut || !navigator.onLine) return [];
    return P().kohteet();
  }
  /* Kohde pilvestä laitteelle (toisen tutkijan aloittama) */
  async function hae(kid, nimi) {
    let k = await DB.get("kohteet", kid);
    if (!k) {
      k = Model.newKohde({ nimi: nimi || "" });
      k.id = kid; k.pilvi = true;
      await DB.put("kohteet", k);
      await saveMeta({ id: "sync:" + kid, hashes: {}, cursor: null, files: {} });
    }
    await syncKohde(kid);
    return kid;
  }
  /* Laitteella aloitettu kohde pilveen */
  async function siirraPilveen(k) {
    k.pilvi = true;
    await Model.saveKohde();
    await run("siirto");
  }

  /* Kuva pilvestä, jos sitä ei ole laitteella (toisen tutkijan ottama) */
  async function haeTiedosto(kid, fid) {
    if (!Cloud.kirjautunut || !navigator.onLine) return null;
    const k = await DB.get("kohteet", kid);
    const m = await meta(kid);
    const info = (m.tiedot && m.tiedot[fid]) || {};
    const blob = await P().haeTiedosto(kid, k && k.kansio, tiedostonimi({ id: fid, type: info.type || "image/jpeg" }));
    if (!blob) return null;
    const f = Object.assign({ id: fid, kohdeId: kid, blob, type: info.type || blob.type, created: info.created || Date.now() }, { kind: info.kind || undefined, havaintoId: info.havaintoId || undefined, seuranta: info.seuranta || undefined });
    await DB.put("tiedostot", f);
    m.files[fid] = true; await saveMeta(m);
    return f;
  }

  /* Laitteen tiedot pois: uloskirjautuminen tai vanha, synkronoitu kohde */
  async function siivoa(kaikki) {
    const pv = (window.KS_CONFIG && KS_CONFIG.laitteellaPaivia) || 14;
    const raja = Date.now() - pv * 86400000;
    const poistettu = [];
    for (const k of (await DB.all("kohteet")).filter((x) => x.pilvi)) {
      if (S.kohde && S.kohde.id === k.id) continue;
      const vanha = (k.avattu || k.updated || 0) < raja;
      if (!kaikki && !vanha) continue;
      if (await jonossa(k.id)) continue;               // lähettämättömiä muutoksia: ei poisteta
      await DB.deleteKohde(k.id);
      await DB.del("asetukset", "sync:" + k.id);
      poistettu.push(k.nimi);
    }
    return poistettu;
  }

  const Sync = {
    start, run, soon, syncKohde, jonossa, pilviKohteet, hae, siirraPilveen, haeTiedosto, siivoa,
    state, onChange(f) { listeners.push(f); },
    kesken: null,
    paivitaNakyma() {},
    _test: { toRows, applyRow, stable, hash, async diff(kid) {
      const k = await DB.get("kohteet", kid), m = await meta(kid);
      const rows = toRows(k, await DB.byKohde("havainnot", kid), await DB.byKohde("tiedostot", kid));
      return Object.keys(rows).filter((key) => m.hashes[key] !== hash(stable(rows[key]))).map((key) => [key, JSON.stringify(rows[key]).slice(0, 300)]);
    } }
  };
  window.Sync = Sync;
})();
