/* =========================================================================
   komennot.js – puheohjaus kamerassa ja sanelussa
   Sanelun alku tai loppu voi olla komento:
     "seuraava" / "seuraava kirjaus"  → tallentaa ja aloittaa uuden kirjauksen
     "kumoa" / "poista kuva"           → poistaa viimeisimmän kuvan
     "yleiskuva"                       → vaihtaa yleiskuviin
   Menetelmä, tila, RH-syvyys ym. tunnistetaan edelleen tekstistä (autofill/fieldfill),
   joten esim. "PKO 101 lattia kostea seuraava" kirjaa ja siirtyy seuraavaan.
   ========================================================================= */
(function () {
  "use strict";
  const PELKKA_KUMOA = /^(kumoa|peru|poista (viimeinen |edellinen )?kuva)[.!]?$/i;
  const PELKKA_YK = /^yleiskuva[t]?[.!]?$/i;
  const SEURAAVA_LOPPU = /[\s,.]*(?:ja\s+)?seuraava(?:\s+(?:kirjaus|havainto|kohta))?[.!]?\s*$/i;
  const SEURAAVA_ALKU = /^\s*seuraava(?:\s+(?:kirjaus|havainto|kohta))?[.,!]?\s*/i;

  function tulkitse(text) {
    let t = String(text || "").trim();
    const out = { teksti: "", seuraava: false, kumoa: false, yleiskuva: false };
    if (!t) return out;
    if (PELKKA_KUMOA.test(t)) { out.kumoa = true; return out; }
    if (PELKKA_YK.test(t)) { out.yleiskuva = true; return out; }
    if (SEURAAVA_LOPPU.test(t)) { out.seuraava = true; t = t.replace(SEURAAVA_LOPPU, ""); }
    else if (SEURAAVA_ALKU.test(t) && t.replace(SEURAAVA_ALKU, "").length === 0) { out.seuraava = true; t = ""; }
    out.teksti = t.trim();
    return out;
  }

  /* Menetelmä sanelun alusta (komento): "PKO …", "RH-mittaus …", "rakenneavaus …".
     Toimii, vaikka menetelmän tunnistus koko tekstistä olisi asetuksissa pois. */
  const ALKU_SANAT = 8;
  function menetelma(text) {
    if (!window.Auto || !Auto._detect) return null;
    const alku = String(text || "").trim().split(/\s+/).slice(0, ALKU_SANAT).join(" ");
    return alku ? Auto._detect.detectMethod(Auto._detect.norm(alku)) : null;
  }

  window.Komennot = { tulkitse, menetelma };
})();
