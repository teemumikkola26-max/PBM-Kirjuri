/* =========================================================================
   osiot.js – kuntoarvion ja asuntokaupan kuntotarkastuksen osiot kohdesivulla (K3.3)

   Osio avautuu napautuksella, ja pikavalinnat ovat heti käsillä:
   - AKK: Kunnossa ✓ / Kirjaa havainto / Ei voitu tarkastaa (+ syy). Osio, jossa ei ole
     havaintoja eikä merkintöjä, on oletuksena kunnossa; loput kuitataan viimeistelyssä.
   - Kuntoarvio: kuntoluokka 5–1 yhdellä napautuksella, Kirjaa havainto, Ei koske.
     Kuntoluokka on raportin vaatima tieto, joten kuntoarviossa ei ole oletusta.
   Tarkemmat tiedot (tarkistuslista, rakenteet, käyttöiät) ovat osion omassa näkymässä.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  let auki = null;      // avoinna olevan osion tunnus

  function akkHtml(k) {
    const e = AKK.edistyminen();
    const rivit = AKK.OSIOT.map((d) => {
      const st = AKK.osioTila(d), on = auki === d.id;
      const txt = st.txt || "Kunnossa (oletus)";
      return '<div class="os-r' + (on ? " auki" : "") + '"><button class="os-p" data-os="' + d.id + '" aria-expanded="' + on + '"><span class="grow">' + esc(d.nimi) + '</span><span class="os-st ' + (st.cls || "oletus") + '">' + esc(txt) + "</span>" + icon("back", on ? "up" : "down") + "</button>" +
        (on ? '<div class="os-napit"><button class="os-ok" data-osa="ok" data-id="' + d.id + '">Kunnossa ✓</button>' +
          '<a class="os-hav" href="#/k/' + k.id + "/kuvaus?akkosa=" + d.id + '">Kirjaa havainto</a>' +
          '<button class="os-ei" data-osa="ei" data-id="' + d.id + '">Ei voitu tarkastaa</button></div>' +
          '<a class="link os-avaa" href="#/k/' + k.id + "/akk/" + d.id + '">Tarkistuslista ja tiedot</a>' : "") + "</div>";
    }).join("");
    return '<section class="card os-kortti"><div class="card-b"><div class="u-rivi"><h2 class="grow">Osiot</h2><span class="u-luku">Käyty ' + e.n + " / " + e.all + "</span></div>" +
      '<div class="u-palkki"><span style="width:' + Math.round(e.n / e.all * 100) + '%"></span></div>' +
      '<p class="u-sub">Kirjaa havainnot osioittain. Osio, jossa ei ole havaintoja, on kunnossa, ellei toisin merkitä. Viimeistelyssä kuittaat loput kerralla.</p>' +
      rivit + "</div></section>";
  }

  function kaHtml(k) {
    const e = Kuntoarvio.edistyminen(), D = window.KAData;
    const ryhmat = D.RYHMAT.map((r) => {
      const osat = D.OSAT.filter((o) => o.r === r.id);
      const n = osat.filter((o) => Kuntoarvio.arvioitu((k.kuntoarvio && k.kuntoarvio.osat || {})[o.id])).length;
      const sis = osat.some((o) => o.id === auki);
      return '<details class="os-ryhma"' + (sis ? " open" : "") + "><summary><span class=\"grow\">" + esc(r.nimi) + '</span><span class="os-st">' + n + " / " + osat.length + "</span></summary>" +
        osat.map((d) => {
          const o = (k.kuntoarvio && k.kuntoarvio.osat || {})[d.id] || {}, on = auki === d.id;
          const hs = App.S.havainnot.filter((h) => h.kaOsa === d.id).length;
          const st = o.ei ? "Ei koske" : o.kl ? "Kuntoluokka " + o.kl + " " + D.KUNTOLUOKAT.find((x) => x.k === o.kl).l : "Ei arvioitu";
          return '<div class="os-r' + (on ? " auki" : "") + '"><button class="os-p" data-os="' + d.id + '" aria-expanded="' + on + '"><span class="grow">' + esc(d.nimi) + '</span><span class="os-st ' + (o.kl ? (o.kl <= 2 ? "note" : "ok") : o.ei ? "ei" : "oletus") + '">' + esc(st + (hs ? " · " + hs + " hav." : "")) + "</span>" + icon("back", on ? "up" : "down") + "</button>" +
            (on ? '<div class="os-kls">' + D.KUNTOLUOKAT.map((x) => '<button class="chip ka-k' + x.k + '" data-kl="' + x.k + '" data-id="' + d.id + '" aria-pressed="' + (o.kl === x.k && !o.ei) + '"><b>' + x.k + "</b> " + esc(x.l) + "</button>").join("") + "</div>" +
              '<div class="os-napit"><a class="os-hav" href="#/k/' + k.id + "/kuvaus?kaosa=" + d.id + '">Kirjaa havainto</a><button class="os-ei" data-kl="ei" data-id="' + d.id + '" aria-pressed="' + !!o.ei + '">Ei koske</button>' +
              '<a class="os-ei" href="#/k/' + k.id + "/kuntoarvio/" + d.id + '">Tiedot ja käyttöikä</a></div>' : "") + "</div>";
        }).join("") + "</details>";
    }).join("");
    return '<section class="card os-kortti"><div class="card-b"><div class="u-rivi"><h2 class="grow">Rakennusosat</h2><span class="u-luku">Arvioitu ' + e.n + " / " + e.all + "</span></div>" +
      '<div class="u-palkki"><span style="width:' + Math.round(e.n / e.all * 100) + '%"></span></div>' +
      '<p class="u-sub">Avaa osa ja valitse kuntoluokka. Havainnot kuvalla ja sanelulla; sanelu tunnistaa osan.</p>' + ryhmat + "</div></section>";
  }

  function html(k) {
    if (window.AKK && AKK.aktiivinen()) return akkHtml(k);
    if (window.Kuntoarvio && Kuntoarvio.aktiivinen()) return kaHtml(k);
    return "";
  }

  /* Kohdesivun klikit (kutsutaan app.js:stä) */
  async function klikki(e, render) {
    const p = e.target.closest("[data-os]");
    if (p) { auki = auki === p.dataset.os ? null : p.dataset.os; const y = window.scrollY; await render(); window.scrollTo(0, y); return true; }
    const a = e.target.closest("[data-osa]");
    if (a) {
      const o = AKK.tila(a.dataset.id), d = AKK.osio(a.dataset.id);
      if (a.dataset.osa === "ok") { o.kayty = true; o.ei = false; o.eiKoske = false; toast(d.nimi + ": kunnossa"); }
      else {
        const syy = await new Promise((res) => UI.sheet('<h3 style="margin:0 0 10px">' + esc(d.nimi) + ': miksi ei voitu tarkastaa?</h3><div class="chips">' +
          AKK.SYYT.map((x) => '<button class="chip" data-s="' + esc(x) + '">' + esc(x) + "</button>").join("") + '</div><div class="row-btns" style="margin-top:12px"><button class="btn" data-close>Peruuta</button></div>',
          (el, close) => { el.addEventListener("click", (ev) => { const c = ev.target.closest("[data-s]"); if (c) { close(); res(c.dataset.s); } }); }, { onClose: () => res(null) }));
        if (syy == null) return true;
        o.ei = true; o.kayty = false; o.syy = syy; toast(d.nimi + ": ei voitu tarkastaa");
      }
      auki = null;
      await App.Model.saveKohde(); const y = window.scrollY; await render(); window.scrollTo(0, y); return true;
    }
    const kl = e.target.closest("[data-kl]");
    if (kl && kl.closest(".os-kortti")) {
      const o = Kuntoarvio.tila(kl.dataset.id);
      if (kl.dataset.kl === "ei") { o.ei = !o.ei; if (o.ei) o.kl = null; }
      else { const v = +kl.dataset.kl; o.kl = o.kl === v ? null : v; o.ei = false; }
      await App.Model.saveKohde(); const y = window.scrollY; await render(); window.scrollTo(0, y); return true;
    }
    return false;
  }

  window.Osiot = { html, klikki };
})();
