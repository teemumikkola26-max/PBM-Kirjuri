/* =========================================================================
   taidotnakyma.js – Taidot-näkymä (#/taidot) ja taidon muokkaus (#/taidot/<id>)
   Lista, päälle/pois, ehdotukset (Omat opit), Liitä taito, tuonti tiedostosta,
   vienti, versiohistoria ja käyttömittarit. Taito ei ole koodia: muokkaus on lomake.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet } = UI;
  const LAHDE = { oma: "oma", claude: "Claude", opittu: "opittu", tiimi: "tiimi", sovellus: "sovellus" };
  const ERIT = { tulos: "Tulos", kohta: "Suunnitelman kohta", tila: "Tila" };

  /* ---------- Tuonti: esikatselu ja hyväksyntä ---------- */
  async function tuoTeksti(teksti) {
    let lista;
    try { lista = Taidot.jasenna(teksti); } catch (e) { toast(e.message, 4500); return 0; }
    let n = 0;
    for (const t of lista) {
      const varo = Taidot.tarkista(t);
      const sama = Taidot.lista().find((x) => x.id === t.id || (x.nimi && x.nimi === t.nimi));
      const ok = await confirmSheet({
        title: (sama ? "Päivitetäänkö taito " : "Otetaanko käyttöön taito ") + "”" + t.nimi + "”?",
        text: [t.kuvaus].concat(Taidot.kuvaus(t), varo.length ? ["⚠ " + varo.join("; ") + " (kohta ohitetaan)"] : [], sama ? ["Nykyinen versio jää versiohistoriaan."] : []).filter(Boolean).join("\n"),
        ok: sama ? "Päivitä" : "Ota käyttöön"
      });
      if (!ok) continue;
      if (sama) t.id = sama.id;
      await Taidot.tallenna(t);
      n++;
    }
    if (n) toast(n === 1 ? "Taito otettu käyttöön" : n + " taitoa otettu käyttöön");
    return n;
  }

  /* ---------- Lista ---------- */
  async function view() {
    const root = document.getElementById("app");
    function paint() {
      const eh = Taidot.ehdotukset(), koko = Taidot.kokoamisehdotukset(), mit = Taidot.mittarit(), kk = Object.keys(mit).sort().slice(-3);
      root.innerHTML = App.topbar({ title: "Taidot", sub: "Omat toimintatavat", back: "#/" }) +
        '<main class="view no-nav">' +
        '<p class="hint" style="margin:0 0 12px">Taito kertoo sovellukselle, miten haluat toimia: mitä täytetään valmiiksi, mitä kysytään, mitä muistutetaan, mitkä puhekomennot ja lyhenteet ovat käytössä ja mitä raportille toivotaan. Taidot ovat sinun omiasi ja toimivat kaikissa kohteissa. Uuden taidon voi tuoda ilman sovelluspäivitystä.</p>' +
        (eh.length ? '<section class="card ehdotukset"><div class="card-h"><h2>Kirjuri oppi</h2><span class="meta">' + eh.length + "</span></div>" +
          eh.map((e) => '<div class="row" style="cursor:default;align-items:flex-start"><div class="grow"><div class="t" style="font-weight:600">' + esc(e.teksti) + "</div></div>" +
            '<div style="display:flex;gap:6px;flex:none"><button class="btn btn-sm btn-primary" data-a="hyv" data-id="' + e.id + '">Kyllä</button><button class="btn btn-sm" data-a="hyl" data-id="' + e.id + '">Ei</button></div></div>').join("") + "</section>" : "") +
        (koko.length ? '<section class="card"><div class="card-b">' + koko.map((m) => '<button class="btn btn-block" data-a="kokoa" data-m="' + m + '" style="margin:4px 0">' + icon("plus") + "Kokoa omat opit taidoksi: " + esc(M.menetelma(m).nimi) + "</button>").join("") + "</div></section>" : "") +
        '<section class="card"><div class="card-h"><h2>Taidot</h2><span class="meta">' + Taidot.lista().filter((t) => t.paalla).length + " päällä</span></div>" +
        Taidot.lista().map((t) => {
          const kuv = Taidot.kuvaus(t);
          return '<div class="row taito-rivi"><a class="grow" href="#/taidot/' + encodeURIComponent(t.id) + '" style="color:inherit;text-decoration:none;min-width:0"><div class="t">' + esc(t.nimi || "Nimetön") +
            ' <span class="mp-tag">' + esc(LAHDE[t.lahde] || t.lahde) + "</span></div>" +
            '<div class="s">' + esc(kuv.slice(0, 2).join(" · ")) + (Taidot.kaytto(t.id) ? " · käytetty " + Taidot.kaytto(t.id) + " kertaa" : "") + "</div></a>" +
            '<label class="kytkin" aria-label="Päällä"><input type="checkbox" data-a="paalla" data-id="' + esc(t.id) + '"' + (t.paalla ? " checked" : "") + "><span></span></label></div>";
        }).join("") +
        '<div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap;padding-top:10px">' +
        '<a class="btn" href="#/taidot/uusi">' + icon("plus") + "Uusi taito</a>" +
        '<button class="btn" data-a="liita">' + icon("edit") + "Liitä taito</button>" +
        '<button class="btn" data-a="tiedosto">' + icon("upload") + "Tuo tiedosto</button></div>" +
        '<p class="hint" style="margin:0 14px 12px">Pyydä Claudelta taito (esim. ”tee Kirjuri-taito betonilaatan RH-mittaukseen”) ja liitä vastaus tähän, tai jaa taitotiedosto puhelimessa Kirjuriin.</p></section>' +
        '<section class="card"><div class="card-h"><h2>Käyttö ja kehitys</h2></div><div class="card-b">' +
        (kk.length ? '<table class="mittarit"><tr><th>Kuukausi</th><th>Kirjauksia</th><th>Keskim. kesto</th><th>Korjauksia / kirjaus</th></tr>' +
          kk.map((k) => { const m = mit[k], n = m.kirjauksia || 0; return "<tr><td>" + esc(k) + "</td><td>" + n + "</td><td>" + (n ? Math.round((m.kirjausaikaMs || 0) / n / 1000) + " s" : "–") + "</td><td>" + (n ? ((m.korjauksia || 0) / n).toFixed(2).replace(".", ",") : "–") + "</td></tr>"; }).join("") + "</table>"
          : '<p class="hint" style="margin:0">Luvut kertyvät käytöstä.</p>') +
        '<p class="hint">Vain lukuja: kirjausten määrä ja kesto, korjaukset, kumotut kuvat, Ei tiedossa -merkinnät ja puhekomennot. Kirjausten sisältöä ei tallenneta. Yhteenvedon voi antaa Claudelle kehitysehdotuksia varten.</p>' +
        '<button class="btn btn-block" data-a="yhteenveto">' + icon("download") + "Kopioi yhteenveto</button></div></section>" +
        "</main>";
    }
    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.type === "checkbox") return;
      const a = b.dataset.a;
      if (a === "hyv") { await Taidot.hyvaksy(b.dataset.id); toast("Lisätty omiin oppeihin"); paint(); }
      else if (a === "hyl") { await Taidot.hylkaa(b.dataset.id); paint(); }
      else if (a === "kokoa") { const t = await Taidot.kokoa(b.dataset.m); location.hash = "#/taidot/" + encodeURIComponent(t.id); }
      else if (a === "liita") {
        const v = await UI.promptSheet({ title: "Liitä taito", label: "Liitä Clauden tekemä taito (teksti)", multiline: true, required: true, ok: "Jatka" });
        if (v) { await tuoTeksti(v); paint(); }
      } else if (a === "tiedosto") {
        const f = (await UI.pickFile(".json,.txt,.kirjuri-taito,application/json,text/plain", false))[0];
        if (f) { await tuoTeksti(await f.text()); paint(); }
      } else if (a === "yhteenveto") {
        const t = Taidot.yhteenveto();
        try { await navigator.clipboard.writeText(t); toast("Yhteenveto kopioitu"); } catch (err) { await UI.promptSheet({ title: "Yhteenveto", value: t, multiline: true, ok: "Sulje" }); }
      }
    };
    root.onchange = async (e) => {
      const c = e.target.closest('[data-a="paalla"]');
      if (!c) return;
      const t = Taidot.hae(c.dataset.id); if (!t) return;
      t.paalla = c.checked; await Taidot.tallenna(t, true);
      toast(t.nimi + (t.paalla ? ": päällä" : ": pois"));
    };
    paint();
    S().cleanup = () => { root.onclick = root.onchange = null; };
  }
  const S = () => App.S;

  /* ---------- Muokkaus: lomake rivikielellä ---------- */
  function kentatValituille(mids) {
    const ms = mids.length ? mids.map((id) => M.menetelma(id)) : M.MENETELMAT.filter((m) => !m.piilotettu);
    const out = [];
    ms.forEach((m) => (m.kentat || []).forEach((f) => out.push({ m: m.id, k: f.k, l: f.l, mn: m.nimi })));
    return out;
  }
  function kNimiT(t) {
    return (x) => {
      if (ERIT[x.k]) return ERIT[x.k];
      const ms = x.m ? [x.m] : (t.milloin.menetelmat || []).concat(M.MENETELMAT.map((m) => m.id));
      for (const id of ms) { const f = (M.menetelma(id).kentat || []).find((y) => y.k === x.k); if (f) return f.l; }
      return x.k;
    };
  }
  function etsiKentta(nimi, mids) {
    const n = String(nimi).trim().toLowerCase();
    const er = Object.keys(ERIT).find((k) => ERIT[k].toLowerCase() === n || k === n);
    if (er) return [{ m: undefined, k: er }];
    const l = kentatValituille(mids).filter((f) => f.l.toLowerCase() === n || f.k === n);
    if (!l.length) return null;
    const ms = Array.from(new Set(l.map((f) => f.m)));
    return mids.length === 1 ? [{ m: undefined, k: l[0].k }] : ms.map((m) => ({ m, k: l.find((f) => f.m === m).k }));
  }
  const rivit = (s) => String(s || "").split(/\n/).map((x) => x.trim()).filter(Boolean);

  async function muokkaa(id) {
    const root = document.getElementById("app");
    const uusi = id === "uusi";
    const t = uusi ? Taidot.tyhja({ nimi: "" }) : Taidot.hae(id);
    if (!t) { location.hash = "#/taidot"; return; }
    const mids = (t.milloin.menetelmat || []).slice();
    const kNimi = kNimiT(t);
    const paint = () => {
      root.innerHTML = App.topbar({ title: uusi ? "Uusi taito" : t.nimi || "Taito", sub: "Taito", back: "#/taidot" }) +
        '<main class="view no-nav taito-lomake">' +
        '<label class="field"><span>Nimi</span><input data-f="nimi" value="' + esc(t.nimi) + '" placeholder="esim. Märkätilat rivitalossa"></label>' +
        '<label class="field"><span>Kuvaus</span><textarea data-f="kuvaus" placeholder="Mihin taito on tarkoitettu">' + esc(t.kuvaus) + "</textarea></label>" +
        '<span class="label">Milloin käytössä</span><div class="chips scroll-wrap" style="margin-bottom:6px">' +
        M.MENETELMAT.filter((m) => !m.piilotettu).map((m) => '<button type="button" class="chip" data-m="' + m.id + '" aria-pressed="' + mids.includes(m.id) + '">' + esc(m.nimi) + "</button>").join("") + "</div>" +
        '<p class="hint" style="margin:0 0 6px">Ei valintaa = kaikki kirjaukset.</p>' +
        '<label class="row" style="cursor:pointer"><input type="checkbox" data-f="akk"' + (t.milloin.akk ? " checked" : "") + '> <span class="grow">Vain asuntokaupan kuntotarkastuksessa</span></label>' +
        '<label class="row" style="cursor:pointer;margin-bottom:12px"><input type="checkbox" data-f="kuntoarvio"' + (t.milloin.kuntoarvio ? " checked" : "") + '> <span class="grow">Vain kuntoarviossa</span></label>' +
        '<label class="field"><span>Täytä valmiiksi <span class="u">(rivi: Kenttä = arvo)</span></span><textarea data-f="oletukset" placeholder="Mittaustapa = Porareikä&#10;Tasaantumisaika = 72">' + esc(t.oletukset.map((x) => kNimi(x) + " = " + x.v).join("\n")) + "</textarea></label>" +
        '<label class="field"><span>Kysy aina <span class="u">(kenttä per rivi)</span></span><textarea data-f="kysy">' + esc(t.kysy.map(kNimi).join("\n")) + "</textarea></label>" +
        '<label class="field"><span>Älä kysy <span class="u">(kenttä per rivi; myös Tulos, Suunnitelman kohta)</span></span><textarea data-f="alaKysy">' + esc(t.alaKysy.map(kNimi).join("\n")) + "</textarea></label>" +
        '<p class="hint" style="margin:-6px 0 12px">Kentät: ' + esc(Array.from(new Set(kentatValituille(mids).map((f) => f.l))).slice(0, 40).join(", ")) + "</p>" +
        '<label class="field"><span>Muista <span class="u">(kamerassa ja kirjauksessa)</span></span><textarea data-f="muista">' + esc(t.muista) + "</textarea></label>" +
        '<label class="field"><span>Lyhenteet <span class="u">(rivi: lyhenne = tarkoittaa)</span></span><textarea data-f="lyhenteet" placeholder="pko = pintakosteus&#10;ak = alakatto">' + esc(t.lyhenteet.map((x) => x.sana + " = " + x.tarkoittaa).join("\n")) + "</textarea></label>" +
        '<label class="field"><span>Puhekomennot <span class="u">(rivi: lause = toiminto)</span></span><textarea data-f="komennot" placeholder="märkätila kunnossa = kunnossa">' + esc(t.komennot.map((x) => x.lause + " = " + x.toiminto).join("\n")) + "</textarea></label>" +
        '<p class="hint" style="margin:-6px 0 12px">Toiminnot: ' + esc(Taidot.TOIMINNOT.join(", ")) + ", menetelma:&lt;tunnus&gt;. Komento toimii, kun lause on sanelun lopussa tai yksinään.</p>" +
        '<label class="field"><span>Raportille <span class="u">(ohje raportin laatijalle ja AI:lle)</span></span><textarea data-f="raportille" placeholder="esim. Märkätilat omana alalukunaan, havainto ja kuva peräkkäin.">' + esc(t.raportille) + "</textarea></label>" +
        '<div data-virheet></div>' +
        '<button class="btn btn-primary btn-block" data-a="tallenna">' + icon("ok") + "Tallenna taito</button>" +
        (uusi ? "" : '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" data-a="vie">' + icon("download") + "Vie / jaa</button>" +
          ((t.historia || []).length ? '<button class="btn" data-a="historia">Versiohistoria (' + t.historia.length + ")</button>" : "") +
          (t.id !== Taidot.OMAT ? '<button class="btn btn-danger" data-a="poista">' + icon("trash") + "Poista</button>" : "") + "</div>") +
        "</main>";
    };
    function lue() {
      const v = (f) => root.querySelector('[data-f="' + f + '"]');
      const virheet = [];
      const x = JSON.parse(JSON.stringify(t));
      x.nimi = v("nimi").value.trim(); x.kuvaus = v("kuvaus").value.trim();
      x.milloin = { menetelmat: mids.slice(), akk: v("akk").checked, kuntoarvio: v("kuntoarvio").checked };
      const kentat = (s, arvo) => {
        const out = [];
        rivit(s).forEach((r) => {
          const i = arvo ? r.indexOf("=") : -1;
          const nimi = arvo ? r.slice(0, i).trim() : r;
          if (arvo && i < 0) { virheet.push("Rivillä ”" + r + "” ei ole =-merkkiä"); return; }
          const l = etsiKentta(nimi, mids);
          if (!l) { virheet.push("Kenttää ”" + nimi + "” ei löydy valituista menetelmistä"); return; }
          l.forEach((y) => out.push(arvo ? Object.assign({}, y, { v: r.slice(i + 1).trim() }) : y));
        });
        return out.map((y) => { const z = Object.assign({}, y); if (z.m === undefined) delete z.m; return z; });
      };
      x.oletukset = kentat(v("oletukset").value, true);
      x.kysy = kentat(v("kysy").value, false);
      x.alaKysy = kentat(v("alaKysy").value, false);
      x.muista = v("muista").value.trim(); x.raportille = v("raportille").value.trim();
      x.lyhenteet = rivit(v("lyhenteet").value).map((r) => { const i = r.indexOf("="); if (i < 0) { virheet.push("Lyhenne ”" + r + "”: puuttuu ="); return null; } return { sana: r.slice(0, i).trim().toLowerCase(), tarkoittaa: r.slice(i + 1).trim() }; }).filter(Boolean);
      x.komennot = rivit(v("komennot").value).map((r) => { const i = r.lastIndexOf("="); if (i < 0) { virheet.push("Komento ”" + r + "”: puuttuu ="); return null; } return { lause: r.slice(0, i).trim().toLowerCase(), toiminto: r.slice(i + 1).trim() }; }).filter(Boolean);
      if (!x.nimi) virheet.push("Anna taidolle nimi");
      Taidot.tarkista(Taidot.tyhja(x)).forEach((y) => virheet.push(y));
      return { x, virheet };
    }
    root.onclick = async (e) => {
      const mb = e.target.closest("[data-m]");
      if (mb) { const i = mids.indexOf(mb.dataset.m); if (i >= 0) mids.splice(i, 1); else mids.push(mb.dataset.m); mb.setAttribute("aria-pressed", String(i < 0)); return; }
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "tallenna") {
        const { x, virheet } = lue();
        if (virheet.length) { root.querySelector("[data-virheet]").innerHTML = '<div class="alert">' + icon("alert") + "<div>" + virheet.map(esc).join("<br>") + "</div></div>"; return; }
        if (uusi) x.lahde = "oma";
        await Taidot.tallenna(x);
        toast("Taito tallennettu"); location.hash = "#/taidot";
      } else if (a === "vie") {
        const json = Taidot.vie(t);
        const file = new File([json], (t.nimi || "taito").replace(/[^A-Za-z0-9ÅÄÖåäö_-]+/g, "_") + ".kirjuri-taito.json", { type: "application/json" });
        if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: t.nimi }); return; } catch (err) { if (err && err.name === "AbortError") return; } }
        try { await navigator.clipboard.writeText(json); toast("Taito kopioitu leikepöydälle"); } catch (err) { await UI.promptSheet({ title: "Taito tekstinä", value: json, multiline: true, ok: "Sulje" }); }
      } else if (a === "historia") {
        UI.sheet("<h3>Versiohistoria</h3>" + t.historia.map((v, i) => '<button class="row" data-v="' + i + '"><div class="grow"><div class="t">' + esc(UI.pvm(v.aika)) + " " + new Date(v.aika).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }) + '</div><div class="s">' + esc(Taidot.kuvaus(Taidot.tyhja(v.data)).slice(0, 2).join(" · ")) + "</div></div>Palauta</button>").join(""),
          (el, close) => el.querySelectorAll("[data-v]").forEach((x) => x.addEventListener("click", async () => {
            const v = t.historia[+x.dataset.v].data; close();
            await Taidot.tallenna(Object.assign({}, v, { id: t.id })); toast("Versio palautettu"); App.render();
          })));
      } else if (a === "poista") {
        if (!(await confirmSheet({ title: "Poistetaanko taito ”" + t.nimi + "”?", ok: "Poista", danger: true }))) return;
        await Taidot.poista(t.id); location.hash = "#/taidot";
      }
    };
    paint();
    App.S.cleanup = () => { root.onclick = null; };
  }

  window.TaidotNakyma = { view, muokkaa, tuoTeksti };
})();
