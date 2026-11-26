/* =========================================================================
   cloudui.js – kirjautuminen, tili ja synkronoinnin tila (SharePoint)
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet, promptSheet } = UI;
  const { S, Model } = App;

  /* Kirjautumisnäkymä: ilman kirjautumista (eikä aiempaa kirjautumista laitteella) ei pääse tietoihin */
  function loginView() {
    document.getElementById("app").innerHTML =
      '<main class="view no-nav" style="display:flex;flex-direction:column;justify-content:center;min-height:100vh;max-width:460px;margin:0 auto">' +
      '<img src="pbm-logo.png" alt="" style="width:64px;height:64px;margin:0 auto 14px;display:block">' +
      '<h1 style="text-align:center;font-size:24px;margin:0 0 6px">Kirjuri</h1>' +
      '<p style="text-align:center;color:var(--muted);margin:0 0 22px">Kirjaudu organisaation Microsoft 365 -tunnuksella.</p>' +
      (Cloud.virhe ? '<div class="alert">' + icon("alert") + "<div>" + esc(Cloud.virhe) + "</div></div>" : "") +
      '<button class="btn btn-primary btn-block" data-login style="min-height:56px">Kirjaudu Microsoft-tunnuksella</button>' +
      '<p class="hint" style="text-align:center;margin-top:16px">Kohteet tallentuvat organisaation SharePointiin. Kirjaukset tallentuvat ensin puhelimeen ja siirtyvät pilveen, kun yhteys on.</p>' +
      "</main>";
    document.querySelector("[data-login]").addEventListener("click", () => {
      if (!navigator.onLine) { toast("Kirjautuminen vaatii verkkoyhteyden.", 3500); return; }
      Cloud.login().then(() => { if (Cloud.kirjautunut) App.render(); }).catch((e) => toast("Kirjautuminen epäonnistui: " + (e.message || e), 5000));
    });
  }
  const tarvitaanKirjautuminen = () => Cloud.enabled && !Cloud.kirjautunut && !Cloud.user();

  /* Synkronoinnin tila yhdellä rivillä */
  function tilaTeksti(st) {
    const hh = (t) => { const d = new Date(t); return d.getHours() + "." + String(d.getMinutes()).padStart(2, "0"); };
    if (st.tila === "ok") return { c: "ok", t: st.jono ? "Lähetetään " + st.jono + " muutosta…" : "✓ Pilvessä" + (st.aika ? " klo " + hh(st.aika) : "") };
    if (st.tila === "kaynnissa") return { c: "ok", t: "Synkronoidaan…" };
    if (st.tila === "offline") return { c: "warn", t: "Ei verkkoa" + (st.jono ? ": " + st.jono + " muutosta odottaa lähetystä" : ". Kirjaukset tallentuvat puhelimeen.") };
    if (st.tila === "kirjaudu") return { c: "warn", t: "Kirjaudu uudelleen, niin muutokset siirtyvät pilveen" + (st.jono ? " (" + st.jono + " odottaa)" : "") };
    if (st.tila === "virhe") return { c: "warn", t: st.viesti || "Synkronointi epäonnistui" };
    return null;
  }
  function syncBarHtml(k) {
    if (!Cloud.enabled) return "";
    if (k && !k.pilvi) return '<div class="syncbar warn" data-syncbar>Kohde on vain tällä laitteella. <button class="link" data-pilveen-nyt>Siirrä pilveen</button></div>';
    const t = tilaTeksti(Sync.state);
    return '<div class="syncbar ' + (t ? t.c : "") + '" data-syncbar>' + (t ? esc(t.t) : "") + (Sync.state.tila === "kirjaudu" ? ' <button class="link" data-relogin>Kirjaudu</button>' : "") + "</div>";
  }
  /* Tallennuksen tila yläpalkissa (kenttälomakkeen tapaan): "✓ Pilvessä klo 9.41" */
  function pilleriSisalto(k) {
    const hh = (t) => { const d = new Date(t); return d.getHours() + "." + String(d.getMinutes()).padStart(2, "0"); };
    if (!Cloud.enabled) return { c: "laite", t: "Tallessa laitteella" };
    if (k && !k.pilvi) return { c: "warn", t: "Vain laitteella", a: "data-pilveen-nyt" };
    const st = Sync.state;
    if (st.tila === "ok") return st.jono ? { c: "", t: "Tallentaa…" } : { c: "ok", t: "✓ Pilvessä" + (st.aika ? " " + hh(st.aika) : "") };
    if (st.tila === "kaynnissa") return { c: "", t: "Tallentaa…" };
    if (st.tila === "offline") return { c: "warn", t: st.jono ? st.jono + " odottaa verkkoa" : "Ei verkkoa" };
    if (st.tila === "kirjaudu") return { c: "warn", t: "Kirjaudu", a: "data-relogin" };
    if (st.tila === "virhe") return { c: "warn", t: "Pilvi: virhe", a: "data-pilvivirhe" };
    return { c: "", t: "Tallessa laitteella" };
  }
  function pilleri(k) {
    const x = pilleriSisalto(k);
    return '<button class="sync-pill ' + x.c + '" data-syncpill ' + (x.a || "data-pilvitieto") + ">" + esc(x.t) + "</button>";
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-pilvivirhe]")) toast(Sync.state.viesti || "Synkronointi epäonnistui. Yritetään uudelleen.", 5000);
    if (e.target.closest("[data-pilvitieto]")) toast(!Cloud.enabled ? "Tiedot ovat tässä puhelimessa. Vie kohde ZIP-pakettina varmuuskopioksi ja raportointiin (Viimeistele)." : "Kohde on organisaation SharePointissa. Muutokset siirtyvät automaattisesti, kun verkko on.", 5000);
  });

  Sync.onChange(() => {
    const pill = document.querySelector("[data-syncpill]");
    if (pill) pill.outerHTML = pilleri(S.kohde);
    const el = document.querySelector("[data-syncbar]");
    if (!el || (S.kohde && !S.kohde.pilvi && el.textContent.indexOf("Siirrä") >= 0)) return;
    const t = tilaTeksti(Sync.state);
    el.className = "syncbar " + (t ? t.c : "");
    el.innerHTML = (t ? esc(t.t) : "") + (Sync.state.tila === "kirjaudu" ? ' <button class="link" data-relogin>Kirjaudu</button>' : "");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-relogin]")) Cloud.login();
  });

  /* Etusivu: tili ja pilven kohteet, joita ei ole laitteella */
  function accountHtml() {
    if (!Cloud.enabled) return "";
    const u = Cloud.user();
    return '<section class="card"><div class="card-h"><h2>Tili</h2><span class="meta">' + (Cloud.kirjautunut ? "kirjautunut" : "ei yhteyttä") + '</span></div><div class="card-b">' +
      "<div><b>" + esc(u ? u.nimi || u.email : "") + "</b></div>" +
      '<div class="hint" style="margin:4px 0 10px">Kenttänumerot: <b>' + esc(u && u.sarja ? u.sarja + "-01, " + u.sarja + "-02 …" : "–") + "</b> (vain kentällä; raportille havainnot numeroidaan H01, H02 …)</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (Cloud.kirjautunut ? '<button class="btn btn-sm" data-sarja>Vaihda kirjaimet</button>' : '<button class="btn btn-sm btn-primary" data-relogin>Kirjaudu</button>') +
      '<button class="btn btn-sm" data-logout>Kirjaudu ulos</button></div>' +
      "</div></section>";      // tiimin pilvikohteet näkyvät etusivulla omana listanaan (K3.3)
  }
  async function bindHome(root) {
    if (!Cloud.enabled) return;
    const sb = root.querySelector("[data-sarja]");
    if (sb) sb.addEventListener("click", async () => {
      const v = await promptSheet({ title: "Kenttänumeroiden kirjaimet", text: "Kirjaimet erottavat sinun havaintosi muiden tutkijoiden havainnoista kentällä (esim. TM-05). Raportille havainnot numeroidaan juoksevasti.", label: "Kirjaimet (2–4)", value: (Cloud.user() || {}).sarja || "", required: true });
      if (!v) return;
      try { await Cloud.setSarja(v); App.render(); } catch (e) { toast("Tallennus epäonnistui: " + (e.message || e), 4000); }
    });
    root.querySelector("[data-logout]").addEventListener("click", async () => {
      const jono = (await Promise.all((await DB.all("kohteet")).filter((k) => k.pilvi).map((k) => Sync.jonossa(k.id)))).reduce((a, b) => a + b, 0);
      if (!(await confirmSheet({ title: "Kirjaudutaanko ulos?", text: (jono ? "HUOM: " + jono + " muutosta ei ole vielä pilvessä. Ne säilyvät puhelimessa, kunnes kirjaudut uudelleen ja ne lähetetään. " : "") + "Pilvikohteiden tiedot poistetaan tästä puhelimesta (lähetetyt tiedot säilyvät pilvessä).", ok: "Kirjaudu ulos", danger: true }))) return;
      await Sync.siivoa(true);
      await Cloud.logout();
      location.hash = "#/"; App.render();
    });
    const box = root.querySelector("[data-pilvikohteet]");
    try {
      const local = new Set((await DB.all("kohteet")).map((k) => k.id));
      const rows = (await Sync.pilviKohteet()).filter((r) => !local.has(r.id));
      if (!rows.length) return;
      box.innerHTML = '<span class="label" style="margin-top:14px;display:block">Kohteet pilvessä (ei tällä laitteella)</span>' +
        rows.map((r) => '<button class="row" data-hae="' + esc(r.id) + '" data-nimi="' + esc(r.nimi) + '" style="padding-left:0;padding-right:0"><div class="grow"><div class="t">' + esc(r.nimi || "Nimetön kohde") + '</div><div class="s">Päivitetty ' + esc(UI.pvm(r.updated_at)) + "</div></div>" + icon("download") + "</button>").join("");
      box.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-hae]");
        if (!b) return;
        b.disabled = true; toast("Haetaan kohde…", 8000);
        try { const id = await Sync.hae(b.dataset.hae, b.dataset.nimi); UI.hideToast(); location.hash = "#/k/" + id; }
        catch (err) { b.disabled = false; toast("Haku epäonnistui: " + (err.message || err), 5000); }
      });
    } catch (e) { /* ei verkkoa: ei listaa */ }
  }

  /* Kohteen tiedot: pilvi */
  function tiimiHtml(k) {
    if (!Cloud.enabled) return "";
    if (!k.pilvi) {
      return '<section class="card"><div class="card-h"><h2>Pilvi</h2></div><div class="card-b">' +
        '<p style="margin:0 0 10px">Kohde on vain tällä laitteella. Pilvessä se on varmuuskopioitu, ja muut tutkijat voivat kirjata siihen samaan aikaan.</p>' +
        (Cloud.kirjautunut ? '<button class="btn btn-primary btn-block" data-pilveen>' + icon("upload") + "Siirrä kohde pilveen</button>" : '<p class="hint">Kirjaudu ensin.</p>') + "</div></section>";
    }
    return '<section class="card"><div class="card-h"><h2>Pilvi</h2></div><div class="card-b"><p style="margin:0">Kohde on organisaation SharePointissa (kansio <b>' + esc(k.kansio || "luodaan ensimmäisessä synkronoinnissa") + '</b>). Kaikki Kirjuri-sivuston käyttäjät näkevät sen.</p></div></section>';
  }
  async function siirra(k) {
    if (!(await confirmSheet({ title: "Siirretäänkö kohde pilveen?", text: "Kohteen tiedot ja kuvat siirretään organisaation SharePointiin. Kirjuri-sivuston käyttäjät näkevät ne.", ok: "Siirrä" }))) return;
    await Sync.siirraPilveen(k); App.render();
  }
  async function bindTiimi(root, k) {
    if (!Cloud.enabled) return;
    const pb = root.querySelector("[data-pilveen]");
    if (pb) pb.addEventListener("click", () => siirra(k));
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-pilveen-nyt]") && S.kohde) siirra(S.kohde); });

  /* Muiden tutkijoiden muutokset näkyviin: vain yleisnäkymissä (ei kesken kirjauksen) */
  Sync.paivitaNakyma = () => {
    const h = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
    const yleis = h[0] === "k" && ["", undefined, "havainnot", "pohja", "lahto"].includes(h[2]);
    const kirjoittaa = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (yleis && !document.querySelector(".sheet") && !kirjoittaa) App.render();
  };

  window.CloudUI = { loginView, tarvitaanKirjautuminen, syncBarHtml, pilleri, accountHtml, bindHome, tiimiHtml, bindTiimi };
})();
