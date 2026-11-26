/* =========================================================================
   raportit.js – raporttityyppi (K3.3, Teemu 26.11.2026)

   Kohteelle valitaan, mikä raportti siitä tehdään. Valinta korvaa kysymyksen
   "Mitä teet kohteessa?": raportin nimen tutkija tunnistaa aina. Raportti
   - valitsee yhden menetelmän raporteissa menetelmän valmiiksi (kamera ei kysy),
   - lisää kuntoarvion ja asuntokaupan kuntotarkastuksen suunnitelmaan,
   - ohjaa kalustolistaa ja Word-pohjaa (PBM:n pohjat 26.11.2026).
   Lähtötietopaketti tuo raportin tarjouksesta (kenttä "raportti") tai se
   päätellään paketin sisällöstä; epävarma ehdotus jätetään valitsematta.

   Tallennus: kohde.raportti = tunnus, kohde.raporttiLahde = lyhyt peruste
   (esim. tarjouksen ote), kohde.oletusMenetelma = menetelmän tunnus tai null.
   Näkymä: #/uusi (uusi kohde).
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet } = UI;

  /* yleinen: näkyy heti; muut "Muu raportti" -valinnan takana */
  const RAPORTIT = [
    { id: "katselmus", nimi: "Katselmusraportti", selite: "Alkukatselmus: havainnot ja tutkimustarpeet", yleinen: true, kalusto: "aisti" },
    { id: "tutkimusseloste", nimi: "Tutkimusseloste", selite: "Kuntotutkimus, useita menetelmiä", yleinen: true },
    { id: "kuntoarvio", nimi: "Kuntoarvio", selite: "Kiinteistön kuntoarvio ja PTS-ehdotus", yleinen: true, suunnitelma: "kuntoarvio" },
    { id: "asuntokauppa", nimi: "Asuntokaupan kuntotarkastus", selite: "Kuntotarkastus asuntokauppaa varten", yleinen: true, suunnitelma: "asuntokauppa" },
    { id: "rh", nimi: "Rakenteiden kosteusmittaukset", selite: "Porareikä- tai näytepalamittaus (RH)", menetelma: "rh" },
    { id: "markatila", nimi: "Märkätilakartoitus", selite: "Märkätilojen ja keittiöiden pintakosteus", menetelma: "mtk" },
    { id: "kalvopaksuus", nimi: "Kalvopaksuusmittaus", selite: "Märkätilan vedeneristeen paksuus näytepalasta", menetelma: "kalvopaksuus" },
    { id: "vetokoe", nimi: "Vetokokeet", selite: "Pinnoitteen veto- ja tartuntalujuus", menetelma: "vetokoe" },
    { id: "merkkiaine", nimi: "Merkkiainekokeet", selite: "Rakenteiden ilmatiiveys merkkiaineella", menetelma: "merkkiaine" },
    { id: "vss", nimi: "VSS-tarkastus", selite: "Väestönsuojan tiiveyskoe ja laitteiden tarkastus", menetelma: "vss" }
  ];
  const hae = (id) => RAPORTIT.find((r) => r.id === id) || null;
  const nimi = (k) => { const r = k && hae(k.raportti); return r ? r.nimi : ""; };
  const norm = (s) => String(s || "").toLowerCase().trim();

  /* Tunnistus vapaasta tekstistä (paketin arvo tai tarjouksen ote) */
  function tunnista(teksti) {
    const t = norm(teksti);
    if (!t) return null;
    const suora = RAPORTIT.find((r) => r.id === t || norm(r.nimi) === t);
    if (suora) return suora.id;
    const s = [
      ["asuntokauppa", /asuntokaup|kuntotarkastu|\bakk\b/], ["kuntoarvio", /kuntoarvi|\bpts\b|perusparannustarve/],
      ["vss", /väestönsuoj|\bvss\b/], ["kalvopaksuus", /kalvopaksu|vedeneristeen paksu/], ["vetokoe", /vetoko|vetolujuu|tartuntaluju/],
      ["merkkiaine", /merkkiain/], ["markatila", /märkätilakartoit|märkätilatarkast/], ["rh", /kosteusmittau|rakennekostey|pinnoitettavuu/],
      ["katselmus", /katselmu/], ["tutkimusseloste", /kuntotutkimu|tutkimusselost|sisäilmatekni|kosteustekni/]
    ].find(([, re]) => re.test(t));
    return s ? s[0] : null;
  }

  /* Raportti lähtötietopaketista: { id, varma, peruste } tai null.
     1) paketin kenttä "raportti" (Arvo: pelkkä teksti tai { arvo, lahde, varmuus })
     2) päättely sisällöstä; kuntoarvio vs. asuntokaupan kuntotarkastus ei ratkea sisällöstä -> epävarma */
  function paketista(j) {
    const r = j && j.raportti;
    if (r) {
      const arvo = typeof r === "object" ? r.arvo : r;
      const id = tunnista(arvo);
      if (id) {
        const ote = typeof r === "object" && r.lahde ? [r.lahde.tiedosto, r.lahde.ote ? "”" + r.lahde.ote + "”" : ""].filter(Boolean).join(", ") : "";
        return { id, varma: !(typeof r === "object" && r.varmuus === "epävarma"), peruste: ote || "lähtötietopaketti" };
      }
    }
    const suun = ((j && j.suunnitelma) || []).map((p) => norm(p.menetelma));
    const yksi = (mid) => suun.length && suun.every((x) => x === mid);
    if (j && j.kuntoarvio && Object.keys(j.kuntoarvio).length) return { id: "kuntoarvio", varma: false, peruste: "päätelty paketin kuntoarviotiedoista (tarkista: kuntoarvio vai asuntokaupan kuntotarkastus)" };
    const ksl = j && j.katselmus && ((j.katselmus.kysymykset || []).length || (j.katselmus.kierros || []).length);
    if (ksl && !suun.length) return { id: "katselmus", varma: true, peruste: "päätelty: paketissa katselmuksen kysymykset, ei tutkimussuunnitelmaa" };
    const yhden = RAPORTIT.find((x) => x.menetelma && yksi(x.menetelma));
    if (yhden) return { id: yhden.id, varma: true, peruste: "päätelty: suunnitelmassa vain " + norm(yhden.nimi) };
    if (suun.length > 1 || (suun.length === 1 && !yhden)) return { id: "tutkimusseloste", varma: true, peruste: "päätelty: suunnitelmassa " + suun.length + (suun.length === 1 ? " menetelmä" : " menetelmää") };
    return null;
  }

  /* Raportin asetus kohteelle. Kuntoarvio ja AKK lisätään suunnitelmaan (näkymät ja edistyminen
     perustuvat siihen); muuten suunnitelmaa ei muuteta. */
  function aseta(k, id, lahde) {
    const r = hae(id);
    if (!r) return;
    k.raportti = r.id;
    k.raporttiLahde = lahde || null;
    k.oletusMenetelma = r.menetelma || null;
    k.suunnitelma = k.suunnitelma || [];
    if (r.suunnitelma && !k.suunnitelma.some((p) => p.menetelma === r.suunnitelma && !p.pois))
      k.suunnitelma.push({ id: DB.uid("p_"), menetelma: r.suunnitelma, kuvaus: "", maara: 1, tilaId: null, pois: null });
  }

  /* Kalustolistan lisäryhmät raportista (yhden menetelmän raportti, katselmus) */
  function kalustoMenetelmat(k) {
    const r = k && hae(k.raportti);
    return r ? [r.menetelma, r.kalusto].filter(Boolean) : [];
  }

  /* Valintalista: yleiset ja (avattuna) muut. valittu = tunnus */
  function listaHtml(valittu, muutAuki) {
    const nappi = (r) => '<button type="button" class="rv-nappi" data-rv="' + r.id + '" aria-pressed="' + (r.id === valittu) + '"><span class="rv-n">' + esc(r.nimi) +
      '</span><span class="rv-s">' + esc(r.selite) + "</span></button>";
    const muut = RAPORTIT.filter((r) => !r.yleinen);
    const muuValittu = muut.some((r) => r.id === valittu);
    return '<div class="rv-lista">' + RAPORTIT.filter((r) => r.yleinen).map(nappi).join("") +
      (muutAuki || muuValittu
        ? '<div class="rv-ryhma">Muu raportti: yksi mittaus tai tarkastus</div>' + muut.map(nappi).join("")
        : '<button type="button" class="rv-nappi rv-muu" data-rv-muut><span class="rv-n">Muu raportti</span><span class="rv-s">Kosteusmittaukset, märkätilakartoitus, kalvopaksuus, vetokokeet, merkkiaine, VSS</span></button>') +
      "</div>";
  }

  /* Raportin vaihto kohdesivulta */
  function vaihda(k, onDone) {
    let muutAuki = false;
    sheet('<h3 style="margin:0 0 4px">Mikä raportti kohteesta tehdään?</h3><p class="hint" style="margin:0 0 12px">Raportti valitsee Word-pohjan ja kalustolistan ja yhden menetelmän raporteissa menetelmän valmiiksi. Kirjaukset säilyvät.</p><div data-l></div>' +
      '<div class="row-btns" style="margin-top:12px"><button class="btn btn-block" data-close>Peruuta</button></div>', (el, close) => {
      const box = el.querySelector("[data-l]");
      const paint = () => { box.innerHTML = listaHtml(k.raportti, muutAuki); };
      box.addEventListener("click", async (e) => {
        if (e.target.closest("[data-rv-muut]")) { muutAuki = true; paint(); return; }
        const b = e.target.closest("[data-rv]");
        if (!b) return;
        aseta(k, b.dataset.rv, null);
        await App.Model.saveKohde();
        close(); toast("Raportti: " + nimi(k));
        if (onDone) onDone();
      });
      paint();
    });
  }

  /* Kohdesivun rivi */
  function riviHtml(k) {
    const r = hae(k.raportti);
    return '<section class="rv-rivi"><div class="grow"><div class="rv-k">Raportti</div><div class="rv-n">' + esc(r ? r.nimi : "Ei valittu") + "</div>" +
      (r && k.raporttiLahde ? '<div class="rv-lahde">✓ Lähtötiedoista: ' + esc(k.raporttiLahde) + "</div>" : "") +
      (!r ? '<div class="rv-lahde ei">Valitse, niin kamera ja kalustolista osaavat oikeat menetelmät.</div>' : "") +
      '</div><button class="btn btn-sm" data-act="raporttiVaihda">' + (r ? "Vaihda" : "Valitse") + "</button></section>";
  }

  /* ---------- Näkymä: uusi kohde ---------- */
  async function uusiView() {
    let tutkija = ""; try { tutkija = localStorage.getItem("ks_tutkija") || ""; } catch (e) { /* ohita */ }
    const u = window.Cloud && Cloud.user ? Cloud.user() : null;
    if (u && u.nimi) tutkija = u.nimi;
    const st = { raportti: null, muutAuki: false, nimi: "" };
    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Uusi kohde", back: "#/" }) +
      '<main class="view no-nav uusi-kohde">' +
      '<section class="uk-paketti"><div class="grow"><div class="t">Onko lähtötietopaketti?</div><div class="s">Tuo se, niin raportti, pohjakuva ja suunnitelma valitaan valmiiksi.</div></div>' +
        '<button class="btn" data-uk="paketti">' + icon("download") + "Tuo paketti</button></section>" +
      '<h2 class="uk-ots">1. Mikä raportti kohteesta tehdään?</h2><div data-lista></div>' +
      '<label class="uk-ots" for="uk-nimi">2. Kohteen nimi</label>' +
      '<label class="field" style="margin-top:6px"><input id="uk-nimi" type="text" data-uk-nimi placeholder="esim. Koulukatu 5" autocomplete="off"></label>' +
      (tutkija ? '<p class="hint" data-uk-tutkija-rivi>Tutkija: ' + esc(tutkija) + ' · <button class="link" data-uk="muutaTutkija" type="button">Muuta</button></p>'
               : '<label class="field"><span>Tutkija</span><input type="text" data-uk-tutkija placeholder="Etunimi Sukunimi"></label>') +
      '<button class="btn btn-primary btn-block" data-uk="luo" disabled>Valitse raportti ja anna nimi</button>' +
      '<p class="hint" style="text-align:center">Pohjakuvan ja tarjouksen voi lisätä myöhemmin kohteen sivulta.</p></main>';
    const lista = root.querySelector("[data-lista]"), nimiInp = root.querySelector("[data-uk-nimi]"), luo = root.querySelector('[data-uk="luo"]');
    const paint = () => {
      lista.innerHTML = listaHtml(st.raportti, st.muutAuki);
      const ok = !!st.raportti && !!nimiInp.value.trim();
      luo.disabled = !ok;
      luo.textContent = ok ? "Luo kohde" : !st.raportti && !nimiInp.value.trim() ? "Valitse raportti ja anna nimi" : !st.raportti ? "Valitse, mikä raportti tehdään" : "Anna kohteelle nimi";
    };
    lista.addEventListener("click", (e) => {
      if (e.target.closest("[data-rv-muut]")) { st.muutAuki = true; paint(); return; }
      const b = e.target.closest("[data-rv]");
      if (b) { st.raportti = b.dataset.rv; paint(); }
    });
    nimiInp.addEventListener("input", paint);
    const tutkijaNyt = () => { const i = root.querySelector("[data-uk-tutkija]"); return i ? i.value.trim() : tutkija; };
    const luoKohde = async (o) => {
      const t = tutkijaNyt();
      try { if (t) localStorage.setItem("ks_tutkija", t); } catch (e) { /* ohita */ }
      const k = App.Model.newKohde({ nimi: o.nimi, tutkija: t });
      if (o.tilapainen) k.nimiTilapainen = true;
      if (o.raportti) aseta(k, o.raportti, null);
      await DB.put("kohteet", k);
      DB.requestPersist();
      return k;
    };
    root.querySelector(".uusi-kohde").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-uk]");
      if (!b) return;
      if (b.dataset.uk === "muutaTutkija") {
        const rivi = root.querySelector("[data-uk-tutkija-rivi]");
        rivi.outerHTML = '<label class="field"><span>Tutkija</span><input type="text" data-uk-tutkija value="' + esc(tutkija) + '"></label>';
        return;
      }
      if (b.dataset.uk === "paketti") {
        // Kohde luodaan väliaikaisella nimellä; nimi, raportti ja suunnitelma tulevat paketista
        const k = await luoKohde({ nimi: nimiInp.value.trim() || "Uusi kohde " + UI.pvm(Date.now()), tilapainen: !nimiInp.value.trim(), raportti: st.raportti });
        location.hash = "#/k/" + k.id + "/lahtotiedot?uusi=1";
        return;
      }
      if (b.dataset.uk === "luo" && !b.disabled) {
        const k = await luoKohde({ nimi: nimiInp.value.trim(), raportti: st.raportti });
        location.hash = "#/k/" + k.id;
        setTimeout(() => toast("Kohde luotu"), 150);
      }
    });
    paint();
  }

  /* Word-pohjan valinta raportin mukaan: PBM:n pohjien tiedostonimet (26.11.2026) */
  const POHJA = { katselmus: /katselmus/i, tutkimusseloste: /tutkimusselost/i, kuntoarvio: /kuntoarvio/i, asuntokauppa: /asuntokaup|kuntotarkast/i,
    rh: /kosteusmittau|\dRHx?/i, markatila: /m.?rk.?tila|märkätila/i, kalvopaksuus: /kalvopaks/i, vetokoe: /vetoko/i, merkkiaine: /merkkiain|MAKx?/i, vss: /vss|väestönsuoj/i };
  const pohjaSopii = (k, tiedosto) => !!(k && k.raportti && POHJA[k.raportti] && POHJA[k.raportti].test(String(tiedosto || "")));

  window.Raportit = { RAPORTIT, pohjaSopii, hae, nimi, tunnista, paketista, aseta, kalustoMenetelmat, listaHtml, vaihda, riviHtml, uusiView };
})();
