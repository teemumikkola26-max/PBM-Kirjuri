/* =========================================================================
   muistio.js – muistiinpanot ilman kuvaa (#/k/<kohde>/muistio)

   Teemu 24.11.: kentällä pitää voida kirjoittaa tai sanella muistiinpanoja
   nopeasti myös ilman kuvaa (esim. haastattelussa kuultu, yleinen huomio).
   Alapalkissa kamerapainikkeen vieressä on Muistio-painike. Näkymä avautuu
   suoraan uuteen muistiinpanoon: kirjoita tai pidä Sanele-painiketta.
   Tila täyttyy Seurannan ehdotuksesta (tai jää tyhjäksi); Vaihda avaa
   sijainnin valinnan. Tallennettu muistiinpano näkyy listassa uusin ensin.

   Tallennus: kohde.muistiinpanot [{ id, teksti, sijainti, luotu, muokattu }].
   Vienti: havainnot.json "muistiinpanot" ja havainnot.md "Muistiinpanot".
   Keskeneräinen teksti säilyy laitteella (localStorage), jos näkymästä poistuu.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet } = UI;
  const { S, Model } = App;

  const luonnosAvain = () => "ks_muistio_luonnos_" + S.kohde.id;
  const lue = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const kirjoita = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* ei tallennusta */ } };

  function lista() { return (S.kohde.muistiinpanot = S.kohde.muistiinpanot || []); }

  function aika(t) {
    const d = new Date(t), nyt = new Date();
    const klo = "klo " + d.getHours() + "." + String(d.getMinutes()).padStart(2, "0");
    return d.toDateString() === nyt.toDateString() ? klo : d.getDate() + "." + (d.getMonth() + 1) + ". " + klo;
  }
  function tilaTeksti(sij) {
    const t = sij && sij.tilaId && Model.tila(sij.tilaId);
    return t ? Model.tilaNimi(t) : "";
  }

  async function view() {
    const k = S.kohde, root = document.getElementById("app");
    let dict = null;
    // Uuden muistiinpanon tila: Seurannan ehdotus, jos sellainen on (merkitään ehdotukseksi)
    let sij = { kerrosId: null, tilaId: null }, ehdotus = false;
    const e0 = window.Paikannus ? Paikannus.ehdotukset(1)[0] : null;
    if (e0) { sij = { kerrosId: e0.tila.kerrosId, tilaId: e0.tila.id }; ehdotus = true; }

    function noteHtml(n) {
      const t = tilaTeksti(n.sijainti);
      return '<button class="mu-item" data-n="' + n.id + '"><span class="mu-meta">' + esc(aika(n.luotu)) + (t ? " · " + esc(t) : "") + "</span>" +
        '<span class="mu-txt">' + esc(n.teksti) + "</span></button>";
    }
    function tilaRivi() {
      const t = tilaTeksti(sij);
      return '<span class="mu-tila' + (t ? "" : " tyhja") + '">' + icon("pin") + (t ? esc(t) + (ehdotus ? " <small>ehdotus</small>" : "") : "Ei tilaa (yleinen)") + "</span>" +
        '<button class="btn btn-sm" data-a="tila">' + (t ? "Vaihda" : "Valitse tila") + "</button>";
    }
    function paint() {
      const ns = lista().slice().sort((a, b) => b.luotu - a.luotu);
      root.innerHTML = App.topbar({ title: "Muistiinpanot", sub: k.nimi, back: "#/k/" + k.id }) +
        '<main class="view">' +
        '<section class="card mu-uusi"><div class="card-b">' +
          '<textarea data-uusi rows="4" placeholder="Kirjoita tai sanele muistiinpano…" aria-label="Uusi muistiinpano">' + esc(lue(luonnosAvain())) + "</textarea>" +
          '<div class="mu-prev hint" data-prev></div>' +
          '<div class="mu-rivi" data-tilarivi>' + tilaRivi() + "</div>" +
          '<div class="row-btns" style="margin:8px 0 0"><button class="btn" data-mic>' + icon("mic") + '<span data-ml>Pidä: sanele</span></button>' +
            '<button class="btn btn-primary" data-a="tallenna">' + icon("check") + "Tallenna</button></div>" +
          '<p class="hint" style="margin:8px 0 0">Ei henkilöiden nimiä eikä yksilöityjä terveystietoja.</p>' +
        "</div></section>" +
        (ns.length ? '<h2 class="mu-h">Tallennetut · ' + ns.length + "</h2>" + '<div class="mu-lista">' + ns.map(noteHtml).join("") + "</div>"
          : '<p class="hint">Muistiinpanot tulevat raportointipakettiin havaintojen rinnalle.</p>') +
        "</main>" + App.bottomnav("muistio");
      paivitaNappi();
      bindDict();
    }
    function paivitaNappi() {
      const ta = root.querySelector("[data-uusi]"), b = root.querySelector('[data-a="tallenna"]');
      if (b && ta) b.disabled = !ta.value.trim();
    }
    function bindDict() {
      const btn = root.querySelector("[data-mic]"), ta = root.querySelector("[data-uusi]");
      if (dict) dict.stop();
      dict = new Dictation({
        onCommit: (text) => { ta.value = DictButton.appendText(ta.value, text); kirjoita(luonnosAvain(), ta.value); paivitaNappi(); const p = root.querySelector("[data-prev]"); if (p) p.textContent = ""; },
        onPreview: (t) => { const p = root.querySelector("[data-prev]"); if (p) p.textContent = t; },
        onState: (st, msg) => { if ((st === "error" || st === "empty" || st === "recording") && msg) toast(msg, 3500); b.paint(); },
        onAudio: () => toast("Äänitettä ei tallenneta muistiinpanoon. Kirjoita muistiinpano tai käytä Kuva + sanelu -kirjausta.", 4000)
      });
      const b = DictButton.bind(btn, dict, { labelEl: root.querySelector("[data-ml]") });
    }
    async function tallenna() {
      const ta = root.querySelector("[data-uusi]"), teksti = ta.value.trim();
      if (!teksti) return;
      const t = Date.now();
      lista().push({ id: DB.uid("m_"), teksti, sijainti: sij.tilaId ? { kerrosId: sij.kerrosId, tilaId: sij.tilaId } : null, luotu: t, muokattu: t });
      // Seurannan ehdotus hyväksytty tallentamalla (kuten kuvassa): Seuranta kiinnittyy tilaan
      if (ehdotus && sij.tilaId && window.Paikannus) Paikannus.kiinnita(sij.tilaId);
      ehdotus = false;
      await Model.saveKohde();
      kirjoita(luonnosAvain(), "");
      toast("Muistiinpano tallennettu");
      paint();
    }
    function muokkaa(n) {
      sheet('<h3 style="margin:0 0 4px">Muistiinpano</h3><p class="hint" style="margin:0 0 8px">' + esc(aika(n.luotu)) + (tilaTeksti(n.sijainti) ? " · " + esc(tilaTeksti(n.sijainti)) : "") + "</p>" +
        '<textarea data-mt rows="6" style="width:100%">' + esc(n.teksti) + "</textarea>" +
        '<div class="row-btns" style="margin-top:10px"><button class="btn btn-danger" data-x="del">' + icon("trash") + "Poista</button>" +
        '<button class="btn" data-x="tila">' + icon("pin") + "Tila</button><button class=\"btn btn-primary\" data-x=\"ok\">Valmis</button></div>", (el, close) => {
        el.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-x]"); if (!b) return;
          if (b.dataset.x === "ok") {
            const v = el.querySelector("[data-mt]").value.trim();
            if (v && v !== n.teksti) { n.teksti = v; n.muokattu = Date.now(); await Model.saveKohde(); }
            close(); paint();
          } else if (b.dataset.x === "del") {
            close();
            if (!(await confirmSheet({ title: "Poistetaanko muistiinpano?", ok: "Poista", danger: true }))) return;
            S.kohde.muistiinpanot = lista().filter((x) => x.id !== n.id);
            await Model.saveKohde(); paint();
          } else if (b.dataset.x === "tila") {
            close();
            Plan.locationSheet(n.sijainti || { kerrosId: null, tilaId: null }, async (s2) => {
              n.sijainti = s2 && s2.tilaId ? { kerrosId: s2.kerrosId, tilaId: s2.tilaId } : null; n.muokattu = Date.now();
              await Model.saveKohde(); paint();
            }, { noPart: true, title: "Muistiinpanon tila", paikannus: false });
          }
        });
      });
    }

    root.oninput = (e) => {
      if (e.target.matches("[data-uusi]")) { kirjoita(luonnosAvain(), e.target.value); paivitaNappi(); }
    };
    root.onclick = async (e) => {
      const n = e.target.closest("[data-n]");
      if (n) { const x = lista().find((y) => y.id === n.dataset.n); if (x) muokkaa(x); return; }
      const b = e.target.closest("[data-a]"); if (!b) return;
      if (b.dataset.a === "tallenna") await tallenna();
      else if (b.dataset.a === "tila") {
        Plan.locationSheet(sij, (s2) => {
          sij = { kerrosId: s2.kerrosId, tilaId: s2.tilaId }; ehdotus = false;
          root.querySelector("[data-tilarivi]").innerHTML = tilaRivi();
        }, { noPart: true, title: "Muistiinpanon tila", ehdotus });
      }
    };
    paint();
    const ta = root.querySelector("[data-uusi]");
    if (ta && !ta.value) ta.focus();
    S.cleanup = () => { if (dict) dict.stop(); root.oninput = root.onclick = null; };
  }

  /* Vienti: tutkijan kenttämuistiinpanot ilman kuvaa, vanhin ensin */
  function vienti() {
    const ns = (S.kohde.muistiinpanot || []).slice().sort((a, b) => a.luotu - b.luotu);
    if (!ns.length) return null;
    return ns.map((n) => {
      const t = n.sijainti && n.sijainti.tilaId && Model.tila(n.sijainti.tilaId), e = n.sijainti && Model.kerros(n.sijainti.kerrosId);
      const d = new Date(n.luotu);
      return { kirjattu: d.toISOString(), aika: d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear() + " klo " + d.getHours() + "." + String(d.getMinutes()).padStart(2, "0"), kerros: e ? e.nimi : null, tila: t ? Model.tilaNimi(t) : null, teksti: n.teksti };
    });
  }

  window.Muistio = { view, vienti };
})();
