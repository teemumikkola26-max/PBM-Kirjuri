/* =========================================================================
   check.js – Lähtötarkistus
   Kokoaa puutteet tutkimussuunnitelmaa, tiloja ja havaintojen pakollisia
   tietoja vasten. Vienti avautuu, kun puutteet on tehty tai perusteltu.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, promptSheet, confirmSheet, nro, toast } = UI;
  const { S, Model } = App;

  function tyhja(v) { return v == null || String(v).trim() === ""; }

  /* Palauttaa listan: { tyyppi, id, otsikko, selite, toiminto, toimintoTeksti } */
  function puutteet() {
    const k = S.kohde;
    if (!k) return [];
    const out = [];

    k.suunnitelma.forEach((p) => {
      if (Model.kohtaValmis(p)) return;
      const tehty = Model.kohtaTehty(p);
      out.push({
        tyyppi: "kohta", id: p.id, otsikko: Model.kohtaNimi(p),
        selite: "Suunnitelmassa " + (p.maara || 1) + ", tehty " + tehty + "." + (p.naytteet ? " Näytteitä " + p.naytteet + ", otettu " + Model.kohtaNaytteet(p) + "." : ""),
        toimintoTeksti: "Tee nyt"
      });
    });

    k.tilat.forEach((t) => {
      if (Model.tilaStatus(t) !== "ei_tutkittu") return;
      const kerros = Model.kerros(t.kerrosId);
      out.push({
        tyyppi: "tila", id: t.id, otsikko: "Tila " + Model.tilaNimi(t),
        selite: (kerros ? kerros.nimi + ". " : "") + "Ei havaintoja eikä merkintää.",
        toimintoTeksti: "Tarkasta"
      });
    });

    S.havainnot.forEach((h) => {
      const m = M.menetelma(h.menetelma);
      const puuttuu = havaintoPuutteet(h);
      if (!puuttuu.length) return;
      out.push({
        tyyppi: "havainto", id: h.id, otsikko: nro(h) + " · " + (Model.sijaintiTeksti(h.sijainti) || m.nimi),
        selite: "Puuttuu: " + puuttuu.join(", ") + ".",
        toimintoTeksti: "Täydennä"
      });
    });

    if (window.Kuntoarvio) Kuntoarvio.puutteet().forEach((x) => out.push(x));
    if (window.AKK) AKK.puutteet().forEach((x) => out.push(x));
    (k.seuranta || []).forEach((x) => {
      const puuttuu = Seuranta.puutteet(x);
      if (!puuttuu.length || puuttuu.length === 4) return;   // täysin tyhjä luonnos ei ole puute
      const t = Model.tila(x.sijainti.tilaId);
      out.push({
        tyyppi: "seuranta", id: x.id, otsikko: (Seuranta.tunnus(x) || "Mittalaite") + (t ? " · " + Model.tilaNimi(t) : ""),
        selite: "Puuttuu: " + puuttuu.join(", ") + ".",
        toimintoTeksti: "Täydennä"
      });
    });
    return out;
  }

  /* Yhden havainnon puuttuvat tiedot rakenteisena: { key, l, tyyppi, f? }.
     "Ei tiedossa" -kuitatut (h.eiTiedossa) eivät ole puutteita. */
  function havaintoAukot(h) {
    const k = S.kohde || { suunnitelma: [] };
    const m = M.menetelma(h.menetelma);
    const ohi = new Set(h.eiTiedossa || []);
    const out = [];
    const lisaa = (key, l, tyyppi, f) => { if (!ohi.has(key)) out.push({ key, l, tyyppi, f }); };
    if (!h.kuvat.length && !h.sanelu && !(h.aanitteet || []).length) lisaa("kuva", "kuva tai sanelu", "kuva");
    if (!h.sijainti || !h.sijainti.tilaId) lisaa("tila", "tila", "tila");
    if (!h.menetelma) lisaa("menetelma", "menetelmä", "menetelma");
    if (!h.tulos && !m.tulosVapaa && Asetukset.get("tark.tulos")) lisaa("tulos", "tulos", "tulos");     // näytteen tulos tulee laboratoriosta
    M.kentat(h).forEach((f) => {
      if (f.t === "table") {
        const rows = M.rivit(h, f);
        if (f.req && !rows.length) { lisaa("k:" + f.k, f.l.toLowerCase(), "taulukko", f); return; }
        const pcols = (f.sarakkeet || []).filter((c) => c.req && !c.ryhma);
        const vajaat = rows.filter((r) => pcols.some((c) => tyhja(r[c.k])) && Meter.rowState(r) !== "reading").length;
        if (vajaat) lisaa("k:" + f.k + ":vajaat", "puuttuvia lukemia (" + vajaat + " riviä)", "taulukko", f);
        const g = M.ryhmaSarake(f);
        if (g && rows.some((r) => tyhja(r[g.k]))) lisaa("k:" + f.k + ":ryhma", g.l.toLowerCase() + " puuttuu riviltä", "taulukko", f);
        Meter.rowIssues(h, f).forEach((x, i) => lisaa("k:" + f.k + ":r" + i, x, "taulukko", f));
        return;
      }
      if (f.req && tyhja(h.kentat[f.k])) lisaa("k:" + f.k, f.l.toLowerCase(), "kentta", f);
    });
    if (m.id === "avaus" && !h.kuvat.length) lisaa("avauskuva", "kuva avauksesta", "kuva");
    // Kuntoarvio ja AKK: havainto kuuluu osioon (sanelusta), ei suunnitelman kohtaan
    const akk = window.AKK && AKK.aktiivinen(), ka = window.Kuntoarvio && Kuntoarvio.aktiivinen();
    if (akk && !h.akkOsa) lisaa("akkOsa", "kuntotarkastuksen osio", "osio");
    else if (ka && !akk && !h.kaOsa) lisaa("kaOsa", "kuntoarvion rakennusosa", "osio");
    if (k.suunnitelma.length && !h.suunnitelmaId && !akk && !ka) lisaa("kohta", "suunnitelman kohta", "kohta");
    if (window.Taidot) Taidot.aukot(h, out, lisaa);          // käyttäjän taidot: kysy / älä kysy
    return out;
  }
  function havaintoPuutteet(h) { return havaintoAukot(h).map((x) => x.l); }

  function yhteenveto(list) {
    const n = (t) => list.filter((x) => x.tyyppi === t).length;
    const parts = [];
    if (n("kohta")) parts.push(n("kohta") + " suunnitelman kohtaa tekemättä");
    if (n("tila")) parts.push(n("tila") + (n("tila") === 1 ? " tila" : " tilaa") + " tutkimatta");
    if (n("havainto")) parts.push(n("havainto") + (n("havainto") === 1 ? " havainnosta" : " havainnosta") + " puuttuu tietoja");
    if (n("kuntoarvio")) parts.push("kuntoarvio kesken");
    if (n("akk")) parts.push("kuntotarkastus kesken");
    if (n("seuranta")) parts.push(n("seuranta") + (n("seuranta") === 1 ? " mittalaitteelta" : " mittalaitteelta") + " puuttuu tietoja");
    return parts.join(", ") + ".";
  }

  async function view() {
    const k = S.kohde;
    const list = puutteet();
    await Model.ensureUrls(list.filter((x) => x.tyyppi === "havainto").map((x) => { const h = Model.havainto(x.id); return h && h.kuvat[0]; }).filter(Boolean));
    const cnt = { tarkastettu: 0, poikkeama: 0, ei_paasya: 0, ei_tutkittu: 0 };
    k.tilat.forEach((t) => { cnt[Model.tilaStatus(t)]++; });
    const rajattu = cnt.ei_paasya + k.suunnitelma.filter((p) => p.pois).length;
    const tile = (n, l, cls) => '<div class="ct ' + cls + '"><b>' + n + "</b><span>" + l + "</span></div>";

    // Ryhmät kortteina; pitkät ryhmät (esim. 20 tilaa) taitettuina yhteenvedoksi
    const groups = [
      ["kohta", "Suunnitelma", (n) => n + " kesken"],
      ["havainto", "Havainnot", (n) => n + " puutteellinen"],
      ["tila", "Tilat", (n) => n + " tutkimatta"],
      ["seuranta", "Olosuhdeseuranta", (n) => n + " puutteellinen"],
      ["kuntoarvio", "Kuntoarvio", () => "kesken"],
      ["akk", "Kuntotarkastus", () => "kesken"]
    ];
    let body = "";
    groups.forEach(([t, title, sel]) => {
      const items = list.filter((x) => x.tyyppi === t);
      if (!items.length) return;
      const auki = items.length <= 3 && t !== "tila" || (t === "tila" && items.length <= 2);
      body += '<details class="card vocab ct-ryhma"' + (auki ? " open" : "") + '><summary class="card-h"><h2>' + esc(title) + '</h2><span class="meta">' + esc(sel(items.length)) + "</span></summary><div class=\"card-b\">";
      if (t === "tila" && items.length > 1) body += '<button class="btn btn-sm btn-block" data-a="eipAll" style="margin-bottom:10px">Merkitse kaikki ' + items.length + " tilaa: ei pääsyä + yhteinen syy</button>";
      items.forEach((x) => {
        const hv = t === "havainto" ? Model.havainto(x.id) : null;
        const needTulos = hv && !hv.tulos && !M.menetelma(hv.menetelma).tulosVapaa;
        const img = hv && hv.kuvat[0] ? '<img class="todo-img" src="' + Model.url(hv.kuvat[0]) + '" alt="">' : "";
        body += '<div class="todo"><div class="tt">' + img + '<div><div class="t">' + esc(x.otsikko) + '</div><div class="s">' + esc(x.selite) + "</div></div></div>" +
          '<div class="acts">' +
          (needTulos ? '<button class="btn btn-sm" data-a="qtulos" data-v="poikkeama" data-id="' + x.id + '">Poikkeama</button><button class="btn btn-sm" data-a="qtulos" data-v="ok" data-id="' + x.id + '">Ei huomautettavaa</button>' : "") +
          '<button class="btn btn-sm btn-dark" data-a="do" data-t="' + t + '" data-id="' + x.id + '">' + esc(x.toimintoTeksti) + "</button>" +
          (t === "kohta" ? '<button class="btn btn-sm" data-a="pois" data-id="' + x.id + '">Jätä pois + syy</button>' : "") +
          (t === "tila" ? '<button class="btn btn-sm" data-a="eip" data-id="' + x.id + '">Ei pääsyä + syy</button>' : "") +
          (t === "akk" ? '<button class="btn btn-sm btn-primary" data-a="akkLoput">Merkitse loput kunnossa</button>' : "") +
          "</div></div>";
      });
      body += "</div></details>";
    });

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Viimeistele kohde", sub: "Tarkista ennen kuin lähdet", back: "#/k/" + k.id }) +
      '<main class="view">' +
      '<div class="ct-tiles">' + tile(S.havainnot.length, "havaintoa", "ok") + tile(list.length, "täydennettävää", list.length ? "warn" : "ok") + tile(rajattu, "rajattu", "skip") + "</div>" +
      ((k.seuranta || []).filter((x) => x.nro && !x.loppu).length ? '<div class="alert info">' + icon("alert") + "<div><b>Seurannassa " + (k.seuranta || []).filter((x) => x.nro && !x.loppu).length +
        " mittalaitetta:</b> " + esc((k.seuranta || []).filter((x) => x.nro && !x.loppu).map((x) => Seuranta.tunnus(x)).join(", ")) + ". Muista noutaa laitteet ja merkitä Seuranta päättyi.</div></div>" : "") +
      (!k.suunnitelma.length ? '<div class="alert info">' + icon("alert") + "<div>Tutkimussuunnitelmaa ei ole kirjattu, joten tarkistus kattaa vain tilat ja havainnot.</div></div>" : "") +
      (list.length ? body : '<div class="done-ok">' + icon("ok") + "Ei puutteita. Aineisto on valmis vietäväksi.</div>") +
      '<div style="margin-top:18px"><button class="btn btn-primary btn-block" data-a="' + (list.length ? "exportAnyway" : "export") + '">' + icon("download") + "Vie aineisto raportointiin</button>" +
      '<p class="hint" style="text-align:center">Kuvat, sanelut ja vahvistetut tiedot ZIP-pakettina raportointiin.' + (list.length ? " Avoimet kohdat (" + list.length + ") listataan pakettiin." : "") + "</p>" +
      '<a class="btn btn-block" href="#/k/' + k.id + '/word" style="margin-top:10px">' + icon("list") + "Word-raportti yrityksen pohjasta</a>" +
      "</div></main>" + App.bottomnav("lahto");

    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a, id = b.dataset.id;
      if (a === "qtulos") {
        const hv = Model.havainto(id);
        hv.tulos = b.dataset.v; Auto.manual(hv, "tulos");
        await Model.saveHavainto(hv); App.render(); return;
      }
      if (a === "do") {
        if (b.dataset.t === "kohta") App.kohtaActions(Model.kohta(id));
        else if (b.dataset.t === "tila") Plan.roomActions(Model.tila(id));
        else if (b.dataset.t === "kuntoarvio") location.hash = "#/k/" + k.id + "/kuntoarvio";
        else if (b.dataset.t === "akk") location.hash = "#/k/" + k.id + "/akk";
        else if (b.dataset.t === "seuranta") location.hash = "#/k/" + k.id + "/seuranta/" + id;
        else location.hash = "#/k/" + k.id + "/h/" + id + "?puutteet=1";
      } else if (a === "akkLoput") {
        // K3.3: kuittaus yhteenvetona; osio ilman havaintoja ja merkintöjä on kunnossa (ei huomautettavaa)
        const n = AKK.OSIOT.filter((d) => !AKK.kayty(d.id));
        n.forEach((d) => { AKK.tila(d.id).kayty = true; });
        await Model.saveKohde(); toast(n.length + (n.length === 1 ? " osio merkitty" : " osiota merkitty") + " kunnossa"); App.render();
      } else if (a === "pois") {
        const syy = await promptSheet({ title: "Miksi kohta jätetään pois?", label: "Syy (näkyy raportissa rajauksena)", required: true, multiline: true });
        if (syy == null) return;
        Model.kohta(id).pois = { syy, aika: Date.now() };
        await Model.saveKohde(); App.render();
      } else if (a === "eip") {
        const syy = await promptSheet({ title: "Miksi tilaan ei päässyt?", label: "Syy (näkyy raportissa rajauksena)", required: true });
        if (syy == null) return;
        Model.tila(id).merkinta = { tila: "ei_paasya", syy, aika: Date.now() };
        await Model.saveKohde(); App.render();
      } else if (a === "eipAll") {
        const ids = list.filter((x) => x.tyyppi === "tila").map((x) => x.id);
        const syy = await promptSheet({ title: "Tutkimatta jääneet tilat (" + ids.length + ")", label: "Syy (näkyy raportissa rajauksena), esim. Ei kuulu tutkimukseen", required: true });
        if (syy == null) return;
        ids.forEach((tid) => { const tt = Model.tila(tid); if (tt) tt.merkinta = { tila: "ei_paasya", syy, aika: Date.now() }; });
        await Model.saveKohde(); App.render();
      } else if (a === "export") {
        await Export.run(false);
      } else if (a === "exportAnyway") {
        if (!(await confirmSheet({ title: "Viedäänkö keskeneräisenä?", text: "Avoimet puutteet (" + list.length + ") listataan pakettiin, ja AI-työkalua ohjeistetaan käsittelemään ne rajauksina tai puuttuvina tietoina.", ok: "Vie keskeneräisenä" }))) return;
        await Export.run(true);
      }
    };
    S.cleanup = () => { root.onclick = null; };
  }

  window.Check = { puutteet, havaintoPuutteet, havaintoAukot, yhteenveto, view };
})();
