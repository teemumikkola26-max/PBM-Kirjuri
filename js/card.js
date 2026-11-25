/* =========================================================================
   card.js – Havaintokortti
   Erottaa toisistaan: havainto (sanelu), mittaustulokset (vahvistettava),
   tutkijan alustava tulkinta. Tallentuu automaattisesti.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet, nro } = UI;
  const { S, Model } = App;

  function fieldHtml(f, val, fromDict, need) {
    const lbl = '<span>' + esc(f.l) + (f.u ? ' <span class="u">(' + esc(f.u) + ")</span>" : "") + (f.req ? ' <span class="req" aria-label="pakollinen">*</span>' : "") +
      (fromDict ? ' <span class="mp-tag">' + (fromDict === "taito" ? "taidosta" : "sanelusta") + "</span>" : "") + "</span>";
    const nh = need ? '<span class="need-hint">Puuttuu · sano esim. ”' + esc(window.FieldFill ? FieldFill.hint(f) : "") + "”</span>" : "";
    const cls = need ? "field need" : "field";
    return fieldInner(f, val, lbl, cls, nh);
  }
  /* Valintalistaan voi aina kirjoittaa oman arvon (Muu…), paitsi arviointiasteikoissa (kyllä/ei, hyvä/huono) */
  const ARVIO = /^(Kyllä|Ei|Hyvä|Tyydyttävä|Välttävä|Huono|Otettu|Ei otettu)$/;
  const vapaa = (f) => !f.okv && !f.suljettu && !(f.o || []).every((o) => ARVIO.test(o));
  function fieldInner(f, val, lbl, cls, nh) {
    const oma = val && !(f.o || []).includes(val);
    const ph = f.ph ? ' placeholder="' + esc(f.ph) + '"' : "";
    // Monivalinta: useampi siru voi olla valittuna (arvo "M2; DG18")
    if (f.t === "multi") {
      const sel = String(val || "").split(/\s*;\s*/).filter(Boolean);
      return '<div class="' + cls + ' chipfield" style="grid-column:1/-1">' + lbl + '<div class="chips">' +
        (f.o || []).concat(sel.filter((v) => !(f.o || []).includes(v))).map((o) => '<button type="button" class="chip" data-a="multiv" data-k="' + f.k + '" data-v="' + esc(o) + '" aria-pressed="' + sel.includes(o) + '">' + esc(o) + "</button>").join("") +
        "</div>" + nh + "</div>";
    }
    // Laskettu arvo: sovellus laskee, tutkija ei kirjoita
    if (f.t === "calc") {
      return '<label class="' + cls + '">' + lbl + '<input type="text" readonly tabindex="-1" class="calc" data-fk="' + f.k + '" value="' + esc(val || "") + '" placeholder="lasketaan">' +
        '<span class="hint" style="font-size:12px">' + esc(M.kaavaSelite(f)) + "</span></label>";
    }
    if (f.t === "time") {
      return '<label class="' + cls + '">' + lbl + '<input type="time" data-fk="' + f.k + '" value="' + esc(val || "") + '">' + nh + "</label>";
    }
    // Tarkistuslistan valinta sirurivinä: yksi napautus (napautus uudelleen tyhjentää)
    if (f.t === "select" && f.ow && !f.ryhmat) {
      return '<div class="' + cls + ' chipfield" style="grid-column:1/-1">' + lbl + '<div class="chips">' +
        f.o.map((o) => '<button type="button" class="chip' + (f.okv ? (o === f.okv ? " c-ok" : " c-note") : "") + '" data-a="chipv" data-k="' + f.k + '" data-v="' + esc(o) + '" aria-pressed="' + (o === val) + '">' + esc(o) + "</button>").join("") +
        (oma ? '<button type="button" class="chip" data-a="chipv" data-k="' + f.k + '" data-v="' + esc(val) + '" aria-pressed="true">' + esc(val) + "</button>" : "") +
        (vapaa(f) ? '<button type="button" class="chip chip-muu" data-a="muuarvo" data-k="' + f.k + '">Muu…</button>' : "") +
        "</div>" + nh + "</div>";
    }
    if (f.t === "select") {
      const opt = (o) => '<option' + (o === val ? " selected" : "") + ">" + esc(o) + "</option>";
      return '<label class="' + cls + '"' + (f.ryhmat ? ' style="grid-column:1/-1"' : "") + ">" + lbl + '<select data-fk="' + f.k + '"><option value="">Valitse</option>' +
        (f.ryhmat ? f.ryhmat.map(([g, os]) => '<optgroup label="' + esc(g) + '">' + os.map(opt).join("") + "</optgroup>").join("") : f.o.map(opt).join("")) +
        (oma ? '<option selected>' + esc(val) + "</option>" : "") +
        (vapaa(f) ? '<option value="__muu__">Muu… (kirjoita)</option>' : "") + "</select>" + nh + "</label>";
    }
    if (f.t === "textarea") {
      return '<label class="' + cls + '" style="grid-column:1/-1">' + lbl + '<textarea data-fk="' + f.k + '"' + ph + ' style="min-height:72px">' + esc(val || "") + "</textarea>" + nh + "</label>";
    }
    if (f.t === "date") {
      return '<label class="' + cls + '">' + lbl + '<input type="date" data-fk="' + f.k + '" value="' + esc(val || "") + '">' + nh + '</label>';
    }
    const num = f.t === "num";
    return '<label class="' + cls + '">' + lbl + '<input type="text" ' + (num ? 'inputmode="decimal" ' : "") + 'data-fk="' + f.k + '"' + ph + ' value="' + esc(val || "") + '">' + nh + '</label>';
  }

  function hasMittaus(h) { return M.onMittauksia(h); }

  function fiNum(v, d) {
    if (v == null || isNaN(v)) return "";
    return Number(v).toFixed(d).replace(".", ",");
  }
  function num(v) { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? null : n; }

  async function view(id) {
    const k = S.kohde;
    const h = Model.havainto(id);
    if (!h) { location.hash = "#/k/" + k.id; return; }
    // Tarkistuslomake: tilasta pääteltävät tiedot (märkätilan tyyppi, asunto) valmiiksi
    if (window.FieldFill && M.menetelma(h.menetelma).lomake && FieldFill.apply(h).length) await Model.saveHavainto(h);
    const kerrosH = h.sijainti && Model.kerros(h.sijainti.kerrosId);
    await Model.ensureUrls(h.kuvat.concat(h.aanitteet || [], kerrosH && kerrosH.planId && h.sijainti.piste ? [kerrosH.planId] : []));
    for (const f of M.menetelma(h.menetelma).kentat.filter((x) => x.t === "table")) {
      await Model.ensureUrls(M.rivit(h, f).map((r) => r._ocr && r._ocr.rajaus).filter(Boolean));
    }

    const root = document.getElementById("app");
    const save = UI.debounce(async () => { await Model.saveHavainto(h); refreshMissing(); }, 400);
    let picker = null;
    // Puutteet näytetään vasta, kun tutkija yrittää sulkea havainnon (tai on avannut sen puutelistasta)
    let lisaAuki = false;

    function selectMethod(id, eiOpi) {
      if (h.menetelma === id) return;
      if (!eiOpi && window.Taidot) Taidot.korjattuMenetelma(h.sanelu, id);
      h.menetelma = id;
      h.vahvistettu = false;
      // muistetut arvot ja oletukset (esim. pumppu, halkaisija) valmiiksi
      M.taytaMuisti(h, Model);
      if (window.FieldFill) FieldFill.apply(h);
      M.laske(h);
      const cur = Model.kohta(h.suunnitelmaId);
      if (cur && !Model.kohtaSopii(cur, h.menetelma)) { h.suunnitelmaId = null; if (h.auto) h.auto.kohta = true; }
      Auto.manual(h, "menetelma");
      Auto.autoKohta(h); Auto.autoTunnus(h);
      save(); paint();
    }

    function kohtaOptions() {
      const own = k.suunnitelma.filter((p) => Model.kohtaSopii(p, h.menetelma));
      const other = k.suunnitelma.filter((p) => !Model.kohtaSopii(p, h.menetelma));
      const opt = (p) => '<option value="' + p.id + '"' + (h.suunnitelmaId === p.id ? " selected" : "") + ">" + esc(Model.kohtaNimi(p)) + " (" + Model.kohtaMaaraTeksti(p) + ")</option>";
      return '<option value="">Valitse</option>' + own.map(opt).join("") +
        (other.length ? '<optgroup label="Muut menetelmät">' + other.map(opt).join("") + "</optgroup>" : "") +
        '<option value="ei"' + (h.suunnitelmaId === "ei" ? " selected" : "") + ">Ei suunnitelmassa</option>";
    }

    /* Sanelusta tunnistetut tiedot (menetelmä, tila, rakenneosa, tulos) */
    async function runAuto() {
      const changes = await Auto.apply(h);
      if (!changes.length) return;
      const shown = changes.filter((c) => ["menetelmä", "tulos", "tila", "rakenneosa", "rakennusosa", "kenttä", "taulukko"].includes(c.kentta));
      if (shown.length) toast("Sanelusta: " + shown.slice(0, 3).map((c) => c.arvo).join(", ") + (shown.length > 3 ? " ja " + (shown.length - 3) + " muuta" : ""), 3000);
      save(); paint();
    }

    const extraFields = new Set();
    /* Alimenetelmät: tämän havainnon sisällä tehdyt menetelmät (esim. avauksesta RH-mittaus ja näyte).
       Alimenetelmä perii sijainnin ja suunnitelman kohdan; raportilla se esitetään tämän havainnon osana. */
    const ALI_KAIKKI = ["aisti", "pintakosteus", "rh", "nayte", "avaus", "merkkiaine", "lampokuvaus"];
    function aliValinnat() {
      const m = M.menetelma(h.menetelma);
      if (!h.menetelma || M.taso(m) === "kohde") return [];
      let ids = M.alimenetelmat(m);
      if (ids.includes("*")) ids = ALI_KAIKKI;
      return ids.filter((id) => id !== h.menetelma && M.MENETELMAT.some((x) => x.id === id && !x.piilotettu && !x.kohdetaso));
    }
    function lapset() {
      const tun = h.menetelma === "avaus" && h.kentat.tunnus;
      return S.havainnot.filter((x) => x.id !== h.id && (x.emo === h.id || (tun && !x.emo && x.menetelma === "nayte" && x.kentat.avaus === tun)));
    }
    // Alimenetelmä: kamera aukeaa, sijainti ja suunnitelman kohta periytyvät tältä havainnolta
    async function aliAloita(mid) {
      save.flush();
      S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa, menetelma: mid };
      await Model.saveKohde();
      const p = Model.kohta(h.suunnitelmaId);
      location.hash = "#/k/" + k.id + "/kuvaus?menetelma=" + mid + "&emo=" + h.id + (p && Model.kohtaSopii(p, mid) ? "&kohta=" + p.id : "") +
        (h.sijainti.tilaId ? "&tila=" + h.sijainti.tilaId : "") + (h.sijainti.kerrosId ? "&kerros=" + h.sijainti.kerrosId : "") +
        (h.menetelma === "avaus" && mid === "nayte" && h.kentat.tunnus ? "&avaus=" + encodeURIComponent(h.kentat.tunnus) : "");
    }
    function aliHtml() {
      const emo = h.emo && Model.havainto(h.emo), ls = lapset(), val = aliValinnat();
      if (!emo && !ls.length && !val.length) return "";
      const rivi = (x) => '<button class="row" data-a="avaahav" data-id="' + x.id + '" style="width:100%;text-align:left;background:none;border:0;padding:8px 0"><div class="grow"><div class="t">' +
        esc(nro(x) + " · " + M.menetelma(x.menetelma).nimi + (x.kentat.tunnus ? " " + x.kentat.tunnus : "")) + '</div><div class="s">' +
        esc([x.kentat.tyyppi, x.tulos ? M.TULOKSET[x.tulos] : ""].filter(Boolean).join(" · ") || (x.sanelu || "").slice(0, 60)) + "</div></div>" + icon("back", "flip") + "</button>";
      return '<section class="card ali"><div class="card-b">' +
        (emo ? '<p class="hint" style="margin:0 0 8px">Osa havaintoa ' + '<button class="link" data-a="avaahav" data-id="' + emo.id + '">' + esc(nro(emo) + " " + M.menetelma(emo.menetelma).nimi + (emo.kentat.tunnus ? " " + emo.kentat.tunnus : "")) + "</button></p>" : "") +
        (ls.length ? '<span class="label">Tässä tehty</span>' + ls.map(rivi).join("") : "") +
        (val.length ? '<span class="label" style="margin-top:6px">Tee samassa kohdassa myös' + (h.kentat.tunnus ? " (" + esc(h.kentat.tunnus) + ")" : "") + '</span><div class="chips">' +
          val.map((id) => '<button class="chip" data-a="ali" data-m="' + id + '">' + icon("cam") + " " + esc(M.menetelma(id).nimi) + "</button>").join("") + "</div>" +
          // Minkä tahansa kohtatason menetelmän voi lisätä (taulukko: Taso)
          '<select data-a="alimuu" style="margin-top:8px"><option value="">Muu menetelmä…</option>' + M.havaintoMenetelmat().filter((x) => x.id !== h.menetelma && !val.includes(x.id) && M.taso(x) !== "kohde")
            .map((x) => '<option value="' + x.id + '">' + esc(x.nimi) + "</option>").join("") + "</select>" : "") +
        "</div></section>";
    }
    function suggestions() {
      const m = M.menetelma(h.menetelma);
      const units = new Set(m.kentat.filter((f) => f.u).map((f) => f.u));
      return M.lukuehdotukset(h.sanelu).filter((s) => units.has(s.u));
    }

    /* ---------- Kirjausnäkymä (Kirjuri):
       1. kuvat ja sijainti, 2. yksi havaintoteksti ja siitä poimitut tiedot,
       3. Raporttia varten vielä: vain puuttuvat, napautus avaa vastauksen,
       4. Kaikki tiedot (menetelmän kentät, tulkinta, alimenetelmät) suljettuna. ---------- */
    let aukkoAuki = /[?&]puutteet=1/.test(location.hash) ? "__eka" : null;

    function miniPohjaHtml() {
      const p = h.sijainti && h.sijainti.piste, ke = h.sijainti && Model.kerros(h.sijainti.kerrosId);
      if (!p || !ke || !ke.planId || !Model.url(ke.planId)) return "";
      return '<button class="minipohja" data-a="loc" aria-label="Sijainti pohjakuvalla"><img src="' + Model.url(ke.planId) + '" alt="" style="transform:translate(-' + (p.x * 100).toFixed(2) + "%,-" + (p.y * 100).toFixed(2) + '%)"><span class="mp-dot">' + esc(UI.nroLyhyt(h)) + "</span></button>";
    }

    function poimitutHtml() {
      const a = h.auto || {}, m = M.menetelma(h.menetelma), out = [];
      const chip = (key, l, v) => out.push('<button class="chip poim" data-a="poim" data-k="' + esc(key) + '">' + (l ? "<span>" + esc(l) + "</span> " : "") + "<b>" + esc(v) + "</b></button>");
      if (h.menetelma && a.menetelma === "sanelu") chip("menetelma", "", m.nimi);
      if (h.sijainti && h.sijainti.tilaId && a.tila === "sanelu") chip("tila", "", Model.sijaintiTeksti(h.sijainti));
      if (h.tulos && a.tulos === "sanelu") chip("tulos", "", M.TULOKSET[h.tulos] || h.tulos);
      M.kentat(h).forEach((f) => {
        if (a["k:" + f.k] !== "sanelu") return;
        if (f.t === "table") { const n = M.rivit(h, f).length; if (n) chip("k:" + f.k, f.l, n + (n === 1 ? " rivi" : " riviä")); return; }
        const v = h.kentat[f.k];
        if (v != null && String(v).trim() !== "") chip("k:" + f.k, f.l, v + (f.u ? " " + f.u : ""));
      });
      ["akkOsa", "kaOsa"].forEach((key) => {
        if (!h[key] || a[key] !== "sanelu") return;
        if (key === "akkOsa" && window.AKK) { const d = AKK.OSIOT.find((x) => x.id === h.akkOsa); if (d) chip(key, "Osio", d.luku + " " + d.nimi); }
        if (key === "kaOsa" && window.KAData) { const d = KAData.OSAT.find((x) => x.id === h.kaOsa); if (d) chip(key, "Osa", d.nimi); }
      });
      return out.length ? '<div class="poimitut"><span class="label">Tekstistä poimittu · napauta korjataksesi</span><div class="chips">' + out.join("") + "</div></div>" : "";
    }

    function aukkoEditori(x) {
      let body = "";
      if (x.tyyppi === "tila") body = '<button class="btn btn-block" data-a="loc" style="justify-content:flex-start">' + icon("pin") + "Valitse tila" + (h.sijainti && h.sijainti.kerrosId ? " (" + esc((Model.kerros(h.sijainti.kerrosId) || {}).nimi || "") + ")" : "") + "</button>";
      else if (x.tyyppi === "menetelma") {
        const ids = [];
        k.suunnitelma.forEach((p) => (p.menetelmat || [p.menetelma]).forEach((id) => { if (id && !ids.includes(id) && M.MENETELMAT.some((mm) => mm.id === id)) ids.push(id); }));
        body = '<div class="chips">' + ids.slice(0, 8).map((id) => '<button class="chip" data-a="men" data-v="' + id + '">' + esc(M.menetelma(id).nimi) + "</button>").join("") +
          '<button class="chip" data-a="menetelma">Muu…</button></div>';
      }
      else if (x.tyyppi === "tulos") body = '<div class="chips"><button class="chip c-note" data-a="tulos" data-v="poikkeama">Poikkeama</button><button class="chip c-ok" data-a="tulos" data-v="ok">Ei huomautettavaa</button></div>';
      else if (x.tyyppi === "osio" && x.key === "akkOsa") body = '<label class="field"><span>Kuntotarkastuksen osio</span><select data-a="akkosa"><option value="">Valitse</option>' +
        AKK.OSIOT.map((d) => '<option value="' + d.id + '">' + esc(d.luku + " " + d.nimi) + "</option>").join("") + "</select></label>";
      else if (x.tyyppi === "osio") body = '<label class="field"><span>Kuntoarvion rakennusosa</span><select data-a="kaosa"><option value="">Valitse</option>' +
        KAData.RYHMAT.map((r) => '<optgroup label="' + esc(r.nimi) + '">' + KAData.OSAT.filter((d) => d.r === r.id).map((d) => '<option value="' + d.id + '">' + esc(d.nimi) + "</option>").join("") + "</optgroup>").join("") + "</select></label>";
      else if (x.tyyppi === "kohta") body = '<label class="field"><span>Tutkimussuunnitelman kohta</span><select data-a="kohta">' + kohtaOptions() + "</select></label>";
      else if (x.tyyppi === "kentta") body = '<div class="grid2">' + fieldHtml(x.f, h.kentat[x.f.k] != null ? h.kentat[x.f.k] : "", false, false) + "</div>";
      else if (x.tyyppi === "taulukko") body = tableHtml(x.f, false);
      const hint = x.f && window.FieldFill ? FieldFill.hint(x.f) : "";
      return '<div class="aukko-ed">' + body +
        (hint ? '<p class="hint" style="margin:8px 0 0">Sanele esim. ”' + esc(hint) + "”</p>" : "") +
        '<div class="aukko-nap">' +
        '<button type="button" class="btn btn-sm dict-btn" data-dictbtn="aukko" aria-label="Sanele: pidä pohjassa">' + icon("mic") + '<span data-dl="aukko">Sanele</span></button>' +
        '<a class="btn btn-sm" href="#/k/' + k.id + "/kuvaus/" + h.id + '">' + icon("cam") + "Ota kuva</a>" +
        (x.tyyppi !== "kuva" ? '<button class="btn btn-sm" data-a="eitied" data-k="' + esc(x.key) + '">Ei tiedossa</button>' : "") +
        '<button class="btn btn-sm btn-primary" data-a="aukkook">OK</button></div>' +
        '<div class="dict-prev" data-prev="aukko"></div></div>';
    }

    function aukotHtml() {
      const au = Check.havaintoAukot(h);
      if (aukkoAuki === "__eka") aukkoAuki = au[0] ? au[0].key : null;
      const ohi = h.eiTiedossa || [];
      if (!au.length) {
        return '<section class="card aukot ok"><div class="card-b">' + icon("ok") + " <b>Raporttia varten kaikki tarvittava on kirjattu.</b>" +
          (ohi.length ? ' <button class="link" data-a="eitiedpalauta">Ei tiedossa: ' + ohi.length + " · palauta</button>" : "") + "</div></section>";
      }
      return '<section class="card aukot"><div class="card-h"><h2>Raporttia varten vielä</h2><span class="meta" data-aukot-n>' + au.length + "</span></div>" +
        au.map((x) => '<div class="aukko' + (aukkoAuki === x.key ? " auki" : "") + '">' +
          '<button class="row" data-a="aukko" data-k="' + esc(x.key) + '" aria-expanded="' + (aukkoAuki === x.key) + '"><span class="aukko-pallo"></span><div class="grow"><div class="t">' + esc(x.l.charAt(0).toUpperCase() + x.l.slice(1)) + "</div></div>" + icon("back", aukkoAuki === x.key ? "up" : "down") + "</button>" +
          (aukkoAuki === x.key ? aukkoEditori(x) : "") + "</div>").join("") +
        '<p class="hint" style="margin:8px 14px 12px">Kirjauksen voi tallentaa aina. Puuttuvat voi täydentää myöhemmin, ja AI täydentää raporttiluonnokseen sen, minkä tekstistä ja kuvista voi päätellä.' +
        (ohi.length ? ' <button class="link" data-a="eitiedpalauta">Ei tiedossa: ' + ohi.length + " · palauta</button>" : "") + "</p></section>";
    }

    function paint() {
      if (Auto.autoKohta(h) | Auto.autoTunnus(h)) save();
      const autoTag = (key) => h.auto && h.auto[key] === "sanelu" ? ' <span class="mp-tag">sanelusta</span>' : "";
      const m = M.menetelma(h.menetelma);
      const thumbs = h.kuvat.map((fid, i) =>
        '<button class="thumb" data-a="view" data-i="' + i + '" aria-label="Kuva ' + (i + 1) + '"><img src="' + Model.url(fid) + '" alt=""></button>').join("");
      const audio = (h.aanitteet || []).map((fid) => '<audio controls preload="none" src="' + Model.url(fid) + '" style="width:100%;margin-top:6px"></audio>').join("");
      const filled = (f) => f.t === "table" ? M.rivit(h, f).length > 0 : h.kentat[f.k] != null && String(h.kentat[f.k]).trim() !== "";
      const au = Check.havaintoAukot(h);
      const avattu = (au.find((x) => x.key === aukkoAuki) || {}).f;
      const vis = M.kentat(h).filter((f) => f !== avattu);
      const shownF = vis.filter((f) => m.lomake || filled(f) || f.req || f.t === "calc" || extraFields.has(f.k));
      const vihje = M.vihje(h);
      const hiddenF = vis.filter((f) => !shownF.includes(f));
      const okF = vis.filter((f) => f.okv && !filled(f));
      const mit = m.kentat.length
        ? '<div class="mit">' +
          (m.kentat.some((f) => f.k === "asunto")
            ? (M.eiAsuntoja(k)
              ? '<p class="hint" style="margin:0 0 10px">Kohteessa ei ole asuntoja, joten asuntoa ei kysytä. <button class="link" data-a="asuntoja" data-v="1">Kohteessa on asuntoja</button></p>'
              : (h.kentat.asunto ? "" : '<button class="chip" data-a="asuntoja" data-v="0" style="margin:0 0 10px">Ei asuntoja (esim. omakotitalo)</button>'))
            : "") +
          '<div class="grid2">' + shownF.map((f) => f.t === "table" ? tableHtml(f, false) : fieldHtml(f, h.kentat[f.k] != null ? h.kentat[f.k] : "", h.auto && (h.auto["k:" + f.k] === "sanelu" || h.auto["k:" + f.k] === "taito") ? h.auto["k:" + f.k] : false, false)).join("") + "</div>" +
          (vihje ? '<p class="hint vihje" style="margin:4px 0 10px"><b>Muista:</b> ' + esc(vihje) + "</p>" : "") +
          (okF.length ? '<button class="btn btn-block" data-a="okloput" style="margin:6px 0 4px">' + icon("ok") + "Muut kohdat kunnossa (" + okF.length + ")</button>" +
            '<p class="hint" style="margin:0 0 8px">Merkitsee tyhjät tarkistuskohdat kunnossa-arvolla. Sanele tai valitse ensin puutteet.</p>' : "") +
          (hiddenF.length ? '<div class="valinn"><span class="label">Muut tiedot <span class="u" style="text-transform:none;font-weight:400">· valinnaisia, kirjaa jos tiedossa</span></span>' +
            '<div class="chips more-fields">' + hiddenF.map((f) => '<button class="chip" data-a="addfield" data-k="' + f.k + '">+ ' + esc(f.l) + "</button>").join("") + "</div></div>" : "") +
          (m.kentat.some((f) => f.mittaus || (f.t === "table" && (f.sarakkeet || []).some((c) => c.mittaus)))
            ? '<p class="hint">Oranssi lukema: tarkista napauttamalla. Mikrofoni: luku tuli sanelusta.</p>' : "") +
          "</div>"
        : "";

      root.innerHTML = App.topbar({ title: nro(h) + (h.menetelma ? " · " + m.nimi : " · Kirjaus"), sub: Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu", back: "#/k/" + k.id }) +
        '<main class="view no-nav kirjaus">' +
        // 1. Kuvat ja sijainti
        '<div class="thumbs" style="margin-bottom:10px">' + thumbs +
        '<a class="thumb-add" href="#/k/' + k.id + "/kuvaus/" + h.id + '" aria-label="Lisää kuvia">' + icon("cam") + "<span>" + (h.kuvat.length ? "Lisää" : "Ota kuva") + "</span></a></div>" +
        '<div class="sijainti-rivi">' + miniPohjaHtml() +
        '<button class="btn grow" data-a="loc" style="justify-content:flex-start">' + icon("pin") + "<span>" + esc(Model.sijaintiTeksti(h.sijainti) || "Valitse sijainti") +
        (h.sijainti.piste ? "" : (h.sijainti.tilaId ? ' <span class="u">· ei merkitty pohjaan</span>' : "")) + autoTag("tila") + "</span></button></div>" +
        (h.ristiriita ? '<div class="alert">' + icon("alert") + "<div><b>Toinen tutkija muokkasi tätä kirjausta samaan aikaan.</b> Pilvessä ollut versio on alla. Korvautunut versio (" + esc([h.ristiriita.tekija, UI.pvm(h.ristiriita.aika)].filter(Boolean).join(", ")) + "): <i>" + esc(h.ristiriita.sanelu || "–") + "</i>" +
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-sm" data-a="rr-oma">Palauta korvautunut versio</button><button class="btn btn-sm" data-a="rr-ok">Pidä nykyinen</button></div></div></div>' : "") +
        // 2. Havainnot yhdessä tekstissä
        '<section class="card"><div class="card-b">' +
        '<textarea class="autogrow havaintoteksti" data-t="sanelu" aria-label="Havainnot" placeholder="Havainnot, mittaukset ja tiedot. Sanele tai kirjoita: esim. ”PKO lattia ovensuussa koholla, laattojen saumoissa tummumaa”">' + esc(h.sanelu) + "</textarea>" +
        '<div class="dict-prev" data-prev="sanelu"></div>' + audio + poimitutHtml() +
        (window.Katselmus ? Katselmus.aiemmatTilassaHtml(h.sijainti.tilaId) : "") + "</div></section>" +
        // 3. Puuttuvat
        '<div data-aukot>' + aukotHtml() + "</div>" +
        aliHtml() +
        (h.menetelma === "tiiviys" && window.Tiiviys ? (() => {
          const t = h.tiiviys ? Tiiviys.tulokset(h) : null;
          return '<section class="card"><div class="card-b"><a class="btn btn-block" href="#/k/' + k.id + "/tiiviys/" + h.id + '">' + icon("edit") + "Mittauslaskuri: ala, vaippa ja tilavuus</a>" +
            (t && t.ala ? '<p class="hint" style="margin:8px 0 0">Laskettu: ' + esc(String(Math.round(t.ala * 10) / 10).replace(".", ",")) + " m², " + esc(String(Math.round(t.tilavuus * 10) / 10).replace(".", ",")) + " m³, vaippa " + esc(String(Math.round(t.vaippa * 10) / 10).replace(".", ",")) + " m²</p>" : "") + "</div></section>";
        })() : "") +
        // 4. Kaikki tiedot
        '<details class="card vocab lisa"' + (lisaAuki ? " open" : "") + ' data-lisa><summary class="card-h"><h2>Kaikki tiedot</h2><span class="meta">' +
          esc([h.menetelma ? m.nimi : "", h.tulos ? M.TULOKSET[h.tulos] : "", h.tulkinta ? "tulkinta" : ""].filter(Boolean).join(" · ")) + "</span></summary>" +
        '<div class="card-b">' +
        '<span class="label">Menetelmä</span>' +
        '<button class="btn btn-block" data-a="menetelma" style="justify-content:space-between;margin-bottom:12px"><span>' + esc(h.menetelma ? m.nimi : "Valitse menetelmä") + autoTag("menetelma") + "</span>" + icon("back", "down") + "</button>" +
        (m.tulosVapaa ? '<span class="label">Tulos <span class="u" style="text-transform:none;font-weight:400">(valinnainen: tulos tulee laboratoriosta)</span></span>' : '<span class="label">Tulos</span>') +
        '<div class="chips" style="margin-bottom:12px">' +
        '<button class="chip c-note" data-a="tulos" data-v="poikkeama" aria-pressed="' + (h.tulos === "poikkeama") + '">Poikkeama' + (h.tulos === "poikkeama" ? autoTag("tulos") : "") + "</button>" +
        '<button class="chip c-ok" data-a="tulos" data-v="ok" aria-pressed="' + (h.tulos === "ok") + '">Ei huomautettavaa' + (h.tulos === "ok" ? autoTag("tulos") : "") + "</button></div>" +
        "</div>" +
        (mit ? '<div class="card-b mit-b">' + mit + "</div>" : "") +
        '<div class="card-b">' +
        (k.suunnitelma.length && aukkoAuki !== "kohta" ? '<label class="field"><span>Tutkimussuunnitelman kohta</span><select data-a="kohta">' + kohtaOptions() + "</select></label>" : "") +
        (window.AKK && AKK.aktiivinen() ? '<label class="field"><span>Kuntotarkastuksen osio' + autoTag("akkOsa") + '</span><select data-a="akkosa"><option value="">Ei liitetty</option>' +
          AKK.OSIOT.map((d) => '<option value="' + d.id + '"' + (h.akkOsa === d.id ? " selected" : "") + ">" + esc(d.luku + " " + d.nimi) + "</option>").join("") + "</select></label>" : "") +
        (window.Kuntoarvio && Kuntoarvio.aktiivinen() ? '<label class="field"><span>Kuntoarvion rakennusosa' + autoTag("kaOsa") + '</span><select data-a="kaosa"><option value="">Ei liitetty</option>' +
          KAData.RYHMAT.map((r) => '<optgroup label="' + esc(r.nimi) + '">' + KAData.OSAT.filter((d) => d.r === r.id).map((d) => '<option value="' + d.id + '"' + (h.kaOsa === d.id ? " selected" : "") + ">" + esc(d.nimi) + "</option>").join("") + "</optgroup>").join("") + "</select></label>" : "") +
        '<div style="display:flex;justify-content:space-between;align-items:center"><span class="label">Alustava tulkinta</span>' + dictBtnHtml("tulkinta") + "</div>" +
        '<textarea class="autogrow" data-t="tulkinta" aria-label="Alustava tulkinta" placeholder="Tutkijan oma arvio, esim. todennäköinen syy">' + esc(h.tulkinta) + "</textarea>" +
        '<div class="dict-prev" data-prev="tulkinta"></div>' +
        '<button class="btn btn-block" data-a="next" style="margin-top:14px">' + icon("cam") + "Uusi kirjaus samaan tilaan</button>" +
        '<button class="btn btn-danger btn-block" data-a="del" style="margin-top:8px">' + icon("trash") + "Poista kirjaus</button>" +
        "</div></details>" +
        "</main>" +
        '<div class="actionbar kirjaus-palkki">' +
        '<a class="btn" href="#/k/' + k.id + "/kuvaus/" + h.id + '">' + icon("cam") + "Lisää kuva</a>" +
        '<button type="button" class="btn dict-btn" data-dictbtn="sanelu" aria-label="Sanele lisää: pidä pohjassa">' + icon("mic") + '<span data-dl="sanelu">Sanele lisää</span></button>' +
        '<button class="btn btn-primary wide" data-a="valmis">' + icon("ok") + "Tallenna</button></div>";
      bindDict();
      UI.autogrow(root);
      const lisa = root.querySelector("[data-lisa]");
      if (lisa) lisa.addEventListener("toggle", () => { lisaAuki = lisa.open; });
      root.querySelectorAll("[data-gl]").forEach((el) => UI.showSelected(el));
      if (m.kentat.some((f) => f.ocr) && window.LukulaiteOcr) window.LukulaiteOcr.preload();
    }

    /* ---------- Taulukkokenttä (esim. RH-mittauspisteen lukemat) ---------- */
    const valittuRyhma = {};
    const muistiKey = (f) => h.menetelma + "." + f.k + ".ryhmat";

    function ryhmat(f) {
      const g = M.ryhmaSarake(f);
      if (!g) return [];
      const set = [];
      (S.kohde.muisti[muistiKey(f)] || []).concat(M.rivit(h, f).map((r) => r[g.k])).forEach((v) => {
        v = String(v == null ? "" : v).trim();
        if (v && !set.includes(v)) set.push(v);
      });
      return set;
    }
    function tallennaRyhmat(f, lista) {
      S.kohde.muisti[muistiKey(f)] = lista.slice(-8);
      Model.saveKohde();
    }

    // Tutkija muokkasi sanelusta tehtyä riviä: taulukko on nyt hänen, sanelu ei enää muuta sitä
    function ownTable(f) {
      M.rivit(h, f).forEach((r) => { if (r._sanelu) { delete r._sanelu; r._saneltu = true; } });
      Auto.manual(h, "t:" + f.k);
    }

    function allCols(f) { return f.sarakkeet || []; }
    function cols(f) { return allCols(f).filter((c) => c.t !== "date"); }       // ruudukon sarakkeet
    function dateCols(f) { return allCols(f).filter((c) => c.t === "date"); }  // lukupäivä rivin alle
    function gridStyle(f) { return "grid-template-columns:44px repeat(" + cols(f).length + ",minmax(0,1fr)) 44px"; }

    function rowHtml(f, row) {
      const o = row._ocr;
      const st = Meter.rowState(row);
      const map = f.ocr || {};
      const flagCol = (c) => o && st === "flagged" && o.flags && ((map.RH === c.k && o.flags.RH) || (map.T === c.k && o.flags.T) || (map.a === c.k && o.flags.a));
      const att = 'data-r="' + row.id + '" data-f="' + f.k + '"';
      let action;
      if (st === "reading") action = '<span class="tstate reading" aria-label="Luetaan">…</span>';
      else if (st === "flagged") action = '<button class="icon-btn tstate flagged" data-a="trev" ' + att + ' aria-label="Tarkista lukema">' + icon("alert") + "</button>";
      else if (st === "error" || st === "interrupted") action = '<button class="icon-btn tstate err" data-a="trev" ' + att + ' aria-label="Tunnistus epäonnistui">' + icon("alert") + "</button>";
      else if (st === "ok") action = '<button class="icon-btn tstate ok" data-a="trev" ' + att + ' aria-label="Näytä lukema">' + icon("ok") + "</button>";
      else action = '<button class="icon-btn" data-a="tdel" ' + att + ' aria-label="Poista rivi">' + icon("trash") + "</button>";
      const thumb = o && o.rajaus
        ? '<button class="rthumb" data-a="trev" ' + att + ' aria-label="Näytä kuva"><img src="' + Model.url(o.rajaus) + '" alt=""></button>'
        : row._sanelu || row._saneltu ? '<span class="rthumb dict" title="Sanelusta">' + icon("mic") + "</span>" : '<span class="rthumb empty"></span>';
      const ocrCol = (c) => map.RH === c.k || map.T === c.k || map.a === c.k;
      const dates = dateCols(f).map((c) =>
        '<label class="tdate">' + esc(c.l) + ' <input type="date" data-tf="' + f.k + '" data-tr="' + row.id + '" data-tc="' + esc(c.k) + '" value="' + esc(row[c.k] || "") + '"></label>').join("");
      return '<div class="trow-w" data-row="' + row.id + '"><div class="trow" style="' + gridStyle(f) + '">' + thumb +
        cols(f).map((c) => '<input type="text" class="tin' + (flagCol(c) ? " flag" : "") + '"' + (c.t === "num" ? ' inputmode="decimal"' : "") +
          ' data-tf="' + f.k + '" data-tr="' + row.id + '" data-tc="' + esc(c.k) + '" value="' + esc(row[c.k] == null ? "" : row[c.k]) + '"' +
          (st === "reading" && ocrCol(c) && !row[c.k] ? ' placeholder="…"' : "") +
          ' aria-label="' + esc(c.l) + '">').join("") + action + "</div>" +
        (dates ? '<div class="tdates">' + dates + "</div>" : "") + "</div>";
    }

    function summaryHtml(f) {
      const g = M.ryhmaSarake(f);
      const rows = M.rivit(h, f);
      if (!rows.length) return "";
      const mcols = cols(f).filter((c) => c.mittaus);
      const groups = {};
      rows.forEach((r) => { const key = g ? String(r[g.k] || "–") : "kaikki"; (groups[key] = groups[key] || []).push(r); });
      return Object.keys(groups).map((key) => {
        const rs = groups[key];
        const avg = mcols.map((c) => {
          const v = rs.map((r) => num(r[c.k])).filter((x) => x != null);
          const dec = Math.min(2, Math.max(1, ...rs.map((r) => ((String(r[c.k] || "").split(/[.,]/)[1]) || "").length)));
          return v.length ? c.l + " ka. " + fiNum(Math.round((v.reduce((a, b) => a + b, 0) / v.length) * Math.pow(10, dec)) / Math.pow(10, dec), dec) + (c.u ? " " + c.u : "") : "";
        }).filter(Boolean).join(", ");
        return "<div>" + (g ? "<b>" + esc(key) + (g.u ? " " + esc(g.u) : "") + "</b>: " : "") + rs.length + (rs.length === 1 ? " lukema" : " lukemaa") + (avg ? " · " + avg : "") + "</div>";
      }).join("");
    }

    function tableInner(f) {
      const g = M.ryhmaSarake(f);
      const rows = M.rivit(h, f);
      const rl = ryhmat(f);
      if (g && !valittuRyhma[f.k]) valittuRyhma[f.k] = rows.length ? String(rows[rows.length - 1][g.k] || "") : (rl[0] || "");
      const sel = valittuRyhma[f.k];
      return '<span class="label">' + esc(f.l) + (f.req ? ' <span class="req">*</span>' : "") + "</span>" +
        (g ? '<div class="chips scroll" data-gl="' + f.k + '" style="margin-bottom:10px">' +
          '<span style="align-self:center;font-size:13.5px;font-weight:700;margin-right:2px">' + esc(g.l) + ":</span>" +
          rl.map((v) => '<button class="chip" data-a="tgrp" data-f="' + f.k + '" data-v="' + esc(v) + '" aria-pressed="' + (v === sel) + '">' + esc(v) + (g.u ? " " + esc(g.u) : "") + "</button>").join("") +
          '<button class="chip" data-a="tgrpnew" data-f="' + f.k + '">+ Uusi</button></div>' : "") +
        '<div style="display:flex;gap:8px;margin-bottom:10px">' +
        (f.ocr ? '<button class="btn btn-dark" style="flex:1.4" data-a="tocr" data-f="' + f.k + '">' + icon("cam") + "Lue mittarista</button>" : "") +
        '<button class="btn" style="flex:1" data-a="tadd" data-f="' + f.k + '">' + icon("plus") + "Rivi käsin</button></div>" +
        (rows.length
          ? '<div class="trow thead" style="' + gridStyle(f) + '"><span></span>' + cols(f).map((c) => "<span>" + esc(c.l) + (c.u ? " " + esc(c.u) : "") + "</span>").join("") + "<span></span></div>" +
            '<div data-rows="' + f.k + '">' + rows.map((r) => rowHtml(f, r)).join("") + "</div>" +
            '<div class="tsum" data-tsum="' + f.k + '">' + summaryHtml(f) + "</div>"
          : '<p class="hint" style="margin:0 0 8px">' + (f.ocr ? (g ? "Valitse " + esc(g.l.toLowerCase()) + " ja kuvaa mittarin näyttö. Jokaisesta kuvasta tulee oma rivinsä. Rinnakkaiset mittaukset kuvataan samalla valinnalla." : "Kuvaa mittarin näyttö. Jokaisesta kuvasta tulee oma rivinsä.") : "Lisää rivi jokaiselle mittaukselle.") + "</p>");
    }

    function tableHtml(f, need) {
      return '<div class="tbl' + (need ? " need" : "") + '" data-tbl="' + f.k + '" style="grid-column:1/-1;margin-bottom:12px">' + tableInner(f) +
        (need ? '<span class="need-hint">Puuttuu · sano esim. ”' + esc(window.FieldFill ? FieldFill.hint(f) : "") + "” tai kuvaa mittarin näyttö</span>" : "") + "</div>";
    }

    /* Lasketut arvot (vetolujuus, näytteenottoaika) päivittyvät kirjoittaessa ilman uudelleenpiirtoa */
    function paivitaLasketut() {
      M.laske(h).forEach((key) => {
        const el = root.querySelector('[data-fk="' + key + '"]');
        if (el && el !== document.activeElement) el.value = h.kentat[key] || "";
      });
    }
    function tableField(fk) { return M.menetelma(h.menetelma).kentat.find((x) => x.k === fk && x.t === "table"); }
    async function repaintTable(f) {
      await Model.ensureUrls(M.rivit(h, f).map((r) => r._ocr && r._ocr.rajaus).filter(Boolean));
      const el = root.querySelector('[data-tbl="' + f.k + '"]');
      if (el) { el.innerHTML = tableInner(f); UI.showSelected(el.querySelector("[data-gl]")); }
      refreshMissing();
    }
    function repaintSummary(f) {
      const el = root.querySelector('[data-tsum="' + f.k + '"]');
      if (el) el.innerHTML = summaryHtml(f);
    }
    function unconfirm() {
      if (h.vahvistettu) { h.vahvistettu = false; const cb = root.querySelector('[data-a="vahv"]'); if (cb) cb.checked = false; }
    }

    /* Tunnistus valmistui taustalla: päivitetään vain kyseinen rivi, ettei kirjoitus keskeydy. */
    function onOcr(e) {
      if (e.detail.havaintoId !== h.id) return;
      M.menetelma(h.menetelma).kentat.filter((f) => f.t === "table").forEach((f) => {
        const row = M.rivit(h, f).find((r) => r.id === e.detail.rowId);
        if (!row) return;
        const el = root.querySelector('[data-row="' + row.id + '"]');
        if (!el) { repaintTable(f); return; }
        if (el.contains(document.activeElement)) {
          el.querySelectorAll("[data-tc]").forEach((inp) => { if (inp !== document.activeElement) inp.value = row[inp.dataset.tc] == null ? "" : row[inp.dataset.tc]; });
        } else {
          Model.ensureUrls([row._ocr && row._ocr.rajaus].filter(Boolean)).then(() => {
            const tmp = document.createElement("div");
            tmp.innerHTML = rowHtml(f, row);
            if (el.isConnected) el.replaceWith(tmp.firstChild);
          });
        }
        repaintSummary(f);
      });
      refreshMissing();
    }
    window.addEventListener("ks-ocr", onOcr);

    /* ---------- Sanelu: pidä pohjassa (havainto ja tulkinta) ---------- */
    function makeDict(target) {
      return new Dictation({
        onCommit: (text) => {
          if (target === "aukko") return aukkoSanelu(text);
          const kom = target === "sanelu" && window.Komennot ? Komennot.tulkitse(text) : null;
          if (kom && kom.toiminto) {
            if (kom.toiminto === "kunnossa") toast(Taidot.kunnossa(h) + " kohtaa merkitty kunnossa");
            else if (/^tulos:/.test(kom.toiminto)) { h.tulos = kom.toiminto.slice(6); Auto.manual(h, "tulos"); }
            else if (/^menetelma:/.test(kom.toiminto)) selectMethod(kom.toiminto.slice(10), true);
          }
          h[target] = DictButton.appendText(h[target], text);
          const ta = root.querySelector('textarea[data-t="' + target + '"]');
          if (ta) ta.value = h[target];
          save();
          if (target === "sanelu") runAuto();
        },
        onPreview: (t) => { const el = root.querySelector('[data-prev="' + target + '"]'); if (el) el.textContent = t; },
        onState: (st, msg) => {
          if ((st === "error" || st === "empty") && msg) toast(msg, 4000);
          if (st === "recording" && msg) toast(msg, 3000);
          const b = binds[target]; if (b) b.paint();
        },
        onAudio: async (blob) => {
          const fid = await DB.putFile(k.id, blob, { kind: "aanite", havaintoId: h.id });
          h.aanitteet = (h.aanitteet || []).concat(fid);
          await Model.ensureUrls([fid]);
          await Model.saveHavainto(h); paint();
          toast("Äänite tallennettu havaintoon");
        }
      });
    }
    const dicts = { sanelu: makeDict("sanelu"), tulkinta: makeDict("tulkinta"), aukko: makeDict("aukko") };
    /* Puuttuvan tiedon sanelu: teksti lisätään havaintoon (AI näkee sen), ja tunnistus täyttää kentän.
       Vapaatekstikenttä saa sanelun sellaisenaan, jos tunnistus ei täyttänyt sitä. */
    async function aukkoSanelu(text) {
      const x = Check.havaintoAukot(h).find((y) => y.key === aukkoAuki);
      h.sanelu = DictButton.appendText(h.sanelu, text);
      await Auto.apply(h);
      if (x && x.tyyppi === "kentta" && x.f.t !== "select" && x.f.t !== "multi" && (h.kentat[x.f.k] == null || h.kentat[x.f.k] === "")) {
        h.kentat[x.f.k] = text.trim(); Auto.manual(h, "k:" + x.f.k);
      }
      await Model.saveHavainto(h);
      const jaljella = x && Check.havaintoAukot(h).some((y) => y.key === x.key);
      if (x && !jaljella) { toast(x.l.charAt(0).toUpperCase() + x.l.slice(1) + ": kirjattu"); aukkoAuki = null; }
      paint();
    }
    const binds = {};
    function dictBtnHtml(target) {
      return '<button type="button" class="dict-btn" data-dictbtn="' + target + '" aria-label="Sanele: pidä pohjassa">' + icon("mic") + '<span data-dl="' + target + '">Pidä: sanele</span></button>';
    }
    function bindDict() {
      Object.keys(dicts).forEach((t) => {
        const btn = root.querySelector('[data-dictbtn="' + t + '"]');
        if (!btn) return;
        // Vain yksi sanelu kerrallaan
        btn.addEventListener("pointerdown", () => { Object.keys(dicts).forEach((o) => { if (o !== t && dicts[o].active) dicts[o].stop(); }); }, true);
        const idle = btn.querySelector("[data-dl]") ? btn.querySelector("[data-dl]").textContent : undefined;
        binds[t] = DictButton.bind(btn, dicts[t], { labelEl: root.querySelector('[data-dl="' + t + '"]'), idle: t === "tulkinta" ? undefined : idle });
      });
    }
    function stopDict() { Object.values(dicts).forEach((d) => d.stop()); }

    /* Puuttuvien määrä päivittyy kirjoittaessa; lista piirretään uudelleen OK:sta (fokus ei katoa) */
    function refreshMissing() {
      if (!S.kohde || S.kohde.id !== h.kohdeId) return;            // näkymä jo vaihtunut
      const el = root.querySelector("[data-aukot-n]");
      if (el) el.textContent = Check.havaintoAukot(h).length;
    }
    function paintAukot() {
      const el = root.querySelector("[data-aukot]");
      if (!el) return paint();
      el.innerHTML = aukotHtml();
      bindDict(); UI.autogrow(el);
      el.querySelectorAll("[data-gl]").forEach((x) => UI.showSelected(x));
    }

    function viewer(i) {
      const fid = h.kuvat[i];
      const v = document.createElement("div");
      v.className = "viewer";
      v.innerHTML = '<img src="' + Model.url(fid) + '" alt="Kuva ' + (i + 1) + '">' +
        '<div class="vbar"><button class="btn" data-v="close">Sulje</button>' +
        '<button class="btn" data-v="draw" style="background:#fff">' + icon("edit") + ((h.piirrokset || {})[fid] ? "Muokkaa merkintöjä" : "Piirrä") + "</button>" +
        '<button class="btn btn-danger" data-v="del" style="background:#fff">' + icon("trash") + "Poista kuva</button></div>";
      document.body.appendChild(v);
      v.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-v]");
        if (!b && e.target !== v) return;
        if (b && b.dataset.v === "draw") { v.remove(); await piirra(i); return; }
        if (b && b.dataset.v === "del") {
          v.remove();
          if (!(await confirmSheet({ title: "Poistetaanko kuva?", ok: "Poista kuva", danger: true }))) return;
          h.kuvat.splice(i, 1);
          await DB.del("tiedostot", fid);
          const pr = (h.piirrokset || {})[fid];
          if (pr) { if (pr.orig) await DB.del("tiedostot", pr.orig); delete h.piirrokset[fid]; }
          await Model.saveHavainto(h); paint();
          return;
        }
        v.remove();
      });
    }

    /* Piirtäminen kuvaan: muokkaus tehdään aina alkuperäisen päälle (merkinnät voi avata ja muuttaa).
       Uusi kuva korvaa kuvan havainnossa; alkuperäinen säilyy (h.piirrokset[uusi].orig). */
    async function piirra(i) {
      const fid = h.kuvat[i], vanha = (h.piirrokset || {})[fid];
      const origId = vanha ? vanha.orig : fid;
      let f = await DB.get("tiedostot", origId);
      if (!f && S.kohde.pilvi && window.Sync) f = await Sync.haeTiedosto(S.kohde.id, origId).catch(() => null);
      if (!f || !f.blob) { toast("Kuvaa ei löytynyt laitteelta"); return; }
      const r = await Piirto.avaa({ blob: f.blob, muodot: vanha ? vanha.muodot : [], otsikko: nro(h) + " · kuva " + (i + 1) });
      if (!r) return;
      h.piirrokset = h.piirrokset || {};
      if (!r.muodot.length) {
        // Kaikki merkinnät poistettu: palataan alkuperäiseen kuvaan
        if (vanha) { h.kuvat[i] = origId; delete h.piirrokset[fid]; await DB.del("tiedostot", fid); }
      } else {
        const uusi = await DB.putFile(S.kohde.id, r.blob, { kind: "kuva", havaintoId: h.id });
        h.kuvat[i] = uusi;
        h.piirrokset[uusi] = { orig: origId, muodot: r.muodot };
        if (vanha) { delete h.piirrokset[fid]; await DB.del("tiedostot", fid); }
        await Model.ensureUrls([uusi]);
      }
      await Model.saveHavainto(h);
      toast(r.muodot.length ? "Merkinnät tallennettu kuvaan" : "Merkinnät poistettu");
      paint();
    }

    /* Valinnan jälkeen: tunnus näytetyypin mukaan (MIK1, VOC1 …) ja tyyppikohtaiset kentät näkyviin */
    function asetaValinta(f, v) {
      if (!f) return;
      h.kentat[f.k] = v;
      Auto.manual(h, "k:" + f.k);
      if (f.muista) Model.muistiSet(M.muistiAvain(h, f), v);
      if (f.etuliitteet) Auto.autoTunnus(h);
      // näytetyypin omat muistetut arvot (pumppu, kenttänolla) valmiiksi
      if (M.menetelma(h.menetelma).kentat.some((x) => x.kun && x.kun.k === f.k)) M.taytaMuisti(h, Model);
      M.laske(h);
      if (window.FieldFill && f.okv) FieldFill.apply(h);
      save();
      const riippuvia = f.etuliitteet || M.menetelma(h.menetelma).kentat.some((x) => x.kun && x.kun.k === f.k);
      if (riippuvia || f.ow) paint();
    }
    async function muuArvo(f) {
      if (!f) return;
      const v = await UI.promptSheet({ title: f.l, label: "Kirjoita arvo", value: (f.o || []).includes(h.kentat[f.k]) ? "" : h.kentat[f.k] || "", required: true, ok: "Valmis" });
      if (v) asetaValinta(f, v.trim()); else paint();
    }
    root.oninput = (e) => {
      const t = e.target;
      if (t.matches("textarea[data-t]")) { h[t.dataset.t] = t.value; save(); }
      else if (t.matches("[data-tc]")) {
        const f = tableField(t.dataset.tf);
        const row = f && M.rivit(h, f).find((r) => r.id === t.dataset.tr);
        if (!row) return;
        row[t.dataset.tc] = t.value;
        if (row._sanelu) ownTable(f);
        if (row._ocr) {
          row._ocr.edited = row._ocr.edited || {};
          row._ocr.edited[t.dataset.tc] = true;
          const map = f.ocr || {};
          if (row._ocr.flags) {
            if (map.RH === t.dataset.tc) row._ocr.flags.RH = false;
            if (map.T === t.dataset.tc) row._ocr.flags.T = false;
            if (map.a === t.dataset.tc) row._ocr.flags.a = false;
          }
          t.classList.remove("flag");
        }
        const c = (f.sarakkeet || []).find((x) => x.k === t.dataset.tc);
        if (c && c.mittaus) unconfirm();
        save();
      }
      else if (t.matches("[data-fk]") && t.type !== "date") {
        if (t.tagName === "SELECT") return;                // valinta käsitellään change-tapahtumassa
        const f = M.kentta(h, t.dataset.fk);
        h.kentat[t.dataset.fk] = t.value;
        Auto.manual(h, "k:" + t.dataset.fk);
        if (t.dataset.fk === "tunnus") Auto.manual(h, "tunnus");
        if (f && f.mittaus && h.vahvistettu) { h.vahvistettu = false; const cb = root.querySelector('[data-a="vahv"]'); if (cb) cb.checked = false; }
        if (f && f.muista) Model.muistiSet(M.muistiAvain(h, f), t.value);
        if (f && f.laske) { if (t.value) Auto.manual(h, "k:" + f.k); else if (h.auto) delete h.auto["k:" + f.k]; }
        paivitaLasketut();
        save();
      }
    };
    root.onchange = (e) => {
      const t = e.target;
      if (t.matches('[data-a="kohta"]')) { h.suunnitelmaId = t.value || null; Auto.manual(h, "kohta"); save(); if (t.closest(".aukko-ed")) { aukkoAuki = null; paint(); } }
      else if (t.matches('[data-a="kaosa"]')) { h.kaOsa = t.value || null; Auto.manual(h, "kaOsa"); save(); if (t.closest(".aukko-ed")) { aukkoAuki = null; paint(); } }
      else if (t.matches('[data-a="alimuu"]') && t.value) { aliAloita(t.value); }
      else if (t.matches('[data-a="akkosa"]')) { h.akkOsa = t.value || null; Auto.manual(h, "akkOsa"); save(); if (t.closest(".aukko-ed")) { aukkoAuki = null; paint(); } }
      else if (t.matches('textarea[data-t="sanelu"]')) runAuto();
      else if (t.matches("[data-tc]")) {
        const f = tableField(t.dataset.tf);
        const row = f && M.rivit(h, f).find((r) => r.id === t.dataset.tr);
        // Vain yhteenveto päivitetään: rivin uudelleenpiirto veisi fokuksen seuraavasta kentästä.
        if (f && row) repaintSummary(f);
      }
      else if (t.matches("[data-fk]") && (t.tagName === "SELECT" || t.type === "date")) {
        const f = M.kentta(h, t.dataset.fk);
        if (t.value === "__muu__") { muuArvo(f); return; }
        asetaValinta(f, t.value);
      }
    };
    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.tagName === "SELECT" || b.type === "checkbox") return;
      const a = b.dataset.a;
      if (a === "asuntoja") {
        k.asuntoja = b.dataset.v === "1";
        if (!k.asuntoja) delete h.kentat.asunto;
        await Model.saveKohde(); save(); paint();
        UI.toast(k.asuntoja ? "Asunto kysytään tässä kohteessa" : "Asuntoa ei kysytä tässä kohteessa");
        return;
      }
            if (a === "tgrp") { valittuRyhma[b.dataset.f] = b.dataset.v; repaintTable(tableField(b.dataset.f)); return; }
      if (a === "tgrpnew") {
        const f = tableField(b.dataset.f), g = M.ryhmaSarake(f);
        const v = await UI.promptSheet({ title: "Uusi " + g.l.toLowerCase(), label: g.l + (g.u ? " (" + g.u + ")" : ""), required: true, ok: "Lisää" });
        if (!v) return;
        const val = v.replace(/\s*(mm|cm|m)$/i, "").trim();
        const l = ryhmat(f); if (!l.includes(val)) l.push(val);
        tallennaRyhmat(f, l); valittuRyhma[f.k] = val; repaintTable(f); return;
      }
      if (a === "tadd") {
        const f = tableField(b.dataset.f), g = M.ryhmaSarake(f);
        const row = { id: DB.uid("r_") };
        if (g) row[g.k] = valittuRyhma[f.k] || "";
        Meter.setDate(f, row);
        if (!Array.isArray(h.kentat[f.k])) h.kentat[f.k] = [];
        h.kentat[f.k].push(row);
        unconfirm(); save(); repaintTable(f);
        const first = root.querySelector('[data-tr="' + row.id + '"][data-tc]:not([data-tc="' + (g ? g.k : "") + '"])');
        if (first) first.focus();
        return;
      }
      if (a === "tdel") {
        const f = tableField(b.dataset.f);
        const row = M.rivit(h, f).find((r) => r.id === b.dataset.r);
        if (!row) return;
        if (row._sanelu) ownTable(f);
        await Meter.removeRow(h, f, row); unconfirm(); repaintTable(f); return;
      }
      if (a === "trev") {
        const f = tableField(b.dataset.f);
        const row = M.rivit(h, f).find((r) => r.id === b.dataset.r);
        if (row) Meter.review(h, f, row, () => { unconfirm(); save(); repaintTable(f); });
        return;
      }
      if (a === "tocr") {
        save.flush();
        const f = tableField(b.dataset.f);
        Meter.open({
          h, f, ryhma: valittuRyhma[f.k], ryhmat: ryhmat(f),
          onRow: () => repaintTable(f),
          onRyhma: (v, l) => { valittuRyhma[f.k] = v; tallennaRyhmat(f, l); },
          onClose: (v, l) => { valittuRyhma[f.k] = v; tallennaRyhmat(f, l); unconfirm(); repaintTable(f); }
        });
        return;
      }
      if (a === "rr-oma" || a === "rr-ok") {
        if (a === "rr-oma") { const o = h.ristiriita; ["sanelu", "tulkinta", "tulos", "menetelma"].forEach((x) => { h[x] = o[x]; }); h.kentat = o.kentat || {}; if (o.sijainti) h.sijainti = o.sijainti; }
        delete h.ristiriita; save(); paint(); return;
      }
      if (a === "okloput") {
        const vis = M.kentat(h).filter((f) => f.okv && (h.kentat[f.k] == null || h.kentat[f.k] === ""));
        vis.forEach((f) => { h.kentat[f.k] = f.okv; Auto.manual(h, "k:" + f.k); });
        const dev = M.kentat(h).some((f) => f.okv && h.kentat[f.k] && h.kentat[f.k] !== f.okv);
        if (!h.tulos) { h.tulos = dev ? "poikkeama" : "ok"; h.auto = h.auto || {}; h.auto.tulos = "sanelu"; }
        save(); paint(); toast(vis.length + " kohtaa merkitty kunnossa"); return;
      }
      if (a === "muuarvo") { muuArvo(M.kentta(h, b.dataset.k)); return; }
      if (a === "chipv") {
        const f = M.kentta(h, b.dataset.k);
        asetaValinta(f, h.kentat[b.dataset.k] === b.dataset.v ? "" : b.dataset.v);
        paint(); return;
      }
      if (a === "multiv") {
        const f = M.kentta(h, b.dataset.k);
        const sel = String(h.kentat[b.dataset.k] || "").split(/\s*;\s*/).filter(Boolean);
        const i = sel.indexOf(b.dataset.v);
        if (i >= 0) sel.splice(i, 1); else sel.push(b.dataset.v);
        // vaihtoehtojen järjestys säilyy
        const o = (f && f.o) || [];
        sel.sort((x, y) => (o.indexOf(x) + 1 || 99) - (o.indexOf(y) + 1 || 99));
        asetaValinta(f, sel.join("; "));
        paint(); return;
      }
      if (a === "tulos") { h.tulos = h.tulos === b.dataset.v ? null : b.dataset.v; Auto.manual(h, "tulos"); save(); paint(); }
      else if (a === "men") {
        selectMethod(b.dataset.v);
      }
      else if (false) {
        h.menetelma = b.dataset.v;
        h.vahvistettu = false;
        // muistetut arvot (esim. mittalaite) valmiiksi
        M.menetelma(h.menetelma).kentat.forEach((f) => {
          const mem = Model.muistiGet(h.menetelma + "." + f.k);
          if (f.muista && mem && !h.kentat[f.k]) h.kentat[f.k] = mem;
        });
        const cur = Model.kohta(h.suunnitelmaId);
        if (cur && !Model.kohtaSopii(cur, h.menetelma)) h.suunnitelmaId = null;
        save(); paint();
      }
      else if (a === "addfield") { extraFields.add(b.dataset.k); paint(); const el2 = root.querySelector('[data-fk="' + b.dataset.k + '"]'); if (el2) el2.focus(); }
      else if (a === "sugg") {
        const s = suggestions()[+b.dataset.i];
        const fields = M.menetelma(h.menetelma).kentat.filter((f) => f.u === s.u);
        const target = fields.find((f) => !h.kentat[f.k]) || fields[0];
        if (target) {
          h.kentat[target.k] = s.arvo.replace(".", ",");
          h.vahvistettu = false;
          save(); paint();
          toast(target.l + ": " + s.arvo.replace(".", ",") + " " + s.u + ". Tarkista arvo.");
        }
      }
      else if (a === "loc") Plan.locationSheet(h.sijainti, (s) => { h.sijainti = s; Auto.manual(h, "tila"); Auto.manual(h, "rakenneosa"); if (window.FieldFill) FieldFill.apply(h); save(); paint(); }, { paikannus: Date.now() - (h.created || 0) < 10 * 60000 });   // vanhan havainnon tila ei siirrä seurantaa
      else if (a === "view") viewer(+b.dataset.i);
      else if (a === "menetelma") MethodPicker.openSheet({ selected: h.menetelma, excludeHavainto: h.id, onSelect: selectMethod });
      else if (a === "valmis") {
        save.flush();
        const n = Check.havaintoAukot(h).length;
        if (window.Taidot && n) Taidot.mittari("puuttuvia", n);
        toast(n ? "Tallennettu. Raporttia varten puuttuu " + n + (n === 1 ? " tieto." : " tietoa.") : "Tallennettu", 2500);
        location.hash = "#/k/" + k.id;
      }
      else if (a === "aukko") { aukkoAuki = aukkoAuki === b.dataset.k ? null : b.dataset.k; paintAukot(); }
      else if (a === "aukkook") { save.flush(); aukkoAuki = null; paint(); }
      else if (a === "eitied") {
        h.eiTiedossa = (h.eiTiedossa || []).filter((x) => x !== b.dataset.k).concat(b.dataset.k);
        if (window.Taidot) Taidot.mittari("eiTiedossa", 1);
        aukkoAuki = null; save(); paint(); toast("Merkitty: ei tiedossa");
      }
      else if (a === "eitiedpalauta") { delete h.eiTiedossa; save(); paint(); }
      else if (a === "poim") {
        const key = b.dataset.k;
        if (key === "menetelma") MethodPicker.openSheet({ selected: h.menetelma, excludeHavainto: h.id, onSelect: selectMethod });
        else if (key === "tila") root.querySelector('.sijainti-rivi [data-a="loc"].grow, .sijainti-rivi .btn[data-a="loc"]').click();
        else if (key === "tulos") { h.tulos = h.tulos === "ok" ? "poikkeama" : "ok"; Auto.manual(h, "tulos"); save(); paint(); toast("Tulos: " + M.TULOKSET[h.tulos]); }
        else {
          lisaAuki = true; paint();
          const el = root.querySelector('[data-fk="' + key.slice(2) + '"], [data-tbl="' + key.slice(2) + '"], [data-a="' + key.toLowerCase() + '"]');
          if (el) { el.scrollIntoView({ block: "center" }); if (el.focus) el.focus(); }
        }
      }
      else if (a === "ali") await aliAloita(b.dataset.m);
      else if (a === "avaahav") { save.flush(); location.hash = "#/k/" + k.id + "/h/" + b.dataset.id; }
      else if (a === "next") {
        save.flush();
        S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa, menetelma: h.menetelma || (S.kohde.viimeisin || {}).menetelma };
        await Model.saveKohde();
        location.hash = "#/k/" + k.id + "/kuvaus";
      }
      else if (a === "del") {
        if (!(await confirmSheet({ title: "Poistetaanko " + nro(h) + "?", text: "Havainnon kuvat ja sanelu poistetaan.", ok: "Poista havainto", danger: true }))) return;
        await Model.deleteHavainto(h);
        location.hash = "#/k/" + k.id;
      }
    };

    paint();
    if (window.Sync) Sync.kesken = h.id;     // muiden muutokset tähän havaintoon haetaan vasta, kun kortti suljetaan
    S.cleanup = () => { if (window.Sync) Sync.kesken = null; if (picker) picker.destroy(); stopDict(); save.flush(); if (window.Taidot) Taidot.havaitse(h); Learn.learn(h).then(() => Model.saveHavainto(h)).catch(() => {}); window.removeEventListener("ks-ocr", onOcr); root.oninput = root.onchange = root.onclick = null; };
  }

  window.Card = { view };
})();
