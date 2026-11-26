/* =========================================================================
   app.js – tila, malli, reititys ja perusnäkymät (kohteet, kohde, tiedot,
   tutkimussuunnitelma). Muut näkymät: capture.js, card.js, plan.js,
   check.js. Vienti: export.js.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet, promptSheet, pvm, nro } = UI;

  /* ---------------- Tila ---------------- */
  const S = {
    kohde: null,
    havainnot: [],
    urls: new Map(),   // tiedoston id -> objectURL
    cleanup: null      // näkymän purkufunktio (kamera, sanelu)
  };

  const app = () => document.getElementById("app");

  /* ---------------- Malli ---------------- */
  const Model = {
    newKohde(o) {
      return {
        id: DB.uid("k_"), created: Date.now(), updated: Date.now(),
        nimi: o.nimi || "", osoite: "", projektinro: "", tutkija: o.tutkija || "",
        pvm: new Date().toISOString().slice(0, 10),
        kerrokset: [], tilat: [], suunnitelma: [],
        muisti: {}, viimeisin: null, seuraavaNro: 1,
        luoja: (window.Cloud && Cloud.user() && Cloud.user().id) || null,   // kohdenäkymä: omat kohteet ensin
        pilvi: !!(window.Cloud && Cloud.kirjautunut)      // kirjautuneena kohde synkronoidaan pilveen
      };
    },
    newHavainto(kohde, preset) {
      preset = preset || {};
      const last = kohde.viimeisin || {};
      return {
        id: DB.uid("h_"), kohdeId: kohde.id, nro: null, created: Date.now(), updated: Date.now(),
        kuvat: [], aanitteet: [], sanelu: "", tulkinta: "",
        tulos: null, menetelma: preset.menetelma || null, kentat: {}, vahvistettu: false,
        sijainti: {
          kerrosId: preset.kerrosId || last.kerrosId || null,
          tilaId: preset.tilaId || last.tilaId || null,
          rakenneosa: preset.rakenneosa != null ? preset.rakenneosa : (last.rakenneosa || null),
          piste: null
        },
        suunnitelmaId: preset.suunnitelmaId || null,
        kaOsa: preset.kaOsa || null,
        akkOsa: preset.akkOsa || null
      };
    },
    async saveKohde() {
      if (!S.kohde) return;                 // näkymä vaihtui ennen tallennusta (kohde suljettu)
      S.kohde.updated = Date.now();
      await DB.put("kohteet", S.kohde);
      if (S.kohde && S.kohde.pilvi && window.Sync) Sync.soon();
    },
    async saveHavainto(h) {
      if (!S.kohde || S.kohde.id !== h.kohdeId) { h.updated = Date.now(); await DB.put("havainnot", h); return; }   // kohde jo suljettu: tallennus laitteelle
      if (!h.nro) {
        const u = S.kohde.pilvi && window.Cloud ? Cloud.user() : null;
        if (u && u.sarja) {
          // Pilvikohteessa tutkijakohtainen kenttäsarja (TM-05): kaksi offline-tutkijaa ei saa samaa numeroa.
          // Raportille (ZIP) havainnot numeroidaan uudelleen juoksevasti H01, H02 …
          h.sarja = u.sarja; h.tekija = u.id; h.tekijaNimi = u.nimi || u.email;
          h.nro = S.havainnot.filter((x) => x.sarja === u.sarja).reduce((mx, x) => Math.max(mx, x.nro || 0), 0) + 1;
        } else {
          h.nro = S.kohde.seuraavaNro || 1;
          S.kohde.seuraavaNro = h.nro + 1;
          await Model.saveKohde();
        }
      }
      h.updated = Date.now();
      // Mittausarvot ovat vahvistettuja, kun yhtään kameralukua ei ole kesken, epäonnistunut
      // tai tarkistamatta. Itse kirjoitetut arvot ovat tutkijan omia, eikä niitä tarvitse kuitata.
      if (window.Meter) {
        const open = M.menetelma(h.menetelma).kentat.filter((f) => f.t === "table")
          .some((f) => M.rivit(h, f).some((r) => ["reading", "flagged", "error", "interrupted"].includes(Meter.rowState(r))));
        h.vahvistettu = !open;
      }
      await DB.put("havainnot", h);
      const i = S.havainnot.findIndex((x) => x.id === h.id);
      if (i >= 0) S.havainnot[i] = h; else S.havainnot.push(h);
      // Tilaseuranta: sanelussa sanottu tila on tutkijan oma valinta (uusi havainto, ei vanhan muokkaus)
      if (window.Paikannus && h.auto && h.auto.tila === "sanelu" && h.sijainti.tilaId && h.kiinnitetty !== h.sijainti.tilaId && Date.now() - (h.created || 0) < 10 * 60000) {
        h.kiinnitetty = h.sijainti.tilaId; Paikannus.kiinnita(h.sijainti.tilaId);
      }
      // Pohjakuvasta tunnistettu tila vahvistuu, kun se on havainnon sijaintina (tutkija on paikalla ja näkee nimen)
      const tt = h.sijainti && h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
      if (tt && window.Plan && Plan.confirmRoom(tt, "havainto")) await Model.saveKohde();
      S.havainnot.sort((a, b) => (a.created || 0) - (b.created || 0));
      if (S.kohde && S.kohde.pilvi && window.Sync) Sync.soon();
    },
    async deleteHavainto(h) {
      if (S.kohde && S.kohde.pilvi && window.Sync) setTimeout(() => Sync.soon(), 0);
      // Piirrettyjen kuvien alkuperäiset (h.piirrokset[id].orig) poistetaan samalla
      const alkup = Object.values(h.piirrokset || {}).map((p) => p && p.orig).filter(Boolean);
      for (const f of h.kuvat.concat(h.aanitteet || [], alkup)) await DB.del("tiedostot", f);
      for (const v of Object.values(h.kentat || {})) {
        if (!Array.isArray(v)) continue;
        for (const r of v) if (r && r._ocr) { if (r._ocr.kuva) await DB.del("tiedostot", r._ocr.kuva); if (r._ocr.rajaus) await DB.del("tiedostot", r._ocr.rajaus); }
      }
      await DB.del("havainnot", h.id);
      S.havainnot = S.havainnot.filter((x) => x.id !== h.id);
    },
    /* Muistetut arvot (esim. mittalaite): ensin tämä kohde, sitten tämä laite (edelliset kohteet). */
    muistiGet(key) {
      const v = S.kohde && S.kohde.muisti ? S.kohde.muisti[key] : null;
      if (v) return v;
      try { return localStorage.getItem("ks_muisti_" + key) || null; } catch (e) { return null; }
    },
    muistiSet(key, val) {
      if (S.kohde) { S.kohde.muisti[key] = val; Model.saveKohde(); }
      try { if (val) localStorage.setItem("ks_muisti_" + key, val); } catch (e) { /* ohita */ }
    },
    kerros(id) { return S.kohde.kerrokset.find((k) => k.id === id) || null; },
    tila(id) { return S.kohde.tilat.find((t) => t.id === id) || null; },
    kohta(id) { return S.kohde.suunnitelma.find((p) => p.id === id) || null; },
    havainto(id) { return S.havainnot.find((h) => h.id === id) || null; },

    /* Tilan nimi: tunnus ja nimi. Lähtötietojen paikkanimi "Tila 118" jätetään pois (toistaisi numeron). */
    tilaNimi(t) {
      if (!t) return "";
      const n = String(t.nimi || "").trim(), tu = String(t.tunnus || "").trim();
      const turha = !n || n.toLowerCase() === tu.toLowerCase() || n.toLowerCase() === ("tila " + tu).toLowerCase();
      return [tu, turha ? "" : n].filter(Boolean).join(" ") || n;
    },

    sijaintiTeksti(s) {
      if (!s) return "";
      const k = Model.kerros(s.kerrosId), t = Model.tila(s.tilaId);
      const useita = S.kohde && S.kohde.kerrokset.length > 1;      // yksi kerros: kerrosta ei toisteta
      return [useita && k && k.nimi, Model.tilaNimi(t), s.rakenneosa].filter(Boolean).join(" · ");
    },

    tilaStatus(t) {
      const obs = S.havainnot.filter((h) => h.sijainti && h.sijainti.tilaId === t.id);
      if (obs.some((h) => h.tulos === "poikkeama")) return "poikkeama";
      if (obs.length || (t.merkinta && t.merkinta.tila === "tarkastettu")) return "tarkastettu";
      if (t.merkinta && t.merkinta.tila === "ei_paasya") return "ei_paasya";
      return "ei_tutkittu";
    },

    kohtaTehty(p) {
      // Olosuhdeseurannassa tehty = kirjatut mittalaitteet
      if (M.menetelma(p.menetelma).akk) { const e = window.AKK ? AKK.edistyminen() : { n: 0, all: 1 }; return e.n >= e.all ? (p.maara || 1) : 0; }
      if (M.menetelma(p.menetelma).kuntoarvio) { const e = window.Kuntoarvio && S.kohde.kuntoarvio ? Kuntoarvio.edistyminen() : { n: 0, all: 1 }; return e.n >= e.all ? (p.maara || 1) : 0; }
      // Usea seurantakohta (esim. paine-erot ja T/RH/CO2): laitteet jaetaan kohdille järjestyksessä
      if (M.menetelma(p.menetelma).seuranta) {
        let n = (S.kohde.seuranta || []).filter((x) => x.nro).length;
        const all = S.kohde.suunnitelma.filter((q) => M.menetelma(q.menetelma).seuranta && !q.pois);
        if (p.pois || all.length < 2) return n;
        for (const q of all) { const t = Math.min(n, q.maara || 1); if (q === p) return t; n -= t; }
        return 0;
      }
      let linked = S.havainnot.filter((h) => h.suunnitelmaId === p.id);
      // Rakenneavauksen kohtaan liitetyt näytteet lasketaan erikseen (kohtaNaytteet)
      if (p.menetelma === "avaus") linked = linked.filter((h) => h.menetelma !== "nayte");
      // Märkätilakartoitus lasketaan asunnoittain (yhdessä asunnossa useita märkätiloja)
      if (M.menetelma(p.menetelma).laskenta === "asunto") return new Set(linked.map((h) => String(h.kentat.asunto || h.id).toUpperCase())).size;
      return linked.length;
    },
    kohtaValmis(p) { return !!p.pois || (Model.kohtaTehty(p) >= (p.maara || 1) && Model.kohtaNaytteet(p) >= (p.naytteet || 0)); },
    /* Rakenneavaus + näytteet samassa kohdassa: "rakenneavaus 4 kpl, näyte jokaisesta" */
    kohtaNaytteet(p) { return p.naytteet ? S.havainnot.filter((h) => h.suunnitelmaId === p.id && h.menetelma === "nayte").length : 0; },
    kohtaSopii(p, mid) { return !!p && (p.menetelma === mid || (mid === "nayte" && p.menetelma === "avaus" && (p.naytteet || 0) > 0)); },
    kohtaMaaraTeksti(p) {
      return Model.kohtaTehty(p) + "/" + (p.maara || 1) + (p.naytteet ? " · näytteet " + Model.kohtaNaytteet(p) + "/" + p.naytteet : "");
    },

    kohtaNimi(p) {
      const m = M.menetelma(p.menetelma);
      return m.nimi + (p.kuvaus ? ": " + p.kuvaus : "");
    },

    edistyminen() {
      const all = S.kohde.suunnitelma.length;
      const done = S.kohde.suunnitelma.filter(Model.kohtaValmis).length;
      return { all, done };
    },

    url(fileId) {
      if (!fileId) return "";
      return S.urls.get(fileId) || "";
    },
    async ensureUrls(ids) {
      const need = ids.filter((id) => id && !S.urls.has(id));
      for (const id of need) {
        let f = await DB.get("tiedostot", id);
        // Toisen tutkijan kuva: haetaan pilvestä ja tallennetaan laitteelle
        if (!f && S.kohde && S.kohde.pilvi && window.Sync) f = await Sync.haeTiedosto(S.kohde.id, id).catch(() => null);
        if (f && f.blob) S.urls.set(id, URL.createObjectURL(f.blob));
      }
    },
    resetUrls() {
      S.urls.forEach((u) => URL.revokeObjectURL(u));
      S.urls.clear();
    }
  };

  async function loadKohde(id) {
    if (S.kohde && S.kohde.id === id) return true;
    const k = await DB.get("kohteet", id);
    if (!k) return false;
    Model.resetUrls();
    S.kohde = k;
    S.havainnot = (await DB.byKohde("havainnot", id)).sort((a, b) => (a.created || 0) - (b.created || 0));
    // Vanhat näytetyyppien nimet ja merkkiainekokeen tulos uusiin (versio 41)
    for (const h of S.havainnot) if (M.muunnaVanha(h)) await DB.put("havainnot", h);
    if (window.Paikannus) Paikannus.kohdeAuki(S.kohde);
    if (k.pilvi) { k.avattu = Date.now(); DB.put("kohteet", k); }      // vain laitteella: siivous vanhoista kohteista
    return true;
  }

  /* ---------------- Yhteiset osat ---------------- */
  /* Paluupainikkeessa lukee, minne pääsee (K3.3): ← Kohteet, ← Kohde, ← Kirjaus */
  function paluuTeksti(b) {
    if (!b || b === "#/" || b === "#") return "Kohteet";
    if (/^#\/k\/[^/?]+$/.test(b)) return "Kohde";
    if (/^#\/k\/[^/]+\/h\/[^/?]+$/.test(b)) return "Kirjaus";
    const nim = { kuntoarvio: "Kuntoarvio", akk: "Kuntotarkastus", seuranta: "Seuranta", lahtotiedot: "Lähtötiedot", pohja: "Pohjakuva", lahto: "Viimeistely", havainnot: "Kirjaukset", asetukset: "Asetukset", menetelmat: "Menetelmät", taidot: "Taidot" };
    const m = b.match(/^#\/(?:k\/[^/]+\/)?([a-z]+)/);
    return (m && nim[m[1]]) || "Takaisin";
  }
  function topbar(o) {
    return '<header class="topbar">' +
      (o.back ? '<a class="tb-back tb-back-t" href="' + o.back + '">' + icon("back") + "<span>" + esc(o.backLabel || paluuTeksti(o.back)) + "</span></a>"
              : '<img class="tb-logo" src="pbm-logo.png" alt="">') +
      '<div class="tb-title"><h1>' + esc(o.title) + "</h1>" + (o.sub ? '<span class="sub">' + esc(o.sub) + "</span>" : "") + "</div>" +
      (o.right || "") + "</header>";
  }

  /* Alapalkki (Teemu 25.11.2026): Muistio – Kamera – Sanelu. Sanelu: pidä pohjassa (sanelu.js). */
  function bottomnav(active) {
    const k = S.kohde.id;
    const kam = S.kamera || "#/k/" + k + "/kuvaus";
    return '<nav class="kalapalkki">' +
      '<a class="ka-btn" href="#/k/' + k + '/muistio"' + (active === "muistio" ? ' aria-current="page"' : "") + ">" + icon("edit") + "<span>Muistio</span></a>" +
      '<a class="ka-btn ka-kamera" href="' + kam + '">' + icon("cam") + "<span>Kamera</span></a>" +
      '<button class="ka-btn ka-sanelu" type="button" data-sanelu aria-label="Pidä pohjassa ja sanele">' + icon("mic") + "<span>Sanelu</span></button>" +
      "</nav>";
  }

  /* Kameran osoite alapalkkiin (esim. pohjakuvasta: valittu kerros). Erillistä kelluvaa painiketta ei enää ole. */
  function fab(href) { S.kamera = href; return ""; }

  function pinClass(h) {
    return h.tulos === "poikkeama" ? "p-note" : h.tulos === "ok" ? "p-ok" : "p-n";
  }

  /* Varmuuskopion tila: onko kohteessa muutoksia viimeisen ZIP-viennin jälkeen */
  function vientiTila(k, hav) {
    const muutos = Math.max(k.updated || 0, ...(hav || []).map((h) => h.updated || 0));
    if (k.pilvi) return { msg: "" };      // pilvikohde: tiedot ovat pilvessä (synkronoinnin tila kohteessa)
    const tyhja = !(hav || []).length && !(k.seuranta || []).length && !(k.yleiskuvat || []).length;
    if (tyhja) return { msg: "" };
    if (!k.viety) return { msg: "Ei vielä viety: tiedot vain tällä laitteella", cls: "warn" };
    if (muutos > k.viety + 3000) return { msg: "Muutoksia viennin " + UI.pvm(k.viety) + " jälkeen: vie uusi paketti", cls: "warn" };
    return { msg: "Viety " + UI.pvm(k.viety), cls: "ok" };
  }

  /* Oma kohde: tutkijan luoma tai kirjaama (pilvi), tai kohteen Tutkija-kentässä on tämän laitteen tutkijan nimi.
     Toisen tutkijan kohteet (esim. tiimiin lisätty) näkyvät listan lopussa. */
  function minaTunnisteet() {
    const u = window.Cloud && Cloud.user ? Cloud.user() : null;
    let nimi = ""; try { nimi = localStorage.getItem("ks_tutkija") || ""; } catch (e) { /* ohita */ }
    const nimet = [nimi, u && u.nimi, u && u.email && u.email.split("@")[0]].filter(Boolean).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2);
    return { id: u && u.id, nimet };
  }
  function onOma(k, hav) {
    const me = minaTunnisteet();
    if (!me.id && !me.nimet.length) return true;
    if (me.id && (k.luoja === me.id || (hav || []).some((h) => h.tekija === me.id))) return true;
    const t = String(k.tutkija || "").toLowerCase();
    if (!t) return !k.pilvi;               // oma laitekohde ilman tutkijan nimeä
    return me.nimet.some((n) => t.includes(n) || n.includes(t));
  }

  /* ---------------- Näkymä: kohteet ---------------- */
  async function viewHome() {
    S.kohde = null;
    if (window.Paikannus) Paikannus.pysayta();
    Model.resetUrls();
    const kohteet = (await DB.all("kohteet")).sort((a, b) => b.updated - a.updated);
    const est = await DB.usage();
    const omat = [], muut = [];
    const rivi = (k, hav) => {
      const st = vientiTila(k, hav);
      return '<a class="row" href="#/k/' + k.id + '" data-haku="' + esc([k.nimi, k.osoite, k.projektinro, k.tutkija].filter(Boolean).join(" ").toLowerCase()) + '" style="text-decoration:none;color:inherit"><div class="grow"><div class="t">' + esc(k.nimi || "Nimetön kohde") +
        '</div><div class="s">' + esc([k.osoite, k.pvm ? UI.pvm(k.pvm) : "", hav.length + " havaintoa", k.pilvi ? "pilvessä" : ""].filter(Boolean).join(" · ")) + "</div>" +
        (st.msg ? '<div class="s vienti ' + st.cls + '">' + esc(st.msg) + "</div>" : "") + "</div>" + icon("back", "flip") + "</a>";
    };
    for (const k of kohteet) {
      const hav = await DB.byKohde("havainnot", k.id);
      (onOma(k, hav) ? omat : muut).push(rivi(k, hav));
    }
    // Ilman tunnistetta (ei tutkijan nimeä eikä kirjautumista) kaikki kohteet ovat yhdessä listassa
    if (!omat.length) { omat.push(...muut); muut.length = 0; }
    const haku = kohteet.length > 6 ? '<label class="field" style="margin:0 0 10px"><input type="search" data-haku-input placeholder="Hae kohdetta nimellä, osoitteella tai numerolla"></label>' : "";
    const rows = omat.join(""), muutRows = muut.join("");
    // Etusivu = Omat kohteet (K3.3). Tili, tietosuoja ja työkalut ovat Asetuksissa (rattaan takana ja sivun lopussa).
    app().innerHTML = topbar({ title: "Omat kohteet", sub: "Kirjuri", right: '<a class="tb-asetus" href="#/asetukset" aria-label="Asetukset">' + icon("gear") + "</a>" }) +
      '<main class="view no-nav">' +
      (Dictation.supported() || (Dictation.tila && Dictation.tila().MODE === "laite") ? "" : '<div class="alert info">' + icon("alert") + "<div>Tämä selain ei tue puheentunnistusta. Sanelut tallennetaan äänitteinä, ja tekstin voi kirjoittaa tai sanella näppäimistön mikrofonilla.</div></div>") +
      '<button class="btn btn-primary btn-block uk-iso" data-act="newKohde">' + icon("plus") + "Uusi kohde</button>" +
      (kohteet.length ? haku + '<section class="card"><div class="card-h"><h2>' + (muut.length ? "Omat kohteet" : "Kohteet") + '</h2><span class="meta">' + omat.length + "</span></div>" + rows + "</section>" +
          (muut.length ? '<details class="card vocab" data-muut><summary class="card-h"><h2>Muiden kohteet</h2><span class="meta">' + muut.length + "</span></summary>" + muutRows + "</details>" : "")
        : '<section class="card"><div class="card-h"><h2>Näin pääset alkuun</h2></div><div class="card-b"><ol class="start-steps">' +
          "<li><b>Uusi kohde ja lähtötiedot.</b> Tuo Clauden lähtötietopaketti, tarjous, pohjakuvat tai asiakirjat. Voit myös aloittaa ilman.</li>" +
          "<li><b>Pohjakuva.</b> Tilat tunnistetaan pohjakuvasta, ja havainnot voi merkitä siihen.</li>" +
          "<li><b>Kuva + sanelu.</b> Ota kuva, pidä mikrofonia pohjassa ja kerro havainto. <i>Seuraava</i> tallentaa ja aloittaa uuden.</li>" +
          "<li><b>Viimeistele kohde.</b> Ennen lähtöä sovellus näyttää, mitä puuttuu, ja vie aineiston ZIP-pakettina raportointiin.</li></ol></div></section>") +
      (window.Cloud && Cloud.enabled ? "<div data-pilvikohteet></div>" : "") +
      '<details class="card vocab"><summary class="card-h"><h2>Asetukset, tili ja työkalut</h2></summary><div class="card-b">' +
      (window.CloudUI ? CloudUI.accountHtml() : "") +
      '<a class="btn btn-block" href="#/asetukset">' + icon("edit") + "Asetukset</a>" +
      '<div style="height:10px"></div><a class="btn btn-block" href="#/taidot">' + icon("edit") + "Taidot ja opit" + (window.Taidot && Taidot.ehdotukset().length ? " (" + Taidot.ehdotukset().length + " uutta)" : "") + "</a>" +
      '<div style="height:10px"></div><a class="btn btn-block" href="#/menetelmat">' + icon("list") + "Menetelmät</a>" +
      '<div style="height:10px"></div><a class="btn btn-block" href="#/sanasto">' + icon("edit") + "Sanasto</a>" +
      '<div style="height:10px"></div><button class="btn btn-block" data-act="restore">' + icon("upload") + "Palauta varmuuskopio tai tuo kenttälomakkeesta (ZIP)</button>" +
      '<p class="hint">' + (window.Cloud && Cloud.enabled ? "Kirjaukset tallentuvat ensin tähän puhelimeen ja siirtyvät organisaation pilveen (vain kohteen tiimi näkee ne). ZIP-paketti viedään raportointia varten." : "Tiedot tallentuvat vain tälle laitteelle. Vie kohde ZIP-pakettina raportointia ja varmuuskopiota varten.") +
      (est && est.usage ? " Käytössä " + (est.usage / 1048576).toFixed(0) + " Mt." : "") + "</p>" + '<div data-puhe></div>' + "</div></details>" +
      '<p class="hint" style="text-align:center;margin-top:18px">Versio ' + esc(window.APP_VERSION) + '</p>' +
      "</main>";
    const hk = app().querySelector("[data-haku-input]");
    if (hk) hk.oninput = () => {
      const q = hk.value.trim().toLowerCase();
      app().querySelectorAll("a.row[data-haku]").forEach((a) => { a.style.display = !q || a.dataset.haku.includes(q) ? "" : "none"; });
      const d = app().querySelector("[data-muut]"); if (d && q) d.open = true;
    };
    if (window.CloudUI) CloudUI.bindHome(app());
    if (window.Dictation && Dictation.puheKortti) Dictation.puheKortti(app().querySelector("[data-puhe]"));
  }

  /* ---------------- Näkymä: kohde ---------------- */
  /* Seuraavaksi tehtävä suunnitelman kohta: edellisen havainnon kohta, jos kesken; muuten ensimmäinen kesken oleva. */
  function seuraavaKohta() {
    const k = S.kohde;
    const kesken = k.suunnitelma.filter((p) => !Model.kohtaValmis(p));
    if (!kesken.length) return null;
    const ed = S.havainnot.slice().sort((a, b) => b.updated - a.updated)[0];
    const edP = ed && kesken.find((p) => p.id === ed.suunnitelmaId || (!ed.suunnitelmaId && p.menetelma === ed.menetelma));
    return edP || kesken[0];
  }
  const kohtaHref = (p) => {
    const m = M.menetelma(p.menetelma), k = S.kohde.id;
    if (m.kuntoarvio) return "#/k/" + k + "/kuntoarvio";
    if (m.akk) return "#/k/" + k + "/akk";
    if (m.seuranta) return "#/k/" + k + "/seuranta";
    // Avaukset tehty, näytteitä puuttuu: suoraan näytteenottoon
    if (p.naytteet && Model.kohtaTehty(p) >= (p.maara || 1)) return "#/k/" + k + "/kuvaus?kohta=" + p.id + "&menetelma=nayte";
    return "#/k/" + k + "/kuvaus?kohta=" + p.id;
  };

  /* Kirjaus kohdesivun listassa: kuva, otsikko, sanelun alku, puutteet */
  function kirjausRivi(h) {
    const k = S.kohde, m = h.menetelma ? M.menetelma(h.menetelma) : null;
    const t = h.sijainti && h.sijainti.tilaId ? Model.tila(h.sijainti.tilaId) : null;
    const tun = h.kentat && h.kentat.tunnus;
    const u = Model.url(h.kuvat[0]);
    const puut = Check.havaintoPuutteet(h);
    const ots = nro(h) + " " + (m ? m.nimi : "Menetelmä puuttuu") + (tun ? " – " + tun : "") + (t ? " / " + Model.tilaNimi(t) : "");
    const ala = [h.sanelu ? (h.sanelu.length > 80 ? h.sanelu.slice(0, 80) + "…" : h.sanelu) : (h.aanitteet && h.aanitteet.length ? "Sanelu äänitteenä" : ""), h.kuvat.length ? h.kuvat.length + " kuva" + (h.kuvat.length > 1 ? "a" : "") : "ei kuvia"].filter(Boolean).join(" · ");
    return '<a class="kr' + (puut.length ? " puute" : "") + '" href="#/k/' + k.id + "/h/" + h.id + '"><span class="kr-kuva">' + (u ? '<img src="' + u + '" alt="">' : icon("mic")) + "</span>" +
      '<span class="kr-teksti"><span class="kr-ots">' + esc(ots) + '</span><span class="kr-ala">' + esc(ala) + "</span>" +
      (puut.length ? '<span class="kr-puute">Raporttia varten vielä: ' + esc(puut.slice(0, 3).join(", ")) + "</span>" : "") + "</span></a>";
  }

  /* Lisää toimintoja -rivit (harvemmin tarvittavat) */
  function lisaaRivit(k) {
    const docs = KaLahto.siirra(k).length;
    const ykN = (k.yleiskuvat || []).length, seurN = (k.seuranta || []).length;
    const kaPlan = k.suunnitelma.some((p) => M.menetelma(p.menetelma).kuntoarvio), seurPlan = k.suunnitelma.some((p) => M.menetelma(p.menetelma).seuranta);
    const lisaRivi = (href, ic, t, sub) => '<a class="row" href="' + href + '" style="text-decoration:none;color:inherit">' + icon(ic) + '<div class="grow"><div class="t">' + esc(t) + '</div>' +
      (sub ? '<div class="s">' + esc(sub) + "</div>" : "") + "</div>" + icon("back", "flip") + "</a>";
    return lisaRivi("#/k/" + k.id + "/havainnot", "list", "Kaikki kirjaukset", S.havainnot.length + " kirjausta · haku ja tiloittain") +
      (S.havainnot.length && k.suunnitelma.length ? lisaRivi("#/k/" + k.id + "/kalusto", "check", "Kalusto mukaan", (() => { const e = Kalusto.laske(); return e.n + " / " + e.all + " pakattu"; })()) : "") +
      (window.Paikannus && !Paikannus.saatavilla(k) ? '<div class="row pk-ei">' + icon("pin") + '<div class="grow"><div class="t">Seuranta: ei käytettävissä</div><div class="s">' +
        esc(Paikannus.puute(k) || "") + "</div></div></div>" : "") +
      (window.Paikannus && Paikannus.saatavilla(k) ? (() => {
        const t = Paikannus.tilanne(), o = Paikannus.osumat();
        return '<button class="row" data-act="paikannus" style="width:100%;text-align:left;background:none;border:0">' + icon("pin") + '<div class="grow"><div class="t">Seuranta: ' + (k.paikannus ? "päällä" : "pois") + '</div><div class="s">' +
          esc(k.paikannus ? (t.virhe ? t.virhe : !t.on ? "Napauta käynnistääksesi anturit" : t.alussa ? "Alkaa ensimmäisestä tilavalinnasta" : "Ehdottaa tiloja kirjauksessa") +
            (o.n ? " · osumat " + (o.top1 || 0) + "/" + o.n + " ensimmäisenä, " + (o.top3 || 0) + "/" + o.n + " kolmen joukossa" : "")
            : "Ehdottaa kirjauksessa todennäköisimmän tilan askelten ja kompassin perusteella. Näyttö pysyy päällä; taskussa näyttö pimenee.") + "</div></div>" +
          '<span class="chip" aria-pressed="' + !!k.paikannus + '" style="pointer-events:none">' + (k.paikannus ? "Päällä" : "Pois") + "</span></button>" +
          (Paikannus.lokiPituus() ? '<button class="row" data-act="paikannusLoki" style="width:100%;text-align:left;background:none;border:0">' + icon("download") +
            '<div class="grow"><div class="t">Vie seurannan loki</div><div class="s">Tiedosto seurannan säätöä varten · ' + Paikannus.lokiPituus() + " riviä · ei kuvia, sanelua eikä nimiä</div></div></button>" : "");
      })() : "") +
      lisaRivi("#/k/" + k.id + "/yleiskuvat", "image", "Yleiskuvat", ykN ? ykN + " kuvaa" : "Julkisivut ja tilat ilman havaintoa") +
      (seurPlan ? "" : lisaRivi("#/k/" + k.id + "/seuranta", "pin", "Olosuhdeseuranta", seurN ? seurN + " mittalaitetta" : "Mittalaitteiden sijainnit")) +
      (kaPlan ? "" : lisaRivi("#/k/" + k.id + "/kuntoarvio", "list", "Kuntoarvio", "Rakennusosat, kuntoluokat ja käyttöiät")) +
      (k.suunnitelma.some((p) => M.menetelma(p.menetelma).akk) ? "" : lisaRivi("#/k/" + k.id + "/akk", "list", "Asuntokaupan kuntotarkastus", window.AKK && k.akk ? (() => { const e = AKK.edistyminen(); return e.n + " / " + e.all + " osiota käyty"; })() : "Osiot, poikkeamat ja rajaukset")) +
      lisaRivi("#/k/" + k.id + "/suunnitelma", "edit", "Muokkaa suunnitelmaa", "") +
      lisaRivi("#/k/" + k.id + "/lahtotiedot", "download", "Lähtötiedot", docs ? docs + " tiedostoa" : "Clauden paketti, tarjous, pohjakuvat, asiakirjat");
  }

  /* ---------------- Näkymä: kohdesivu ----------------
     Kenttälomakkeen selkeys: yksi sivu ylhäältä alas (kohde, seuraavaksi, suunnitelma ja sen
     kirjaukset, muistiinpanot, pohjakuva ja liitteet, Viimeistele, lisää toimintoja).
     Alapalkissa Muistio – Kamera – Sanelu. */
  async function viewKohde() {
    const k = S.kohde;
    const pr = Model.edistyminen();
    await Model.ensureUrls(S.havainnot.map((h) => h.kuvat[0]).filter(Boolean));
    const lt = k.lahtoTila || {}, docs = KaLahto.siirra(k).length;
    const eiLahtotietoja = !Object.keys(lt).length && !docs && !k.suunnitelma.length && !S.havainnot.length;
    const tutkija = (window.Cloud && Cloud.user() && Cloud.user().nimi) || k.tutkija || "";

    // Seuraavaksi-kortti
    const nx = seuraavaKohta();
    let seur = "";
    if (eiLahtotietoja) {
      seur = '<a class="row u-lt" href="#/k/' + k.id + '/lahtotiedot">' + icon("download") + '<div class="grow"><div class="t">Lähtötiedot</div><div class="s">Clauden paketti, tarjous, pohjakuvat tai asiakirjat. Voit aloittaa kirjaukset myös ilman.</div></div>' + icon("back", "flip") + "</a>";
    } else if (!k.suunnitelma.length && Katselmus.seuraavaHtml()) {
      seur = Katselmus.seuraavaHtml();
    } else if (nx) {
      const m = M.menetelma(nx.menetelma), tehty = Model.kohtaTehty(nx), maara = nx.maara || 1;
      const st = window.Paikannus && Paikannus.ehdotukset ? Paikannus.ehdotukset(1)[0] : null;
      seur = '<a class="next-card" href="' + kohtaHref(nx) + '"><div class="nc-k">Seuraavaksi suunnitelmasta</div><div class="nc-t">' + esc(m.nimi) + "</div>" +
        '<div class="nc-s">' + esc([tehty + " / " + maara + " tehty", nx.kuvaus, st ? "Olet: " + Model.tilaNimi(st.tila) : ""].filter(Boolean).join(" · ")) + "</div></a>";
    }

    // Suunnitelma: kohdat ja niiden kirjaukset (avattavat)
    const auki = S.uAuki || null;
    const kohdanKirjaukset = (p) => S.havainnot.filter((h) => h.suunnitelmaId === p.id);
    let plan = "";
    for (const p of k.suunnitelma) {
      const valmis = Model.kohtaValmis(p), m = M.menetelma(p.menetelma);
      const hs = kohdanKirjaukset(p);
      const puute = hs.filter((h) => Check.havaintoPuutteet(h).length).length;
      const tila = p.pois ? "pois" : puute ? "puute" : valmis ? "valmis" : nx && p.id === nx.id ? "nyt" : "kesken";
      const merkki = tila === "valmis" ? '<span class="pl-m ok">' + icon("check") + "</span>" : tila === "puute" ? '<span class="pl-m puute">!</span>' : tila === "pois" ? '<span class="pl-m pois">–</span>' : '<span class="pl-m ' + tila + '"></span>';
      const maaraTxt = m.kuntoarvio && window.Kuntoarvio && Kuntoarvio.aktiivinen() ? (() => { const e = Kuntoarvio.edistyminen(); return e.n + "/" + e.all; })()
        : m.akk && window.AKK && !p.pois ? (() => { const e = AKK.edistyminen(); return e.n + "/" + e.all; })() : p.pois ? "pois" : Model.kohtaTehty(p) + "/" + (p.maara || 1);
      const nayt = p.naytteet && !p.pois ? "näytteet " + Model.kohtaNaytteet(p) + "/" + p.naytteet : "";
      const ala = p.pois ? "Ei tehdä: " + p.pois.syy : puute ? "Raporttia varten vielä " + puute : [nx && p.id === nx.id ? "Seuraavaksi" : p.kuvaus || "", nayt].filter(Boolean).join(" · ");
      const onAuki = auki === p.id;
      plan += '<div class="pl-kohta' + (onAuki ? " auki" : "") + '"><button class="row pl-row ' + tila + '" data-act="uKohta" data-id="' + p.id + '">' + merkki +
        '<div class="grow"><div class="t">' + esc(m.nimi) + "</div>" + (ala ? '<div class="s">' + esc(ala) + "</div>" : "") + "</div>" +
        '<span class="count">' + esc(maaraTxt) + "</span>" + icon("back", onAuki ? "up" : "down") + "</button>" +
        (onAuki ? '<div class="pl-sis">' + hs.map(kirjausRivi).join("") +
          '<div class="pl-napit"><a class="btn btn-sm" href="' + kohtaHref(p) + '">' + icon(m.kuntoarvio || m.akk || m.seuranta ? "list" : "cam") + (m.kuntoarvio || m.akk || m.seuranta ? "Avaa" : "Kirjaus tähän") + "</a>" +
          '<button class="btn btn-sm" data-act="kohtaMenu" data-id="' + p.id + '">Toiminnot…</button></div></div>' : "") + "</div>";
    }
    const planIds = new Set(k.suunnitelma.map((p) => p.id));
    const muut = S.havainnot.filter((h) => !h.suunnitelmaId || !planIds.has(h.suunnitelmaId));
    const muutAuki = auki === "muut" || !k.suunnitelma.length;
    const muutHtml = muut.length ? '<div class="pl-kohta' + (muutAuki ? " auki" : "") + '">' +
      (k.suunnitelma.length ? '<button class="row pl-row" data-act="uKohta" data-id="muut"><span class="pl-m"></span><div class="grow"><div class="t">' + (k.suunnitelma.length ? "Suunnitelman ulkopuoliset" : "Kirjaukset") + "</div></div>" +
        '<span class="count">' + muut.length + "</span>" + icon("back", muutAuki ? "up" : "down") + "</button>" : "") +
      (muutAuki ? '<div class="pl-sis">' + muut.map(kirjausRivi).join("") + "</div>" : "") + "</div>" : "";

    const puuteN = S.havainnot.filter((h) => Check.havaintoPuutteet(h).length).length;
    const pros = pr.all ? Math.round(pr.done / pr.all * 100) : 0;
    const suunnitelma = k.suunnitelma.length
      ? '<section class="card u-suun"><div class="card-b"><div class="u-rivi"><h2 class="grow">Tutkimussuunnitelma</h2><span class="u-luku">' + pr.done + "/" + pr.all + "</span></div>" +
        '<div class="u-palkki"><span style="width:' + pros + '%"></span></div>' +
        '<div class="u-sub">' + pr.done + " tehty · " + (pr.all - pr.done) + " avoinna" + (puuteN ? " · raporttia varten vielä " + puuteN : "") + "</div></div>" +
        plan + muutHtml + "</section>"
      : (muut.length ? '<section class="card u-suun"><div class="card-b"><div class="u-rivi"><h2 class="grow">Kirjaukset</h2><span class="u-luku">' + muut.length + "</span></div></div>" + muutHtml + "</section>" : "");

    // Muistiinpanot
    const ns = (k.muistiinpanot || []).slice().sort((a, b) => b.luotu - a.luotu);
    const klo = (t) => { const d = new Date(t); return d.getHours() + "." + String(d.getMinutes()).padStart(2, "0"); };
    const muistio = ns.length ? '<section class="card"><div class="card-b"><div class="u-rivi"><h2 class="grow">Muistiinpanot</h2><span class="u-luku">' + ns.length + "</span></div>" +
      ns.slice(0, 3).map((n) => { const t = n.sijainti && n.sijainti.tilaId && Model.tila(n.sijainti.tilaId); return '<a class="u-muist" href="#/k/' + k.id + '/muistio"><span class="u-sub">' + esc(klo(n.luotu) + (t ? " · " + Model.tilaNimi(t) : " · yleinen")) + "</span><span>" + esc(n.teksti.length > 120 ? n.teksti.slice(0, 120) + "…" : n.teksti) + "</span></a>"; }).join("") +
      (ns.length > 3 ? '<a class="link" href="#/k/' + k.id + '/muistio">Kaikki ' + ns.length + "</a>" : "") + "</div></section>" : "";

    // Pohjakuva kerrosvälilehtineen (K3.3): huoneen napautus aloittaa kirjauksen siihen huoneeseen
    const pohjat = k.kerrokset.filter((e) => e.planId);
    if (!S.uKerros || !pohjat.some((e) => e.id === S.uKerros)) S.uKerros = pohjat[0] ? pohjat[0].id : null;
    const ker = S.uKerros && Model.kerros(S.uKerros);
    if (ker) await Model.ensureUrls([ker.planId]);
    const kerrosN = (e) => S.havainnot.filter((h) => h.sijainti && h.sijainti.kerrosId === e.id).length;
    const arvio = (window.Kuntoarvio && Kuntoarvio.aktiivinen()) || (window.AKK && AKK.aktiivinen());
    const pohja = '<section class="card u-pk"><div class="card-b"><h2 class="u-pk-ots">Pohjakuva</h2>' +
      (pohjat.length > 1 ? '<div class="u-tabs" role="tablist">' + pohjat.map((e) => { const n = kerrosN(e); return '<button class="u-tab" role="tab" data-act="uKerros" data-id="' + e.id + '" aria-selected="' + (e.id === S.uKerros) + '">' + esc(e.nimi) + (n ? " · " + n : "") + "</button>"; }).join("") + "</div>" : "") +
      (ker ? '<div class="plan-wrap u-plan" data-uplan><img src="' + Model.url(ker.planId) + '" alt="Pohjakuva ' + esc(ker.nimi) + '" draggable="false">' + (window.Plan ? Plan.pinsHtml(ker.id) : "") + "</div>" +
          '<p class="u-sub u-pk-vihje">' + (arvio ? "Napauta huonetta, jos havainto koskee tiettyä huonetta." : "Napauta huonetta, niin uusi kirjaus tulee siihen.") + "</p>" +
          '<div class="u-napit"><a class="btn btn-sm" href="#/k/' + k.id + "/pohja?kerros=" + ker.id + '">' + icon("plan") + "Avaa ja merkitse</a>" +
          '<button class="btn btn-sm" data-act="uPdf">' + icon("download") + "Vie PDF</button></div>"
        : '<div class="u-eipohjaa"><p class="u-sub">Ei pohjakuvaa. Pohjakuvaan voi merkitä, missä kirjaukset on tehty.</p><a class="btn btn-sm" href="#/k/' + k.id + '/pohja">' + icon("plan") + "Lisää pohjakuva</a></div>") +
      "</div></section>";

    // Kalustolista ennen ensimmäistä kirjausta (myöhemmin Lisää toimintoja -kohdassa)
    let kal = "";
    if (!S.havainnot.length && window.Kalusto) {
      const e = Kalusto.laske();
      if (e.all) kal = '<a class="row u-kal" href="#/k/' + k.id + '/kalusto">' + icon("check") + '<div class="grow"><div class="t">Mukaan kentälle</div><div class="s">Pakattu ' + e.n + " / " + e.all + (e.n >= e.all ? " ✓" : "") + "</div></div>" + icon("back", "flip") + "</a>";
    }

    const hu = k.huomiot || [];
    const ohje = window.Kuntoarvio && Kuntoarvio.aktiivinen() ? "Uusi havainto" : window.AKK && AKK.aktiivinen() ? "Uusi havainto" : "Uusi kirjaus";
    app().innerHTML = topbar({
      title: k.nimi || "Nimetön kohde", sub: [tutkija, k.pvm ? pvm(k.pvm) : ""].filter(Boolean).join(" · "), back: "#/",
      right: window.CloudUI ? CloudUI.pilleri(k) : ""
    }) +
      '<main class="view kohde-uusi">' + KaLahto.tilaHtml() +
      Raportit.riviHtml(k) +
      '<a class="u-paa" href="#/k/' + k.id + '/kuvaus"><span class="u-paa-ik">' + icon("cam") + '</span><span class="grow"><span class="u-paa-t">' + ohje + '</span><span class="u-paa-s">Ota kuva ja kerro, mitä näet</span></span></a>' +
      pohja + kal + seur +
      (hu.length ? (hu.length <= 2 ? '<div class="alert info">' + icon("alert") + "<div><b>Huomioitavaa:</b> " + hu.map((h) => esc(h.teksti)).join("<br>") + "</div></div>"
        : '<details class="alert info hu-taitto">' + '<summary>' + icon("alert") + "<div><b>Huomioitavaa (" + hu.length + "):</b> " + esc(hu[0].teksti) + ' <span class="hu-lisaa">Näytä kaikki</span></div></summary>' +
          '<div class="hu-muut">' + hu.slice(1).map((h) => esc(h.teksti)).join("<br>") + "</div></details>") : "") +
      Katselmus.korttiHtml() + Katselmus.aiemmatKorttiHtml() +
      suunnitelma + muistio +
      '<a class="u-viim" href="#/k/' + k.id + '/lahto"><div class="grow"><div class="t">Viimeistele ja tee raportti</div>' +
        '<div class="s">' + esc(puuteN ? "Raporttia varten vielä: " + puuteN + (puuteN === 1 ? " kirjaus" : " kirjausta") : S.havainnot.length ? "Raportointipaketti ja tarkistukset" : "Kun kirjaukset on tehty") + "</div></div>" + icon("back", "flip") + "</a>" +
      '<details class="card vocab"><summary class="card-h"><h2>Lisää toimintoja</h2><span class="meta">Kohteen tiedot, lähtötiedot, seuranta, kalusto …</span></summary><div class="card-b" style="padding-top:0">' +
        '<a class="row" href="#/k/' + k.id + '/tiedot" style="text-decoration:none;color:inherit">' + icon("edit") + '<div class="grow"><div class="t">Kohteen tiedot</div><div class="s">' + esc([k.osoite, k.projektinro].filter(Boolean).join(" · ") || "Nimi, osoite, projektinumero, vienti") + "</div></div>" + icon("back", "flip") + "</a>" +
        lisaaRivit(k) + "</div></details>" +
      "</main>" + bottomnav("kohde");
    const up = app().querySelector("[data-uplan]");
    if (up && ker) up.addEventListener("click", (e) => {
      const o = e.target.closest("[data-obs]");
      if (o) { location.hash = "#/k/" + k.id + "/h/" + o.dataset.obs; return; }
      const r = e.target.closest("[data-room]");
      let t = r ? Model.tila(r.dataset.room) : null;
      if (!t) { const b = up.getBoundingClientRect(); t = Plan.tilaPisteessa(ker.id, { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }); }
      if (t) location.hash = "#/k/" + k.id + "/kuvaus?tila=" + t.id + "&kerros=" + ker.id;
      else location.hash = "#/k/" + k.id + "/pohja?kerros=" + ker.id;
    });
    const kuuntele = () => { if (location.hash === "#/k/" + k.id) render(); };
    document.addEventListener("ks-lahto", kuuntele);
    S.cleanup = () => document.removeEventListener("ks-lahto", kuuntele);
  }

  /* ---------------- Näkymä: kaikki havainnot ----------------
     Haku (tunnus, tila, menetelmä, sanelu), ryhmittely tiloittain ja
     kamerapainike jokaisella rivillä: lisäkuvat aiempaan havaintoon. */
  let hvState = { q: "", f: "kaikki" };
  async function viewHavainnot() {
    const k = S.kohde;
    await Model.ensureUrls(S.havainnot.map((h) => h.kuvat[0]));
    const nMiss = S.havainnot.filter((h) => Check.havaintoPuutteet(h).length).length;
    app().innerHTML = topbar({ title: "Havainnot", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view"><div class="hv-tools"><label class="mp-search">' + icon("list") +
      '<input type="search" data-hq value="' + esc(hvState.q) + '" placeholder="Hae: H05, M3, keittiö, lattia…" aria-label="Hae havaintoja" autocomplete="off"></label></div>' +
      '<div class="hv-filter chips"><button class="chip" data-hf="kaikki">Kaikki ' + S.havainnot.length + '</button>' +
      '<button class="chip" data-hf="puute">Puutteelliset ' + nMiss + '</button><button class="chip" data-hf="tilat">Tiloittain</button>' +
      '<button class="chip" data-act="galleria">' + icon("image") + "Liitä kuvia galleriasta</button></div>" +
      '<section class="card"><div class="card-b" data-hlist></div></section></main>' +
      bottomnav("havainnot");
    const listEl = app().querySelector("[data-hlist]"), q = app().querySelector("[data-hq]");
    const paint = () => {
      app().querySelectorAll("[data-hf]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hf === hvState.f)));
      let list = S.havainnot.slice();
      if (hvState.f === "puute") list = list.filter((h) => Check.havaintoPuutteet(h).length);
      list = ObsList.filter(list, hvState.q);
      let html = "";
      if (hvState.f === "tilat") {
        const groups = new Map();
        list.forEach((h) => { const id = (h.sijainti && h.sijainti.tilaId) || ""; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(h); });
        const keys = Array.from(groups.keys()).sort((a, b) => (a ? Model.tilaNimi(Model.tila(a)) : "\uffff").localeCompare(b ? Model.tilaNimi(Model.tila(b)) : "\uffff", "fi", { numeric: true }));
        keys.forEach((id) => {
          const t = id && Model.tila(id);
          html += '<div class="ohead">' + esc(t ? Model.tilaNimi(t) : "Ei tilaa") + " · " + groups.get(id).length + "</div>";
          html += groups.get(id).map((h) => ObsList.rowHtml(h, { camera: true })).join("");
        });
      } else html = list.slice().reverse().map((h) => ObsList.rowHtml(h, { camera: true })).join("");
      listEl.innerHTML = html ? '<div class="olist" style="max-height:none">' + html + "</div>" : '<div class="empty">' + (S.havainnot.length ? "Ei osumia." : "Ei havaintoja.") + "</div>";
    };
    q.addEventListener("input", () => { hvState.q = q.value; paint(); });
    app().querySelectorAll("[data-hf]").forEach((b) => b.addEventListener("click", () => { hvState.f = b.dataset.hf; paint(); }));
    listEl.addEventListener("click", (e) => {
      const cam = e.target.closest("[data-ocam]");
      if (cam) { location.hash = "#/k/" + k.id + "/kuvaus/" + cam.dataset.ocam; return; }
      const o = e.target.closest("[data-oid]");
      if (o) location.hash = "#/k/" + k.id + "/h/" + o.dataset.oid;
    });
    paint();
  }

  /* ---------------- Näkymä: kohteen tiedot ---------------- */
  function viewTiedot() {
    const k = S.kohde;
    const f = (key, label, type) => '<label class="field"><span>' + label + '</span><input type="' + (type || "text") + '" data-k="' + key + '" value="' + esc(k[key]) + '"></label>';
    app().innerHTML = topbar({ title: "Kohteen tiedot", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view no-nav"><section class="card"><div class="card-b" style="padding-top:14px">' +
      f("nimi", "Kohteen nimi") + f("osoite", "Osoite") + f("projektinro", "Projektinumero") + f("tutkija", "Tutkija") + f("pvm", "Tutkimuspäivä", "date") +
      '<p class="hint">Jos aineisto käytetään julkaistavassa työssä, anonymisoi kohteen nimi ja osoite ennen vientiä.</p>' +
      "</div></section>" +
      (window.CloudUI ? CloudUI.tiimiHtml(k) : "") +
      '<section class="card"><div class="card-h"><h2>Vienti ja varmuuskopio</h2></div><div class="card-b">' +
      (vientiTila(k, S.havainnot).msg ? '<p class="hint vienti ' + vientiTila(k, S.havainnot).cls + '" style="margin:0 0 10px">' + esc(vientiTila(k, S.havainnot).msg) + "</p>" : "") +
      '<button class="btn btn-block" data-act="export">' + icon("download") + "Vie ZIP-paketti</button>" +
      '<p class="hint">Paketti sisältää kuvat, sanelut, jäsennellyt tiedot ja pohjakuvat merkintöineen. Samalla paketilla kohteen voi palauttaa toiselle laitteelle.</p>' +
      "</div></section>" +
      '<button class="btn btn-danger btn-block" data-act="deleteKohde">' + icon("trash") + "Poista kohde tältä laitteelta</button>" +
      "</main>";
    const save = UI.debounce(() => Model.saveKohde(), 400);
    app().querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener("input", () => { k[inp.dataset.k] = inp.value; save(); }));
    if (window.CloudUI) CloudUI.bindTiimi(app(), k);
  }

  /* ---------------- Näkymä: tutkimussuunnitelma ---------------- */
  function viewSuunnitelma() {
    const k = S.kohde;
    let rows = "";
    k.suunnitelma.forEach((p) => {
      rows += '<div class="row pl-ed"><button class="grow pl-ed-t" data-act="editKohta" data-id="' + p.id + '" aria-label="Muokkaa kohtaa"><div class="t">' + esc(M.menetelma(p.menetelma).nimi) + "</div>" +
        '<div class="s">' + esc([p.kuvaus, Model.tilaNimi(Model.tila(p.tilaId)), p.naytteet ? "näytteet " + p.naytteet : ""].filter(Boolean).join(" · ") || "Lisää tarkennus napauttamalla") + "</div></button>" +
        '<div class="maara" aria-label="Määrä"><button data-act="maara" data-id="' + p.id + '" data-d="-1" aria-label="Vähennä">−</button><b>' + (p.maara || 1) + '</b><button data-act="maara" data-id="' + p.id + '" data-d="1" aria-label="Lisää">+</button></div>' +
        '<button class="icon-btn" data-act="delKohta" data-id="' + p.id + '" aria-label="Poista kohta">' + icon("trash") + "</button></div>";
    });
    app().innerHTML = topbar({ title: "Tutkimussuunnitelma", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view no-nav"><section class="card">' + (rows || '<div class="empty">Ei vielä tutkimuksia. Lisää menetelmät alta.</div>') + "</section>" +
      '<button class="btn btn-primary btn-block" data-act="addKohta">' + icon("plus") + "Lisää menetelmiä</button>" +
      '<div style="height:10px"></div><button class="btn btn-block" data-act="pdfKohdat">' + icon("upload") + "Tuo tarjouksesta tai suunnitelmasta (PDF)</button>" +
      '<p class="hint">Valitse kerralla kaikki tutkimuksen menetelmät. Määrä (esim. mittauspisteet tai avaukset) muutetaan − / + -painikkeilla, ja tarkennuksen saa napauttamalla menetelmän nimeä.</p></main>';
  }

  /* Usean menetelmän valinta kerralla: haku + valintalista. Valitut lisätään suunnitelmaan määrällä 1. */
  function menetelmaValinta() {
    const valitut = new Set();
    const lista = M.MENETELMAT.filter((m) => !m.piilotettu);
    const norm = (x) => String(x || "").toLowerCase();
    sheet(
      "<h3>Lisää menetelmiä</h3>" +
      '<label class="mp-search" style="margin:0 0 8px">' + icon("list") + '<input type="search" data-q placeholder="Hae menetelmää, esim. RH, näyte, radon" autocomplete="off"></label>' +
      '<div class="mv-lista" data-l></div>' +
      '<div class="row-btns" style="position:sticky;bottom:0;background:var(--raised);padding-top:8px"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok disabled>Lisää valitut</button></div>',
      (el, close) => {
        const q = el.querySelector("[data-q]"), box = el.querySelector("[data-l]"), ok = el.querySelector("[data-ok]");
        const onSuunnitelmassa = (id) => S.kohde.suunnitelma.filter((p) => p.menetelma === id).length;
        function paint() {
          const w = norm(q.value).trim();
          const hits = lista.filter((m) => !w || norm(m.nimi).includes(w) || norm(m.lyhyt).includes(w) || Auto.methodWords(m).some((x) => norm(x).includes(w)));
          box.innerHTML = hits.map((m) => '<label class="ka-chk mv-r"><input type="checkbox" data-m="' + m.id + '"' + (valitut.has(m.id) ? " checked" : "") + "><span>" + esc(m.nimi) +
            (onSuunnitelmassa(m.id) ? ' <small class="hint">jo suunnitelmassa</small>' : "") + "</span></label>").join("") || '<p class="hint">Ei osumia.</p>';
          ok.disabled = !valitut.size;
          ok.textContent = valitut.size ? "Lisää valitut (" + valitut.size + ")" : "Lisää valitut";
        }
        q.addEventListener("input", paint);
        box.addEventListener("change", (e) => { const c = e.target.closest("[data-m]"); if (!c) return; if (c.checked) valitut.add(c.dataset.m); else valitut.delete(c.dataset.m); paint(); });
        ok.addEventListener("click", async () => {
          lista.filter((m) => valitut.has(m.id)).forEach((m) => S.kohde.suunnitelma.push({ id: DB.uid("p_"), menetelma: m.id, kuvaus: "", maara: 1, tilaId: null, pois: null }));
          await Model.saveKohde(); close(); toast(valitut.size + (valitut.size === 1 ? " menetelmä lisätty" : " menetelmää lisätty")); render();
        });
        paint();
        setTimeout(() => q.focus(), 50);
      }
    );
  }

  function kohtaSheet(p) {
    const isNew = !p;
    p = p || { id: DB.uid("p_"), menetelma: "aisti", kuvaus: "", maara: 1, tilaId: null, pois: null };
    const opts = M.MENETELMAT.filter((m) => !m.piilotettu || m.id === p.menetelma).map((m) => '<option value="' + m.id + '"' + (m.id === p.menetelma ? " selected" : "") + ">" + esc(m.nimi) + "</option>").join("");
    sheet(
      "<h3>" + (isNew ? "Uusi suunnitelman kohta" : "Muokkaa kohtaa") + "</h3>" +
      '<label class="field"><span>Menetelmä</span><select data-f="menetelma">' + opts + "</select></label>" +
      '<label class="field"><span>Tarkennus ja sijainti</span><input type="text" data-f="kuvaus" value="' + esc(p.kuvaus) + '" placeholder="esim. kellarin ulkoseinät"></label>' +
      '<label class="field"><span>Määrä</span><input type="number" min="1" inputmode="numeric" data-f="maara" value="' + (p.maara || 1) + '"></label>' +
      '<label class="field" data-nayt' + (p.menetelma === "avaus" ? "" : " hidden") + '><span>Näytteitä avauksista yhteensä</span><input type="number" min="0" inputmode="numeric" data-f="naytteet" value="' + (p.naytteet || 0) + '">' +
        '<small class="hint">Esim. 1 näyte per avaus = sama kuin avausten määrä. Näytteet kirjataan samaan kohtaan.</small></label>' +
      '<div class="row-btns">' + (isNew ? '<button class="btn" data-more>Lisää ja lisää seuraava</button>' : '<button class="btn" data-close>Peruuta</button>') +
      '<button class="btn btn-primary" data-ok>Tallenna</button></div>',
      (el, close) => {
        const read = () => {
          p.menetelma = el.querySelector('[data-f="menetelma"]').value;
          p.kuvaus = el.querySelector('[data-f="kuvaus"]').value.trim();
          p.maara = Math.max(1, parseInt(el.querySelector('[data-f="maara"]').value, 10) || 1);
          const nv = p.menetelma === "avaus" ? Math.max(0, parseInt(el.querySelector('[data-f="naytteet"]').value, 10) || 0) : 0;
          if (nv) p.naytteet = nv; else delete p.naytteet;
        };
        el.querySelector('[data-f="menetelma"]').addEventListener("change", (e) => { el.querySelector("[data-nayt]").hidden = e.target.value !== "avaus"; });
        const commit = async () => {
          read();
          if (isNew) S.kohde.suunnitelma.push(p);
          await Model.saveKohde();
        };
        el.querySelector("[data-ok]").addEventListener("click", async () => { await commit(); close(); render(); });
        const more = el.querySelector("[data-more]");
        if (more) more.addEventListener("click", async () => {
          await commit(); close(); toast("Kohta lisätty"); render();
          setTimeout(() => kohtaSheet(null), 60);
        });
      }
    );
  }

  /* ---------------- Toiminnot (klikit) ---------------- */
  const A = {
    /* Uusi kohde alkaa tutkimussuunnitelmasta: nimi, osoite, projektinumero ja tutkimukset luetaan
       PDF:stä. Ilman suunnitelmaa kohteelle annetaan vain nimi. */
    /* Uusi kohde: nimi (valinnainen) ja tutkija, sitten Lähtötiedot-vaihe, jossa kaikki tuontitavat. */
    /* Uusi kohde (K3.3): oma näkymä, jossa raportti ja nimi; lähtötiedot myöhemmin tai paketista */
    newKohde() { location.hash = "#/uusi"; },
    raporttiVaihda() { Raportit.vaihda(S.kohde, () => render()); },
    lahtoOdottaa() { KaLahto.tarkistaOdottavat(() => render()); },
    async restore() {
      const files = await UI.pickFile(".zip,application/zip", false);
      if (!files.length) return;
      try {
        const id = await Export.restore(files[0]);
        toast("Kohde palautettu");
        location.hash = "#/k/" + id;
      } catch (e) { toast(e.message || "Palautus epäonnistui", 4000); }
    },
    openH(el) { location.hash = "#/k/" + S.kohde.id + "/h/" + el.dataset.id; },
    async paikannus() {
      const k = S.kohde, t = Paikannus.tilanne();
      // Päällä mutta anturit eivät käy (esim. iPhone vaatii napautuksen): käynnistetään, ei sammuteta
      if (k.paikannus && !t.on) { const ok = await Paikannus.kaynnista(); toast(ok ? "Seuranta käynnissä" : "Anturit eivät käynnisty: " + Paikannus.tilanne().virhe, 3500); render(); return; }
      const ok = await Paikannus.asetaPaalle(!k.paikannus);
      toast(k.paikannus ? (ok ? "Seuranta päällä. Valitse tila ensimmäisessä kirjauksessa, niin seuranta alkaa siitä." : "Anturit eivät käynnisty: " + Paikannus.tilanne().virhe) : "Seuranta pois", 4000);
      render();
    },
    /* Seurannan loki: jako (puhelin), lataus tai leikepöytä. Jakona .txt, koska Android ei jaa .json-tiedostoja. */
    paikannusLoki() {
      const k = S.kohde, data = JSON.stringify(Paikannus.vieLoki());
      const base = "tilaseuranta_" + (k.nimi || "kohde").replace(/[^A-Za-z0-9ÅÄÖåäö_-]+/g, "_").slice(0, 40) + "_" + new Date().toISOString().slice(0, 10);
      const file = new File([data], base + ".txt", { type: "text/plain" });
      const voiJakaa = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
      sheet('<h3 style="margin:0 0 6px">Vie seurannan loki</h3><p class="hint" style="margin:0 0 14px">Lokissa on askeleet, suunnat ja tilavalinnat (' + Paikannus.lokiPituus() +
        " riviä). Ei kuvia, sanelua eikä nimiä. Lähetä tiedosto seurannan säätöä varten.</p>" +
        (voiJakaa ? '<button class="btn btn-primary btn-block" data-x="jaa" style="margin-bottom:8px">' + icon("upload") + "Jaa tiedosto (sähköposti, Drive…)</button>" : "") +
        '<button class="btn btn-block' + (voiJakaa ? "" : " btn-primary") + '" data-x="lataa" style="margin-bottom:8px">' + icon("download") + "Tallenna laitteelle</button>" +
        '<button class="btn btn-block" data-x="kopioi" style="margin-bottom:8px">' + icon("copy") + "Kopioi leikepöydälle</button>" +
        '<button class="btn btn-block" data-close>Peruuta</button>', (el, close) => {
        el.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-x]"); if (!b) return;
          const x = b.dataset.x;
          try {
            if (x === "jaa") { await navigator.share({ files: [file], title: file.name }); close(); toast("Loki jaettu", 2500); return; }
            if (x === "kopioi") { await navigator.clipboard.writeText(data); close(); toast("Loki kopioitu leikepöydälle. Liitä se sähköpostiin tai viestiin.", 4000); return; }
            const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
            const a = document.createElement("a"); a.href = url; a.download = base + ".json"; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            close(); toast("Loki tallennettu: " + base + ".json", 4000);
          } catch (err) {
            if (err && err.name === "AbortError") return;      // jako peruttiin
            toast("Ei onnistunut (" + (err && err.message || err) + "). Kokeile toista tapaa.", 4500);
          }
        });
      });
    },
    galleria() { Gallery.importPhotos(() => render()); },
    addKohta() { menetelmaValinta(); },
    async maara(el) { const p = Model.kohta(el.dataset.id); if (!p) return; p.maara = Math.max(1, (p.maara || 1) + Number(el.dataset.d)); await Model.saveKohde(); const y = window.scrollY; render(); setTimeout(() => window.scrollTo(0, y), 0); },
    pdfKohdat() { PlanImport.importPdf(); },
    editKohta(el) { kohtaSheet(Model.kohta(el.dataset.id)); },
    async delKohta(el) {
      const p = Model.kohta(el.dataset.id);
      if (!(await confirmSheet({ title: "Poistetaanko kohta?", text: Model.kohtaNimi(p) + ". Kohtaan liitetyt havainnot säilyvät.", ok: "Poista kohta", danger: true }))) return;
      S.kohde.suunnitelma = S.kohde.suunnitelma.filter((x) => x.id !== p.id);
      S.havainnot.forEach((h) => { if (h.suunnitelmaId === p.id) { h.suunnitelmaId = null; DB.put("havainnot", h); } });
      await Model.saveKohde(); render();
    },
    kohtaMenu(el) { App.kohtaActions(Model.kohta(el.dataset.id)); },
    uKohta(el) { S.uAuki = S.uAuki === el.dataset.id ? null : el.dataset.id; render(); },
    uKerros(el) { S.uKerros = el.dataset.id; render(); },
    async uPdf() { const e = Model.kerros(S.uKerros); if (e && window.PohjaPdf) await PohjaPdf.lataa(e); },
    async export() { await Export.run(false); },
    async deleteKohde() {
      if (!(await confirmSheet({ title: "Poistetaanko kohde?", text: "Kaikki kohteen havainnot, kuvat ja sanelut poistetaan tältä laitteelta. Vie ZIP-paketti ensin, jos tarvitset aineistoa.", ok: "Poista kohde", danger: true }))) return;
      if (!(await confirmSheet({ title: "Vahvista poisto", text: "Poistoa ei voi perua.", ok: "Poista lopullisesti", danger: true }))) return;
      await DB.deleteKohde(S.kohde.id);
      S.kohde = null;
      location.hash = "#/";
    }
  };

  /* Suunnitelman kohdan toiminnot (kohdenäkymä ja lähtötarkistus) */
  function kohtaActions(p) {
    const k = S.kohde;
    const linked = S.havainnot.filter((h) => h.suunnitelmaId === p.id);
    const seur = M.menetelma(p.menetelma).seuranta, kam = M.menetelma(p.menetelma).kuntoarvio;
    sheet(
      "<h3>" + esc(Model.kohtaNimi(p)) + "</h3>" +
      "<p>" + (p.pois ? "Jätetään pois: " + esc(p.pois.syy) : "Tehty " + Model.kohtaMaaraTeksti(p).replace("/", " / ")) + "</p>" +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      (kam ? '<button class="btn btn-primary" data-a="ka">' + icon("list") + "Avaa kuntoarvio</button>" : seur ? '<button class="btn btn-primary" data-a="seur">' + icon("pin") + "Olosuhdeseuranta: mittalaitteet</button>"
            : '<button class="btn btn-primary" data-a="kuva">' + icon("cam") + "Kuva + sanelu tähän kohtaan</button>" + (p.naytteet ? '<button class="btn" data-a="nayte">' + icon("cam") + "Näyte avauksesta tähän kohtaan</button>" : "")) +
      linked.map((h) => '<button class="btn" data-h="' + h.id + '">' + nro(h) + " · " + esc(Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu") + "</button>").join("") +
      (p.pois ? '<button class="btn" data-a="palauta">Palauta tehtäväksi</button>' : '<button class="btn" data-a="pois">Jätetään pois + syy</button>') +
      '<button class="btn" data-close>Sulje</button></div>',
      (el, close) => {
        const kv = el.querySelector('[data-a="kuva"]');
        if (kv) kv.addEventListener("click", () => {
          close(); location.hash = "#/k/" + k.id + "/kuvaus?menetelma=" + p.menetelma + "&kohta=" + p.id;
        });
        const nv = el.querySelector('[data-a="nayte"]');
        if (nv) nv.addEventListener("click", () => { close(); location.hash = "#/k/" + k.id + "/kuvaus?menetelma=nayte&kohta=" + p.id; });
        const sv = el.querySelector('[data-a="seur"]');
        if (sv) sv.addEventListener("click", () => { close(); location.hash = "#/k/" + k.id + "/seuranta"; });
        const kv2 = el.querySelector('[data-a="ka"]');
        if (kv2) kv2.addEventListener("click", () => { close(); location.hash = "#/k/" + k.id + "/kuntoarvio"; });
        el.querySelectorAll("[data-h]").forEach((b) => b.addEventListener("click", () => { close(); location.hash = "#/k/" + k.id + "/h/" + b.dataset.h; }));
        const pois = el.querySelector('[data-a="pois"]');
        if (pois) pois.addEventListener("click", async () => {
          close();
          const syy = await promptSheet({ title: "Miksi kohta jätetään pois?", label: "Syy (näkyy raportissa rajauksena)", required: true, multiline: true });
          if (syy == null) return;
          p.pois = { syy, aika: Date.now() };
          await Model.saveKohde(); render();
        });
        const pal = el.querySelector('[data-a="palauta"]');
        if (pal) pal.addEventListener("click", async () => { p.pois = null; await Model.saveKohde(); close(); render(); });
      }
    );
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !app().contains(el)) return;
    const fn = A[el.dataset.act] || (App.actions && App.actions[el.dataset.act]);
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  /* ---------------- Reititys ---------------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const q = {};
    (qs || "").split("&").filter(Boolean).forEach((kv) => { const [a, b] = kv.split("="); q[decodeURIComponent(a)] = decodeURIComponent(b || ""); });
    return { parts, q };
  }

  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    const t = document.getElementById("toast");
    if (t && /virhe|ei löytynyt|keskeytyi|estettiin|vaatii/i.test(t.textContent)) t.classList.remove("on");
    S.kamera = null;
    if (S.cleanup) { try { S.cleanup(); } catch (e) { /* ohita */ } S.cleanup = null; }
    const { parts, q } = parseHash();
    try {
      if (window.CloudUI && CloudUI.tarvitaanKirjautuminen()) { CloudUI.loginView(); return; }
      if (parts[0] === "sanasto") { await VocabView.view(); return; }
      if (parts[0] === "asetukset") { await Asetukset.view(); return; }
      if (parts[0] === "taidot") { if (parts[1]) await TaidotNakyma.muokkaa(decodeURIComponent(parts[1])); else await TaidotNakyma.view(); return; }
      if (parts[0] === "jaa") { await Jaa.view(); return; }
      if (parts[0] === "uusi") { await Raportit.uusiView(); return; }
      if (parts[0] === "menetelmat") {
        if (parts[1]) await Editor.viewMethod(decodeURIComponent(parts[1])); else await Editor.viewList();
        return;
      }
      if (parts[0] !== "k" || !parts[1]) { await viewHome(); return; }
      const ok = await loadKohde(parts[1]);
      if (seq !== renderSeq) return;
      if (!ok) { location.hash = "#/"; return; }
      const sub = parts[2] || "";
      window.scrollTo(0, 0);
      if (sub === "") await viewKohde();
      else if (sub === "tiedot") viewTiedot();
      else if (sub === "suunnitelma") viewSuunnitelma();
      else if (sub === "havainnot") await viewHavainnot();
      else if (sub === "kuvaus") await Capture.view(parts[3] || null, q);
      else if (sub === "h") await Card.view(parts[3]);
      else if (sub === "pohja") await Plan.view(q);
      else if (sub === "lahto") await Check.view();
      else if (sub === "seuranta") await Seuranta.view(parts[3] || null);
      else if (sub === "kuntoarvio") await Kuntoarvio.view(parts[3] || null);
      else if (sub === "akk") await AKK.view(parts[3] || null);
      else if (sub === "tiiviys") await Tiiviys.view(parts[3]);
      else if (sub === "muistio") await Muistio.view();
      else if (sub === "yleiskuvat") await Yleiskuvat.view();
      else if (sub === "kalusto") await Kalusto.view();
      else if (sub === "lahtotiedot") await Lahtotiedot.view(parts[3] || null, q);
      else if (sub === "katselmus") await Katselmus.view();
      else if (sub === "word") await Raporttipohjat.view();
      else await viewKohde();
    } catch (err) {
      console.error(err);
      app().innerHTML = topbar({ title: "Virhe", back: "#/" }) + '<main class="view no-nav"><div class="alert">' + icon("alert") + "<div>" + esc(err.message || String(err)) + "</div></div></main>";
    }
  }

  /* Paluuosoite menetelmäeditorista: näkymä, josta editoriin tultiin. */
  let paluuHash = null;
  function paluu(oletus) { return paluuHash || oletus; }

  const App = { S, Model, render, topbar, bottomnav, fab, pinClass, kohtaActions, paluu, loadKohde, actions: {} };
  window.App = App;

  window.addEventListener("hashchange", (e) => {
    const from = (e.oldURL || "").split("#")[1] || "/";
    const asetus = (h) => /^\/?(menetelmat|sanasto)/.test(h);
    if (/^#\/(menetelmat|sanasto)/.test(location.hash) && !asetus(from)) paluuHash = "#" + from;
    UI.closeAllSheets();
    UI.hideToast(500);
    render();
  });
  /* Käynnistyksen vaihe talteen: jos välilehti kaatuu, seuraava käynnistys kertoo, missä vaiheessa */
  const vaihe = (v) => { try { if (v) localStorage.setItem("ks.boot", v); else localStorage.removeItem("ks.boot"); } catch (e) { /* ohita */ } };
  let edellinenKaatui = null;
  try { edellinenKaatui = localStorage.getItem("ks.boot"); } catch (e) { /* ohita */ }
  window.addEventListener("DOMContentLoaded", async () => {
    vaihe("menetelmät"); await M.load();
    vaihe("oppiminen"); await Learn.load();
    vaihe("taidot"); if (window.Taidot) { try { await Taidot.lataa(); Taidot.kytke(); } catch (e) { console.warn("Taidot", e); } }
    vaihe("sanasto"); await Vocab.load();
    vaihe("pilvi");
    if (window.Cloud) { try { await Cloud.init(); } catch (e) { console.warn("Pilvi", e); } }
    vaihe("näkymä");
    render();
    if (edellinenKaatui) setTimeout(() => UI.toast("Edellinen käynnistys keskeytyi (vaihe: " + edellinenKaatui + "). Ilmoita tästä ylläpitäjälle, jos toistuu.", 6000), 800);
    setTimeout(() => vaihe(null), 6000);
    if (window.Sync && Cloud.enabled) { Sync.start(); Sync.siivoa(false).catch(() => {}); }
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // Tarkistetaan päivitys myös, kun sovellus palaa näkyviin (esim. kotinäytöltä avattuna).
        document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
      // Kun uusi versio otetaan käyttöön, ladataan sivu uudelleen. Kesken olevaa kuvausta tai
      // kirjausta ei keskeytetä: lataus tehdään vasta, kun käyttäjä palaa etusivulle tai kohteeseen.
      let pending = false;
      const safe = () => { const h = location.hash.replace(/^#\/?/, ""); return h === "" || /^k\/[^/]+$/.test(h); };
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController) return; // ensimmäinen asennus, ei vanhaa versiota
        if (safe() && !document.querySelector(".cam")) location.reload();
        else { pending = true; UI.toast("Uusi versio ladattu. Se otetaan käyttöön, kun palaat kohteeseen.", 4000); }
      });
      window.addEventListener("hashchange", () => { if (pending && safe()) location.reload(); });
    }
  });
})();
