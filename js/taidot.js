/* =========================================================================
   taidot.js – Kirjurin taidot: käyttäjän omat toimintatavat ilman koodimuutoksia

   Taito on pelkkää tietoa (JSON), ei ohjelmakoodia. Se tallentuu laitteelle
   (käyttäjäkohtainen, ei kohdekohtainen) ja vaikuttaa vain sovelluksen omien
   rakennuspalikoiden kautta:

     milloin     menetelmät (tyhjä = kaikki), kuntotarkastus (AKK), kuntoarvio
     oletukset   [{ m, k, v }]   tyhjä kenttä täytetään (m = menetelmä, valinnainen)
     kysy        [{ m, k }]      Raporttia varten vielä -listalle, vaikka kenttä ei ole pakollinen
     alaKysy     [{ m, k }]      ei kysytä (k myös "tulos", "kohta", "tila")
     muista      teksti          Muista-rivi kamerassa ja kirjauksessa
     lyhenteet   [{ sana, tarkoittaa }]   sanelussa ja tunnistuksessa
     komennot    [{ lause, toiminto }]    puhekomento sanelun lopussa tai yksinään;
                 toiminto: kunnossa | seuraava | kumoa | yleiskuva | tulos:ok | tulos:poikkeama | menetelma:<id>
     raportille  teksti          ohje raportin laatijalle (AI-vienti, LUE_MINUT)

   Muoto: { format: "kirjuri-taito", versio: 1, id, nimi, kuvaus, paalla, lahde, … }
   lahde: oma | claude | opittu | tiimi | sovellus.  Uudempi versio kuin FORMAT_VERSIO hylätään.

   Lisäksi: Omat opit (sovellus ehdottaa, tutkija hyväksyy) ja käyttömittarit
   (vain lukuja, ei sisältöä) kehityksen seurantaan.
   ========================================================================= */
