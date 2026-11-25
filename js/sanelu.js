/* =========================================================================
   sanelu.js – Sanelu-painike alapalkissa (Teemu 25.11.2026)

   Pidä Sanelu-painiketta pohjassa: sanelu alkaa heti, ja kohdesivun päälle nousee
   paneeli, jossa näkyvät saneltu teksti ja se, mitä tunnistettiin. Kun päästät
   irti, paneeli jää tarkistettavaksi:
     - Tallentuu: kirjaus (jos sanelun alussa on menetelmä, esim. "pintakosteus,
       keittiö …") tai muistiinpano (muuten). AKK- ja kuntoarviokohteessa sanelu on
       aina havainto, ja osio tunnistetaan sanelusta.
     - Menetelmä, tila ja muut sanelusta poimitut tiedot; jokaisen voi korjata
       yhdellä napautuksella. Epävarma tunnistus keltaisena.
   Lyhyt napautus lukitsee sanelun päälle (uusi napautus lopettaa).
   Pidä uudelleen pohjassa: sanelu jatkuu samaan tekstiin.
   Ilman puheentunnistusta (esim. ei verkkoa) sanelu tallentuu äänitteenä kirjaukseen.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;
  const TAP_MS = 350;
  let P = null;          // avoin paneeli: { el, dict, teksti, esikatselu, h, laji, korjattu:{}, aanite, kuuntelee }

  const ALKU_SANAT = 8;  // menetelmä tunnistetaan sanelun alusta (komento), ei keskeltä kuvausta
  const norm = (t) => Auto._detect.norm(t);
  const kohdeHavainnoille = () => (window.AKK && AKK.aktiivinen()) || (window.Kuntoarvio && Kuntoarvio.aktiivinen());

  function komento(teksti) {
    return Komennot.menetelma(teksti);
  }
  function seurannanTila() {
    const e = window.Paikannus && Paikannus.ehdotukset ? Paikannus.ehdotukset(1)[0] : null;
    return e ? { kerrosId: e.tila.kerrosId, tilaId: e.tila.id, seuranta: true } : null;
  }

  /* Tunnistus tekstistä: nopea (esikatselu) tai täysi (Auto.apply: tulos, tunnus, kentät …) */
  async function tunnista(taysi) {
    const teksti = (P.teksti + " " + (P.esikatselu || "")).trim();
    const k = S.kohde;
    const st = seurannanTila();
    const h = Model.newHavainto(k, { kerrosId: st ? st.kerrosId : null, tilaId: st ? st.tilaId : null });
    if (!st) { h.sijainti.tilaId = null; h.sijainti.rakenneosa = null; }
    h.auto = { tila: st ? "seuranta" : undefined };
    h.sanelu = teksti;
    const cmd = komento(teksti);
    P.cmd = cmd;
    let muutokset = [];
    if (cmd) { h.menetelma = cmd; h.auto.menetelma = "sanelu"; }
    if (taysi) {
      muutokset = await Auto.apply(h);
      if (cmd && h.menetelma !== cmd) { h.menetelma = cmd; h.auto.menetelma = "sanelu"; }
    } else {
      const r = Auto._detect.detectRoom(norm(teksti), h.sijainti.kerrosId);
      if (r && r.id) { const t = Model.tila(r.id); if (t) { h.sijainti.tilaId = t.id; h.sijainti.kerrosId = t.kerrosId; h.auto.tila = "sanelu"; } }
      if (window.AKK && AKK.aktiivinen()) { const o = AKK.tunnistaOsio(teksti); if (o) { h.akkOsa = o; h.auto.akkOsa = "sanelu"; } }
    }
    // Tutkijan korjaukset voimaan
    const kj = P.korjattu;
    if (kj.menetelma !== undefined) { h.menetelma = kj.menetelma; delete h.auto.menetelma; }
    if (kj.sijainti) { h.sijainti = Object.assign(h.sijainti, kj.sijainti); h.auto.tila = "valittu"; }
    P.h = h;
    P.muutokset = muutokset.filter((c) => !["menetelmä", "tila"].includes(c.kentta) && !(c.kentta === "suunnitelma" && /^ei /.test(c.arvo)));
    P.laji = kj.laji || (cmd || kohdeHavainnoille() || P.aanite ? "kirjaus" : "muistiinpano");
  }

  function rivi(nimi, arvo, lahde, tyyli, attr) {
    return '<button class="sn-rivi' + (tyyli ? " " + tyyli : "") + '" ' + attr + '><span class="sn-n">' + esc(nimi) + '</span><span class="sn-a">' + esc(arvo) + '</span><span class="sn-l">' + esc(lahde) + "</span></button>";
  }
  function piirra() {
    if (!P) return;
    const h = P.h, kirjaus = P.laji === "kirjaus";
    const t = h && h.sijainti.tilaId ? Model.tila(h.sijainti.tilaId) : null;
    const m = h && h.menetelma ? M.menetelma(h.menetelma) : null;
    const tilaLahde = !h ? "" : P.korjattu.sijainti ? "korjattu" : h.auto.tila === "sanelu" ? "sanelusta" : h.auto.tila === "seuranta" ? "Seuranta" : "";
    const teksti = (P.teksti + (P.esikatselu ? " " + P.esikatselu : "")).trim();
    const valmis = !P.kuuntelee && (teksti || P.aanite);
    let rivit = "";
    if (h && (teksti || P.aanite)) {
      rivit += rivi("Tallentuu", kirjaus ? "Kirjaus" : "Muistiinpano", P.korjattu.laji ? "korjattu" : kirjaus ? (P.cmd ? "menetelmä sanottiin" : P.aanite ? "äänite" : "kohteen tarkastus") : "ei menetelmää", "", 'data-sn="laji"');
      if (kirjaus && !kohdeHavainnoille()) rivit += rivi("Menetelmä", m ? m.nimi + (h.kentat && h.kentat.tunnus ? " · " + h.kentat.tunnus : "") : "Valitse", P.korjattu.menetelma !== undefined ? "korjattu" : m ? "sanelusta" : "puuttuu", m ? "" : "sn-puuttuu", 'data-sn="menetelma"');
      if (kirjaus && window.AKK && AKK.aktiivinen()) rivit += rivi("Osio", h.akkOsa ? AKK.osio(h.akkOsa).nimi : "Ei tunnistettu", h.akkOsa ? "sanelusta" : "AI tarkistaa viennissä", h.akkOsa ? "" : "sn-epavarma", 'data-sn="osio" disabled');
      rivit += rivi("Tila", t ? Model.tilaNimi(t) : "Ei tilaa", tilaLahde, "", 'data-sn="tila"');
      if (kirjaus && P.muutokset && P.muutokset.length) rivit += '<div class="sn-muut">Sanelusta myös: ' + esc(P.muutokset.map((c) => c.kentta + " " + c.arvo).join(" · ")) + "</div>";
    }
    P.el.innerHTML =
      '<div class="sn-tila"><span class="sn-piste' + (P.kuuntelee ? " on" : "") + '"></span>' + esc(P.kuuntelee ? (P.dict && P.dict.mode === "audio" ? "Äänitetään… päästä irti, kun olet valmis" : "Kuuntelee… päästä irti, kun olet valmis") : valmis ? "Tarkista ja tallenna" : "Pidä Sanelu-painiketta pohjassa ja puhu") + "</div>" +
      (P.muokkaa && valmis ? '<textarea class="sn-ta" data-sn-ta aria-label="Sanelun teksti">' + esc(P.teksti) + "</textarea>"
        : '<div class="sn-teksti">' + (teksti ? esc(teksti) : P.aanite ? "Äänite tallennettu (puheentunnistus ei ollut käytössä). Teksti puretaan raportoinnissa." : '<span class="sn-vihje">Aloita menetelmällä, jos teet kirjauksen (esim. "pintakosteus, keittiö"). Muuten sanelu tallentuu muistiinpanoksi.</span>') + (P.kuuntelee ? '<span class="sn-kursori">▍</span>' : "") + "</div>") +
      rivit +
      (valmis ? '<div class="sn-napit"><button class="btn btn-sm sn-linkki" data-sn="peru">Peru</button>' +
        (teksti ? '<button class="btn btn-sm sn-linkki" data-sn="muokkaa">' + (P.muokkaa ? "Valmis" : "Muokkaa tekstiä") + "</button>" : "") + "</div>" +
        '<div class="sn-napit sn-paa"><button class="btn" data-sn="kuvat">' + icon("cam") + "Lisää kuvia</button>" +
        '<button class="btn btn-primary" data-sn="tallenna">' + icon("check") + "Tallenna</button></div>" +
        '<div class="sn-jatka">Pidä Sanelu-painiketta uudelleen, niin voit jatkaa.</div>' : "");
    const ta = P.el.querySelector("[data-sn-ta]");
    if (ta) { ta.addEventListener("input", () => { P.teksti = ta.value; }); ta.focus(); }
    document.querySelectorAll("[data-sanelu]").forEach((b) => b.classList.toggle("on", !!P.kuuntelee));
  }

  function avaa() {
    if (P) return;
    const tausta = document.createElement("div");
    tausta.className = "sn-tausta";
    const el = document.createElement("section");
    el.className = "sn-paneeli";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Sanelu");
    document.body.appendChild(tausta);
    document.body.appendChild(el);
    P = { el, tausta, dict: null, teksti: "", esikatselu: "", h: null, laji: "muistiinpano", korjattu: {}, aanite: null, kuuntelee: false, muokkaa: false };
    tausta.addEventListener("click", () => { if (!P.kuuntelee && !P.teksti && !P.aanite) sulje(); });
    el.addEventListener("click", klikkaus);
    piirra();
  }
  function sulje() {
    if (!P) return;
    if (P.dict) P.dict.stop();
    P.el.remove(); P.tausta.remove();
    document.querySelectorAll("[data-sanelu]").forEach((b) => b.classList.remove("on"));
    P = null;
  }

  function aloita() {
    if (!S.kohde) return;
    avaa();
    P.muokkaa = false;
    if (!P.dict) {
      P.dict = new Dictation({
        onCommit: (t) => { P && (P.teksti = DictButton.appendText(P.teksti, t), P.esikatselu = "", paivita(true)); },
        onPreview: (t) => { if (P) { P.esikatselu = t; paivita(false); } },
        onState: (st, msg) => { if ((st === "error" || st === "empty") && msg) toast(msg, 3500); },
        onAudio: (blob) => { if (P) { P.aanite = blob; paivita(true); } }
      });
    }
    P.dict.start();
    P.kuuntelee = !!P.dict.active;
    if (P.kuuntelee) DictButton.buzz(15);
    piirra();
  }
  function lopeta() {
    if (!P || !P.kuuntelee) return;
    P.kuuntelee = false;
    P.dict.stop();
    DictButton.buzz(10);
    paivita(true);
  }
  let ajastin = null;
  function paivita(taysi) {
    clearTimeout(ajastin);
    ajastin = setTimeout(async () => { if (!P) return; try { await tunnista(taysi && !P.kuuntelee); } catch (e) { console.warn(e); } piirra(); }, taysi ? 0 : 120);
  }

  /* Alapalkin painike: pidä pohjassa = sanele, lyhyt napautus = lukitse päälle */
  let alas = 0, lukittu = false, pid = null;
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-sanelu]");
    if (!b || e.button > 0) return;
    e.preventDefault();
    if (lukittu && P && P.kuuntelee) { lukittu = false; lopeta(); return; }
    pid = e.pointerId; alas = Date.now();
    try { b.setPointerCapture(pid); } catch (err) { /* ohita */ }
    aloita();
  });
  const irti = (e) => {
    if (pid === null || e.pointerId !== pid) return;
    pid = null;
    if (!P || !P.kuuntelee) return;
    if (Date.now() - alas < TAP_MS) { lukittu = true; return; }
    lopeta();
  };
  document.addEventListener("pointerup", irti);
  document.addEventListener("pointercancel", irti);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-sanelu]")) e.preventDefault(); });
  document.addEventListener("keydown", (e) => {
    const b = e.target.closest && e.target.closest("[data-sanelu]");
    if (!b || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    if (P && P.kuuntelee) lopeta(); else { aloita(); lukittu = true; }
  });
  window.addEventListener("hashchange", () => { if (P && !P.kuuntelee && !P.teksti && !P.aanite) sulje(); });

  async function klikkaus(e) {
    const b = e.target.closest("[data-sn]");
    if (!b || !P || P.kuuntelee) return;
    const x = b.dataset.sn;
    if (x === "peru") { sulje(); return; }
    if (x === "muokkaa") { P.muokkaa = !P.muokkaa; if (!P.muokkaa) await tunnista(true); piirra(); return; }
    if (x === "laji") { P.korjattu.laji = P.laji === "kirjaus" ? "muistiinpano" : "kirjaus"; await tunnista(true); piirra(); return; }
    if (x === "menetelma") {
      MethodPicker.openSheet({ selected: P.h.menetelma, onSelect: async (id) => { if (window.Taidot) Taidot.korjattuMenetelma(P.teksti, id); P.korjattu.menetelma = id; P.korjattu.laji = "kirjaus"; await tunnista(true); piirra(); } });
      return;
    }
    if (x === "tila") {
      Plan.locationSheet({ kerrosId: P.h.sijainti.kerrosId, tilaId: P.h.sijainti.tilaId }, async (s2) => {
        if (!P) return;
        P.korjattu.sijainti = { kerrosId: s2.kerrosId, tilaId: s2.tilaId, piste: null };
        await tunnista(true); piirra();
      }, { noPart: true, title: "Tila", paikannus: false });
      return;
    }
    if (x === "tallenna" || x === "kuvat") {
      b.disabled = true;
      try { await tallenna(x === "kuvat"); } catch (err) { console.warn(err); toast("Tallennus epäonnistui: " + (err.message || err), 4000); b.disabled = false; }
    }
  }

  async function tallenna(kuviin) {
    await tunnista(true);
    const k = S.kohde, h = P.h;
    const teksti = P.teksti.trim();
    if (kuviin && P.laji !== "kirjaus") P.laji = "kirjaus";           // kuva tekee muistiinpanosta kirjauksen
    if (P.laji === "muistiinpano") {
      const t = Date.now();
      const sij = h.sijainti.tilaId ? { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId } : null;
      (k.muistiinpanot = k.muistiinpanot || []).push({ id: DB.uid("m_"), teksti, sijainti: sij, luotu: t, muokattu: t });
      if (sij && h.auto.tila === "seuranta" && window.Paikannus) Paikannus.kiinnita(sij.tilaId);
      await Model.saveKohde();
      sulje();
      toast("Tallennettu muistiinpanoksi");
      App.render();
      return;
    }
    if (P.aanite) {
      const fid = await DB.putFile(k.id, P.aanite, { kind: "aanite", havaintoId: h.id });
      h.aanitteet = (h.aanitteet || []).concat(fid);
    }
    if (h.auto.tila === "seuranta" && h.sijainti.tilaId && window.Paikannus) Paikannus.kiinnita(h.sijainti.tilaId);
    await Model.saveHavainto(h);
    if (h.menetelma) { k.viimeisin = Object.assign({}, k.viimeisin || {}, { menetelma: h.menetelma, kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId }); await Model.saveKohde(); }
    sulje();
    if (kuviin) { location.hash = "#/k/" + k.id + "/kuvaus/" + h.id; return; }
    toast("Tallennettu kirjaukseksi: " + (h.menetelma ? M.menetelma(h.menetelma).nimi : "menetelmä puuttuu") + " (" + nro(h) + ")");
    App.render();
  }
  const nro = (h) => UI.nro(h);

  window.Sanelu = { aloita, lopeta, sulje, get auki() { return !!P; }, _tila: () => P && { teksti: P.teksti, laji: P.laji, menetelma: P.h && P.h.menetelma, tila: P.h && P.h.sijainti.tilaId } };
})();
