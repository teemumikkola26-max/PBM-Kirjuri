/* =========================================================================
   siirto.js – siirtotyökalun toinen puoli: kenttälomakkeen kohde Kirjuriin
   Lähde: tools/kenttalomake-vienti-kirjuriin.js (ajetaan kenttälomakkeessa) →
   ZIP, jossa siirto.json (format "kenttalomake-siirto", version 1) ja tiedostot/.

   Muunnos
   - kohde: nimi, osoite, projektinumero, tutkija, pvm, tilaaja (yhteyshenkilöä ei tuoda)
   - kirjaukset → kirjaukset: sama menetelmä, jos Kirjurissa on sama tunnus (muuten "muu");
     kenttä, jonka tunnus on Kirjurissa sama, siirtyy kenttään; mittaustaulukon sarakkeet
     tunnuksen tai nimen mukaan; muut arvot havaintotekstiin muodossa "Nimi: arvo"
   - kuvat, pohjakuvan merkki (sivu → kerros "Pohjakuva s. N", kohta x/y),
     pohjakuvan merkinnät (plan-markup, viitekokoon), tutkimussuunnitelma
   Siirretyt kirjaukset merkitään (h.siirretty), ja ne näkyvät kuten muutkin.
   ========================================================================= */
(function () {
  "use strict";
  const { S, Model } = App;
  const norm = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-zåäö0-9]/g, "");
  const tyhja = (v) => v == null || String(v).trim() === "" || (Array.isArray(v) && !v.length);
  const PLAN_KEY = "__planItem";
  // Kenttälomakkeen kenttä → Kirjurin taulukkosarake, kun tunnus tai nimi poikkeaa
  const SARAKE = { lampo: "t", lampotila: "t", lamp: "t", abs: "a", paiva: "pvm", lukupaiva: "pvm" };

  function onSiirto(zip) { return !!zip.file("siirto.json"); }

  async function tuo(zip) {
    const data = JSON.parse(await zip.file("siirto.json").async("string"));
    if (data.format !== "kenttalomake-siirto") throw new Error("Siirtotiedoston muotoa ei tunnisteta.");
    const kk = data.kohde || {};
    const k = Model.newKohde({ nimi: kk.nimi || "Kenttälomakkeen kohde", tutkija: kk.tutkija || "" });
    Object.assign(k, { osoite: kk.osoite || "", projektinro: kk.projektinumero || "", pvm: kk.pvm || k.pvm, tilaaja: kk.tilaaja || "", siirretty: { lahde: "kenttalomake", aika: Date.now() } });
    // Tutkimussuunnitelma
    k.suunnitelma = (data.suunnitelma || []).map((i) => ({
      id: "p_" + i.id, menetelma: M.MENETELMAT.some((m) => m.id === i.method) ? i.method : "muu",
      maara: parseInt(i.target, 10) || 1, kuvaus: [i.section, i.text].filter(Boolean).join(": "),
      pois: i.skip ? { syy: i.reason || "Kenttälomakkeessa ohitettu", aika: Date.now() } : undefined
    }));
    await DB.put("kohteet", k);
    S.kohde = null;
    await App.loadKohde(k.id);
    const K = S.kohde;

    // Pohjakuva: yksi kerros jokaista käytettyä PDF-sivua kohti
    const sivut = new Set();
    (data.kirjaukset || []).forEach((e) => { if (e.marker) sivut.add(e.marker.page || 1); });
    (data.merkinnat || []).forEach((s) => sivut.add(s.page || 1));
    if (data.pohjakuva && zip.file(data.pohjakuva)) {
      const pdf = new File([await zip.file(data.pohjakuva).async("blob")], "pohjakuva.pdf", { type: "application/pdf" });
      if (!sivut.size) sivut.add(1);
      // pdf.js: sivun leveys merkintöjen mittakaavaan
      await UI.loadScript("lib/pdf.min.js");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
      const doc = await pdfjsLib.getDocument({ data: await pdf.arrayBuffer(), isEvalSupported: false }).promise;
      for (const n of [...sivut].sort((a, b) => a - b)) {
        const kerros = { id: DB.uid("e_"), nimi: sivut.size > 1 ? "Pohjakuva s. " + n : "Pohjakuva" };
        K.kerrokset.push(kerros);
        await Model.saveKohde();
        await Plan.asetaPohja(kerros, pdf, { sivu: n, eiTunnistusta: true });
        kerros.pdfSivu = n;
        const vp = (await doc.getPage(Math.min(n, doc.numPages))).getViewport({ scale: 1 });
        const sk = Plan.MW / vp.width;
        kerros.planSuhde = Math.round((vp.height / vp.width) * 10000) / 10000;
        kerros.merkinnat = (data.merkinnat || []).filter((s) => (s.page || 1) === n).map((s) => Object.assign({}, s, {
          page: 1, pts: (s.pts || []).map((p) => [p[0] * sk, p[1] * sk]),
          width: s.width != null ? s.width * sk : s.width, fontSize: s.fontSize != null ? s.fontSize * sk : s.fontSize, size: s.size != null ? s.size * sk : s.size
        }));
      }
      await Model.saveKohde();
    }
    const kerrosSivulle = (n) => K.kerrokset.find((e) => e.pdfSivu === (n || 1)) || null;

    // Kirjaukset
    const menetelmat = {};
    (data.menetelmat || []).forEach((m) => { menetelmat[m.id] = m; });
    let n = 0, kuvia = 0;
    for (const e of data.kirjaukset || []) {
      const mid = M.MENETELMAT.some((m) => m.id === e.methodId) ? e.methodId : "muu";
      const km = M.menetelma(mid), lm = menetelmat[e.methodId] || { fields: [] };
      const h = Model.newHavainto(K, { menetelma: mid });
      h.sijainti = { kerrosId: null, tilaId: null, rakenneosa: null, piste: null };
      h.siirretty = { lahde: "kenttalomake", id: e.id, menetelma: e.methodId };
      if (e.createdAt) { const t = Date.parse(e.createdAt); if (t) h.created = t; }
      const rivit = [];
      const taulu = (km.kentat || []).find((f) => f.t === "table");
      const rivi = {};
      const label = (id) => { const f = (lm.fields || []).find((x) => x.id === id); return f ? f.label : id; };
      Object.entries(e.values || {}).forEach(([id, v]) => {
        if (id === PLAN_KEY) { if (v) h.suunnitelmaId = "p_" + v; return; }
        if (tyhja(v)) return;
        const f = (km.kentat || []).find((x) => x.k === id || norm(x.l) === norm(label(id)));
        if (f && f.t !== "table" && f.t !== "textarea" && !Array.isArray(v)) { h.kentat[f.k] = String(v); return; }
        const c = taulu && (taulu.sarakkeet || []).find((x) => x.k === id || x.k === SARAKE[id] || norm(x.l) === norm(label(id)));
        if (c && !Array.isArray(v)) { rivi[c.k] = String(v); return; }
        if (Array.isArray(v)) { v.forEach((r) => rivit.push(Object.entries(r || {}).map(([a, b]) => label(a) + " " + b).join(", "))); return; }
        const lf = (lm.fields || []).find((x) => x.id === id);
        h.sanelu += (h.sanelu ? "\n" : "") + (lf && lf.type === "textarea" ? String(v) : label(id) + ": " + v);
      });
      if (taulu && Object.keys(rivi).length) h.kentat[taulu.k] = [Object.assign({ id: DB.uid("r_") }, rivi)];
      if (rivit.length) h.sanelu += (h.sanelu ? "\n" : "") + "Mittaukset: " + rivit.join("; ");
      if (e.marker) {
        const ke = kerrosSivulle(e.marker.page);
        if (ke) { h.sijainti.kerrosId = ke.id; h.sijainti.piste = { x: e.marker.x, y: e.marker.y }; }
        if (e.marker.label) h.sanelu += (h.sanelu ? "\n" : "") + "Merkintä pohjakuvassa: " + e.marker.label;
      }
      for (const p of e.kuvat || []) {
        const zf = zip.file(p.tiedosto);
        if (!zf) continue;
        const b = await zf.async("blob");
        h.kuvat.push(await DB.putFile(K.id, new Blob([b], { type: /\.png$/i.test(p.tiedosto) ? "image/png" : "image/jpeg" }), { kind: "kuva", havaintoId: h.id }));
        kuvia++;
      }
      await Model.saveHavainto(h);
      n++;
    }
    await Model.saveKohde();
    return { id: K.id, kirjauksia: n, kuvia };
  }

  window.Siirto = { onSiirto, tuo };
})();