(function () {
  "use strict";
  const FORMAT = "kirjuri-taito", FORMAT_VERSIO = 1;
  const AVAIN = "taito:", OMAT = "omat-opit", PERUS = "peruskomennot";
  const TOIMINNOT = ["kunnossa", "seuraava", "kumoa", "yleiskuva", "tulos:ok", "tulos:poikkeama"];
  let taidot = [];          // välimuisti (synkroninen käyttö kytkennöissä)
  let tila = { ehdotukset: [], hylatyt: [], valinnat: {}, eiTiedossa: {}, lyhenne: {}, kaytto: {} };
  let mittarit = {};
  const kuukausi = () => new Date().toISOString().slice(0, 7);
  const norm = (s) => String(s || "").toLowerCase().replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  const uid = () => (window.DB ? DB.uid("t_") : "t_" + Date.now().toString(36));

  /* ---------- Tallennus ---------- */
  async function lataa() {
    const kaikki = (await DB.all("asetukset")) || [];
    taidot = kaikki.filter((x) => String(x.id).indexOf(AVAIN) === 0).map((x) => x.taito).filter(Boolean);
    const t = kaikki.find((x) => x.id === "taidot-tila"); if (t) tila = Object.assign(tila, t.tila);
    const m = kaikki.find((x) => x.id === "taidot-mittarit"); if (m) mittarit = m.data || {};
    if (!taidot.some((x) => x.id === PERUS)) await tallenna(perusKomennot(), true);
    if (!taidot.some((x) => x.id === OMAT)) await tallenna(tyhja({ id: OMAT, nimi: "Omat opit", kuvaus: "Sovelluksen ehdottamat ja hyväksymäsi pienet opit. Voit siirtää ne nimettyyn taitoon.", lahde: "opittu" }), true);
    return taidot;
  }
  const tallennaTila = () => DB.put("asetukset", { id: "taidot-tila", tila });
  const tallennaMittarit = () => DB.put("asetukset", { id: "taidot-mittarit", data: mittarit });
  async function tallenna(t, eiHistoriaa) {
    t = siisti(t);
    const vanha = taidot.find((x) => x.id === t.id);
    if (vanha && !eiHistoriaa) {
      const { historia, ...ilman } = vanha;
      t.historia = [{ aika: Date.now(), data: ilman }].concat(vanha.historia || []).slice(0, 10);
    } else if (vanha) t.historia = vanha.historia || [];
    t.muokattu = Date.now();
    taidot = taidot.filter((x) => x.id !== t.id).concat(t);
    await DB.put("asetukset", { id: AVAIN + t.id, taito: t });
    return t;
  }
  async function poista(id) { taidot = taidot.filter((x) => x.id !== id); await DB.del("asetukset", AVAIN + id); }

  function tyhja(o) {
    return Object.assign({ format: FORMAT, versio: FORMAT_VERSIO, id: uid(), nimi: "", kuvaus: "", paalla: true, lahde: "oma",
      milloin: { menetelmat: [], akk: false, kuntoarvio: false }, oletukset: [], kysy: [], alaKysy: [], muista: "", lyhenteet: [], komennot: [], raportille: "",
      luotu: Date.now(), muokattu: Date.now(), historia: [] }, o || {});
  }
  function siisti(t) {
    const x = tyhja(t);
    x.milloin = Object.assign({ menetelmat: [], akk: false, kuntoarvio: false }, t.milloin || {});
    ["oletukset", "kysy", "alaKysy", "lyhenteet", "komennot"].forEach((k) => { x[k] = Array.isArray(t[k]) ? t[k] : []; });
    return x;
  }
  function perusKomennot() {
    return tyhja({ id: PERUS, nimi: "Peruskomennot", lahde: "sovellus", kuvaus: "Puhekomennot tarkistuslistoihin. Muokattavissa.",
      komennot: [{ lause: "märkätila kunnossa", toiminto: "kunnossa" }, { lause: "märkätilat kunnossa", toiminto: "kunnossa" }, { lause: "muut kunnossa", toiminto: "kunnossa" }, { lause: "muut kohdat kunnossa", toiminto: "kunnossa" }] });
  }

  /* ---------- Tuonti ja vienti (teksti, tiedosto, jako) ---------- */
  function jasenna(teksti) {
    let s = String(teksti || "").trim();
    const aita = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (aita) s = aita[1].trim();
    const a = s.indexOf("{"), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    const alkuL = s.indexOf("[");
    const alku = alkuL >= 0 && (alkuL < a || a < 0) ? alkuL : a;
    if (alku < 0 || b < alku) throw new Error("Tekstistä ei löytynyt taitoa.");
    const o = JSON.parse(s.slice(alku, b + 1));
    const lista = (Array.isArray(o) ? o : [o]).filter((x) => x && x.format === FORMAT);
    if (!lista.length) throw new Error("Teksti ei ole Kirjurin taito (format: \"kirjuri-taito\").");
    lista.forEach((x) => { if ((x.versio || 1) > FORMAT_VERSIO) throw new Error("Taito \"" + (x.nimi || "") + "\" on tehty uudemmalle Kirjurille. Päivitä sovellus."); });
    return lista.map((x) => nimetAvaimiksi(siisti(Object.assign({}, x, { lahde: x.lahde && x.lahde !== "sovellus" ? x.lahde : "claude" }))));
  }
  /* Kenttä saa olla taidossa myös nimenä ("Mittaustapa"): muutetaan tunnukseksi (tapa) */
  function nimetAvaimiksi(t) {
    const ms = (x) => x.m ? [x.m] : ((t.milloin.menetelmat || []).length ? t.milloin.menetelmat : M.MENETELMAT.map((m) => m.id));
    const n = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, "").trim();
    const korj = (x) => {
      if (["tulos", "kohta", "tila"].includes(x.k)) return x;
      for (const id of ms(x)) {
        const f = (M.menetelma(id).kentat || []).find((y) => y.k === x.k) || (M.menetelma(id).kentat || []).find((y) => n(y.l) === n(x.k));
        if (f) return Object.assign({}, x, { k: f.k });
      }
      return x;
    };
    t.oletukset = t.oletukset.map(korj); t.kysy = t.kysy.map(korj); t.alaKysy = t.alaKysy.map(korj);
    t.milloin.menetelmat = (t.milloin.menetelmat || []).map((id) => { const m = M.MENETELMAT.find((y) => y.id === id || n(y.nimi) === n(id)); return m ? m.id : id; });
    return t;
  }
  function tarkista(t) {
    const v = [];
    const mOk = (id) => !id || M.MENETELMAT.some((m) => m.id === id);
    (t.milloin.menetelmat || []).forEach((id) => { if (!mOk(id)) v.push("Tuntematon menetelmä: " + id); });
    t.oletukset.concat(t.kysy, t.alaKysy).forEach((x) => { if (!mOk(x.m)) v.push("Tuntematon menetelmä: " + x.m); });
    const tunnettu = (x) => ["tulos", "kohta", "tila"].includes(x.k) || (x.m ? [x.m] : ((t.milloin.menetelmat || []).length ? t.milloin.menetelmat : M.MENETELMAT.map((m) => m.id))).some((id) => mOk(id) && (M.menetelma(id).kentat || []).some((f) => f.k === x.k));
    t.oletukset.concat(t.kysy, t.alaKysy).forEach((x) => { if (mOk(x.m) && !tunnettu(x)) v.push("Tuntematon kenttä: " + x.k); });
    t.komennot.forEach((c) => { if (!TOIMINNOT.includes(c.toiminto) && !/^menetelma:/.test(c.toiminto)) v.push("Tuntematon toiminto: " + c.toiminto); });
    return v;
  }
  function vie(t) { const { historia, ...x } = t; return JSON.stringify(x, null, 1); }
  function kuvaus(t) {
    const m = (id) => (M.MENETELMAT.find((x) => x.id === id) || {}).nimi || id;
    const kl = (x) => { const ms = x.m ? [x.m] : (t.milloin.menetelmat || []); let f = null; ms.some((id) => (f = (M.menetelma(id).kentat || []).find((y) => y.k === x.k)));  return (f ? f.l : ({ tulos: "tulos", kohta: "suunnitelman kohta", tila: "tila" }[x.k] || x.k)) + (x.m && !t.milloin.menetelmat.length ? " (" + m(x.m) + ")" : ""); };
    const r = [];
    r.push("Milloin: " + ([].concat(t.milloin.menetelmat.map(m), t.milloin.akk ? ["kuntotarkastus"] : [], t.milloin.kuntoarvio ? ["kuntoarvio"] : []).join(", ") || "kaikki kirjaukset"));
    if (t.oletukset.length) r.push("Täyttää: " + t.oletukset.map((x) => kl(x) + " = " + x.v).join("; "));
    if (t.kysy.length) r.push("Kysyy: " + t.kysy.map(kl).join(", "));
    if (t.alaKysy.length) r.push("Ei kysy: " + t.alaKysy.map(kl).join(", "));
    if (t.muista) r.push("Muista: " + t.muista);
    if (t.lyhenteet.length) r.push("Lyhenteet: " + t.lyhenteet.map((x) => x.sana + " = " + x.tarkoittaa).join("; "));
    if (t.komennot.length) r.push("Puhekomennot: " + t.komennot.map((x) => "”" + x.lause + "” → " + x.toiminto).join("; "));
    if (t.raportille) r.push("Raportille: " + t.raportille);
    return r;
  }

  /* ---------- Soveltaminen ---------- */
  const aktiiviset = () => taidot.filter((t) => t.paalla);
  function koskee(t, h) {
    const mi = t.milloin || {};
    if (mi.akk && !(window.AKK && AKK.aktiivinen())) return false;
    if (mi.kuntoarvio && !(window.Kuntoarvio && Kuntoarvio.aktiivinen())) return false;
    if ((mi.menetelmat || []).length && !(h && mi.menetelmat.includes(h.menetelma))) return false;
    return true;
  }
  const sopii = (x, h) => !x.m || x.m === h.menetelma;
  function kaytetty(t) { tila.kaytto[t.id] = (tila.kaytto[t.id] || 0) + 1; tallennaTilaPian(); }
  let tilaAjastin = null;
  function tallennaTilaPian() { clearTimeout(tilaAjastin); tilaAjastin = setTimeout(tallennaTila, 1500); }

  function oletukset(h) {
    let n = 0;
    if (!h || !h.menetelma) return 0;
    aktiiviset().filter((t) => koskee(t, h)).forEach((t) => {
      let kayt = false;
      t.oletukset.filter((x) => sopii(x, h)).forEach((x) => {
        const f = M.kentat(h).find((y) => y.k === x.k);
        if (!f || f.t === "table") return;
        if (h.kentat[x.k] != null && h.kentat[x.k] !== "") return;
        h.kentat[x.k] = x.v; h.auto = h.auto || {}; h.auto["k:" + x.k] = "taito"; h.taidot = Array.from(new Set((h.taidot || []).concat(t.id))); n++; kayt = true;
      });
      if (kayt) kaytetty(t);
    });
    return n;
  }
  function aukot(h, out, lisaa) {
    const akt = aktiiviset().filter((t) => koskee(t, h));
    const pois = akt.flatMap((t) => t.alaKysy.filter((x) => sopii(x, h)).map((x) => x.k));
    for (let i = out.length - 1; i >= 0; i--) {
      const k = out[i].key.replace(/^k:/, "").split(":")[0];
      if (pois.includes(k) || pois.includes(out[i].key)) out.splice(i, 1);
    }
    akt.forEach((t) => t.kysy.filter((x) => sopii(x, h)).forEach((x) => {
      const f = M.kentat(h).find((y) => y.k === x.k);
      if (!f || out.some((o) => o.key === "k:" + f.k)) return;
      const tyhjaa = f.t === "table" ? !M.rivit(h, f).length : h.kentat[f.k] == null || String(h.kentat[f.k]).trim() === "";
      if (tyhjaa) lisaa("k:" + f.k, f.l.toLowerCase(), f.t === "table" ? "taulukko" : "kentta", f);
    }));
  }
  function muista(h) {
    if (!h) return "";
    return aktiiviset().filter((t) => koskee(t, h) && t.muista).map((t) => t.muista.trim()).join(" ");
  }
  function laajenna(teksti) {
    let s = String(teksti || "");
    aktiiviset().forEach((t) => t.lyhenteet.forEach((x) => {
      if (!x.sana || !x.tarkoittaa) return;
      const re = new RegExp("(^|[^\\p{L}\\p{N}])" + x.sana.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^\\p{L}\\p{N}])", "giu");
      s = s.replace(re, (m0, a) => a + x.tarkoittaa);
    }));
    return s;
  }
  /* Puhekomento: koko sanelu tai sen loppu. Teksti säilyy kirjauksessa (dokumentoi esim. "muut kunnossa"). */
  function komento(teksti) {
    const t = norm(teksti);
    if (!t) return null;
    let paras = null;
    aktiiviset().forEach((tt) => tt.komennot.forEach((c) => {
      const l = norm(c.lause);
      if (l && (t === l || t.endsWith(" " + l)) && (!paras || l.length > paras.l.length)) paras = { l, toiminto: c.toiminto, taito: tt, koko: t === l };
    }));
    if (paras) kaytetty(paras.taito);
    return paras;
  }
  /* Tarkistuslistan tyhjät kohdat kunnossa-arvolla (sama kuin Muut kohdat kunnossa -painike) */
  function kunnossa(h) {
    const vis = M.kentat(h).filter((f) => f.okv && (h.kentat[f.k] == null || h.kentat[f.k] === ""));
    vis.forEach((f) => { h.kentat[f.k] = f.okv; if (window.Auto) Auto.manual(h, "k:" + f.k); });
    const dev = M.kentat(h).some((f) => f.okv && h.kentat[f.k] && h.kentat[f.k] !== f.okv);
    if (!h.tulos) { h.tulos = dev ? "poikkeama" : "ok"; h.auto = h.auto || {}; h.auto.tulos = "sanelu"; }
    return vis.length;
  }
  /* Raportin laatijalle (AI-vienti): kohteen menetelmiin liittyvät taidot */
  function raportille(menetelmat) {
    return aktiiviset().filter((t) => t.raportille && (!(t.milloin.menetelmat || []).length || t.milloin.menetelmat.some((m) => menetelmat.includes(m))))
      .map((t) => ({ taito: t.nimi, ohje: t.raportille.trim() }));
  }

  /* ---------- Omat opit: havainnot käytöstä → ehdotukset (tutkija hyväksyy) ---------- */
  const OHITA = new Set(["tunnus", "nro", "kuvaus", "huom", "lisatiedot"]);
  function ehdota(e) {
    const avain = e.tyyppi + "|" + JSON.stringify(e.data);
    if (tila.hylatyt.includes(avain) || tila.ehdotukset.some((x) => x.avain === avain)) return;
    const om = taidot.find((x) => x.id === OMAT);
    if (om && e.tyyppi === "oletus" && om.oletukset.some((x) => x.m === e.data.m && x.k === e.data.k)) return;
    if (om && e.tyyppi === "alaKysy" && om.alaKysy.some((x) => x.m === e.data.m && x.k === e.data.k)) return;
    if (om && e.tyyppi === "lyhenne" && om.lyhenteet.some((x) => norm(x.sana) === norm(e.data.sana))) return;
    tila.ehdotukset.push(Object.assign({ id: uid(), avain, aika: Date.now() }, e));
    tallennaTila();
    if (window.UI) UI.toast("Kirjuri oppi: " + e.teksti + " (Taidot)", 3500);
  }
  function havaitse(h) {
    if (!h || !h.menetelma) return;
    const m = M.menetelma(h.menetelma);
    // 1) Käyttäjän toistuvat valinnat → oletus
    M.kentat(h).forEach((f) => {
      if (f.t === "table" || f.t === "textarea" || f.t === "date" || f.t === "calc" || f.mittaus || OHITA.has(f.k)) return;
      const v = h.kentat[f.k];
      if (v == null || String(v).trim() === "" || (h.auto && h.auto["k:" + f.k])) return;
      const k = h.menetelma + "." + f.k;
      const l = (tila.valinnat[k] || []).filter((x) => x[0] !== h.id).concat([[h.id, String(v)]]).slice(-6);
      tila.valinnat[k] = l;
      const viim = l.slice(-4);
      if (viim.length === 4 && viim.every((x) => x[1] === viim[0][1]))
        ehdota({ tyyppi: "oletus", data: { m: h.menetelma, k: f.k, v: viim[0][1] }, teksti: m.nimi + ": " + f.l + " on yleensä ”" + viim[0][1] + "”. Täytetäänkö valmiiksi?" });
    });
    // 2) Toistuvat Ei tiedossa → älä kysy
    (h.eiTiedossa || []).forEach((key) => {
      const k = key.replace(/^k:/, "").split(":")[0];
      const a = h.menetelma + "." + k;
      const l = (tila.eiTiedossa[a] || []).filter((x) => x !== h.id).concat(h.id).slice(-6);
      tila.eiTiedossa[a] = l;
      const f = M.kentat(h).find((y) => y.k === k);
      const nimi = f ? f.l : ({ tulos: "tulos", kohta: "suunnitelman kohta", tila: "tila" }[k] || k);
      if (l.length >= 3) ehdota({ tyyppi: "alaKysy", data: { m: h.menetelma, k }, teksti: m.nimi + ": ”" + nimi + "” on usein ei tiedossa. Lakataanko kysymästä?" });
    });
    // käyttömittari: kirjauksen kesto (ensimmäinen havaitseminen)
    if (!tila.kaytto["h:" + h.id]) {
      tila.kaytto["h:" + h.id] = 1;
      const kesto = Math.min(30 * 60000, Math.max(0, Date.now() - (h.created || Date.now())));
      mittari("kirjauksia", 1); mittari("kirjausaikaMs", kesto);
      const vanhat = Object.keys(tila.kaytto).filter((x) => x.indexOf("h:") === 0);
      if (vanhat.length > 400) vanhat.slice(0, vanhat.length - 400).forEach((x) => delete tila.kaytto[x]);
    }
    tallennaTilaPian();
  }
  /* Menetelmä korjattu käsin: tuntematon lyhenne sanelun alussa → ehdotus lyhenteeksi */
  function korjattuMenetelma(teksti, id) {
    const sana = (String(teksti || "").trim().split(/\s+/)[0] || "").replace(/[^\p{L}\p{N}-]/gu, "");
    if (!id || sana.length < 2 || sana.length > 4 || /\d/.test(sana)) return;
    if (window.Komennot && Komennot.menetelma(sana)) return;
    const a = norm(sana) + ">" + id;
    tila.lyhenne[a] = (tila.lyhenne[a] || 0) + 1;
    const mm = M.menetelma(id);
    if (tila.lyhenne[a] >= 2) ehdota({ tyyppi: "lyhenne", data: { sana: norm(sana), tarkoittaa: (mm.sanasto && mm.sanasto[0]) || mm.nimi }, teksti: "”" + sana + "” tarkoittaa menetelmää " + mm.nimi + ". Tunnistetaanko jatkossa?" });
    tallennaTilaPian();
  }
  async function hyvaksy(id) {
    const e = tila.ehdotukset.find((x) => x.id === id);
    if (!e) return;
    const om = taidot.find((x) => x.id === OMAT) || tyhja({ id: OMAT, nimi: "Omat opit", lahde: "opittu" });
    const uusi = JSON.parse(JSON.stringify(om));
    if (e.tyyppi === "oletus") uusi.oletukset = uusi.oletukset.filter((x) => !(x.m === e.data.m && x.k === e.data.k)).concat(e.data);
    if (e.tyyppi === "alaKysy") uusi.alaKysy = uusi.alaKysy.concat(e.data);
    if (e.tyyppi === "lyhenne") uusi.lyhenteet = uusi.lyhenteet.concat(e.data);
    tila.ehdotukset = tila.ehdotukset.filter((x) => x.id !== id);
    await tallenna(uusi); await tallennaTila();
  }
  async function hylkaa(id) {
    const e = tila.ehdotukset.find((x) => x.id === id);
    if (e) tila.hylatyt.push(e.avain);
    tila.ehdotukset = tila.ehdotukset.filter((x) => x.id !== id);
    await tallennaTila();
  }
  /* Omista opeista nimetty taito: saman menetelmän opit (vähintään 3) */
  function kokoamisehdotukset() {
    const om = taidot.find((x) => x.id === OMAT);
    if (!om) return [];
    const lask = {};
    om.oletukset.concat(om.alaKysy).forEach((x) => { if (x.m) lask[x.m] = (lask[x.m] || 0) + 1; });
    return Object.keys(lask).filter((m) => lask[m] >= 3);
  }
  async function kokoa(mid) {
    const om = JSON.parse(JSON.stringify(taidot.find((x) => x.id === OMAT)));
    const t = tyhja({ nimi: M.menetelma(mid).nimi + ": omat tavat", lahde: "opittu", milloin: { menetelmat: [mid], akk: false, kuntoarvio: false },
      oletukset: om.oletukset.filter((x) => x.m === mid), alaKysy: om.alaKysy.filter((x) => x.m === mid) });
    om.oletukset = om.oletukset.filter((x) => x.m !== mid); om.alaKysy = om.alaKysy.filter((x) => x.m !== mid);
    await tallenna(t); await tallenna(om);
    return t;
  }

  /* ---------- Käyttömittarit (vain lukuja) ---------- */
  function mittari(nimi, n) {
    const kk = kuukausi();
    mittarit[kk] = mittarit[kk] || {};
    mittarit[kk][nimi] = (mittarit[kk][nimi] || 0) + (n == null ? 1 : n);
    clearTimeout(mittari._t); mittari._t = setTimeout(tallennaMittarit, 1500);
  }
  function yhteenveto() {
    const kk = Object.keys(mittarit).sort();
    const r = ["Kirjuri – käyttömittarit (vain lukuja, ei kirjausten sisältöä). Versio " + (window.APP_VERSION || "") + "."];
    kk.forEach((k) => {
      const m = mittarit[k], n = m.kirjauksia || 0;
      r.push(k + ": kirjauksia " + n +
        (n ? ", keskim. kesto " + Math.round((m.kirjausaikaMs || 0) / n / 1000) + " s" : "") +
        ", korjauksia " + (m.korjauksia || 0) + (n ? " (" + ((m.korjauksia || 0) / n).toFixed(2).replace(".", ",") + "/kirjaus)" : "") +
        ", kumottuja kuvia " + (m.kumoa || 0) + ", Ei tiedossa " + (m.eiTiedossa || 0) +
        ", puuttuvia tallennettaessa " + (m.puuttuvia || 0) + ", puhekomentoja " + (m.komentoja || 0));
    });
    r.push("Taidot käytössä: " + aktiiviset().length + ". Hyväksyttyjä opittuja: " + (() => { const om = taidot.find((x) => x.id === OMAT); return om ? om.oletukset.length + om.alaKysy.length + om.lyhenteet.length : 0; })() + ".");
    return r.join("\n");
  }

  /* ---------- Kytkennät sovellukseen (ei muutoksia moduulien sisälle) ---------- */
  function kytke() {
    if (window.M && !M._taidot) {
      M._taidot = true;
      const tm = M.taytaMuisti, vh = M.vihje;
      M.taytaMuisti = function (h, Model) { return tm.call(M, h, Model) + oletukset(h); };
      M.vihje = function (h) { return [vh.call(M, h), muista(h)].filter(Boolean).join(" "); };
    }
    if (window.Auto && !Auto._taidot) {
      Auto._taidot = true;
      const ap = Auto.apply, man = Auto.manual;
      Auto.apply = async function (h) {
        const alk = h.sanelu, laaj = laajenna(alk);
        if (laaj === alk) return ap(h);
        h.sanelu = laaj;
        try { return await ap(h); } finally { if (h.sanelu === laaj) h.sanelu = alk; }
      };
      // Korjaus = tutkija muuttaa automaattisesti täytettyä tietoa
      Auto.manual = function (h, key) { if (h && h.auto && h.auto[key]) mittari("korjauksia", 1); return man(h, key); };
    }
    if (window.Komennot && !Komennot._taidot) {
      Komennot._taidot = true;
      const km = Komennot.menetelma, kt = Komennot.tulkitse;
      Komennot.menetelma = (t) => km(laajenna(t));
      Komennot.tulkitse = (t) => {
        const o = kt(t);
        const c = !o.kumoa && !o.yleiskuva ? komento(o.teksti) : null;
        if (c) {
          mittari("komentoja", 1);
          if (c.toiminto === "seuraava") o.seuraava = true;
          else if (c.toiminto === "kumoa" && c.koko) { o.kumoa = true; o.teksti = ""; }
          else if (c.toiminto === "yleiskuva" && c.koko) { o.yleiskuva = true; o.teksti = ""; }
          else o.toiminto = c.toiminto;
        }
        return o;
      };
    }
  }

  window.Taidot = {
    FORMAT, FORMAT_VERSIO, TOIMINNOT, OMAT, PERUS,
    lataa, tallenna, poista, tyhja, jasenna, tarkista, vie, kuvaus, kytke,
    lista: () => taidot.slice().sort((a, b) => (a.id === OMAT ? -1 : b.id === OMAT ? 1 : 0) || String(a.nimi).localeCompare(String(b.nimi), "fi")),
    hae: (id) => taidot.find((x) => x.id === id) || null,
    oletukset, aukot, muista, laajenna, komento, kunnossa, raportille,
    havaitse, korjattuMenetelma, ehdotukset: () => tila.ehdotukset.slice(), hyvaksy, hylkaa, kokoamisehdotukset, kokoa,
    kaytto: (id) => tila.kaytto[id] || 0, mittari, mittarit: () => JSON.parse(JSON.stringify(mittarit)), yhteenveto,
    _tila: () => tila
  };
})();
