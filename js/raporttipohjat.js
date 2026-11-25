/* =========================================================================
   raporttipohjat.js – Word-raportti yrityksen omasta pohjasta (#/k/<id>/word)

   Moottori: raporttipohja-moottori.js (PBM Kenttälomakkeen report-template-engine,
   merkinnät {{kohde}}, {{kirjaukset}}, {{toista:rh}} … ennallaan, joten kenttälomakkeen
   pohjat toimivat). Tämä moduuli
     1. muuntaa Kirjurin kirjaukset moottorin tietomalliin (aineisto),
     2. pitää pohjat laitteella (IndexedDB) ja hakee ne SharePointin
        kirjaston kansiosta Raporttipohjat/ (kun pilvi on käytössä),
     3. tekee .docx-tiedoston ja jakaa tai lataa sen.

   Tietosuoja: raportti muodostetaan puhelimessa; mitään ei lähetetä muualle.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet } = UI;
  const { S, Model } = App;
  const AVAIN = "pohja:";

  /* ---------- Pohjat laitteella ---------- */
  async function lista() {
    const kaikki = (await DB.all("asetukset")) || [];
    return kaikki.filter((x) => String(x.id).indexOf(AVAIN) === 0).sort((a, b) => (b.lisatty || 0) - (a.lisatty || 0));
  }
  async function lisaa(nimi, blob, lahde) {
    const x = { id: AVAIN + DB.uid("p_"), nimi, blob, lisatty: Date.now(), lahde: lahde || "laite" };
    // Sama nimi korvaa vanhan (SharePointista päivitetty pohja)
    for (const v of await lista()) if (v.nimi === nimi) await DB.del("asetukset", v.id);
    await DB.put("asetukset", x);
    return x;
  }

  /* ---------- Kirjuri → moottorin tietomalli ---------- */
  const tyyppi = (t) => t === "num" ? "number" : t === "calc" ? "calc" : t === "table" ? "table" : t === "textarea" ? "textarea" : t === "date" ? "date" : "text";
  function menetelmat() {
    return M.MENETELMAT.map((m) => ({
      id: m.id, name: m.nimi, short: m.lyhyt || "",
      fields: (m.kentat || []).map((f) => ({
        id: f.k, label: f.l + (f.u && f.t !== "table" ? " (" + f.u + ")" : ""), type: tyyppi(f.t),
        columns: f.t === "table" ? (f.sarakkeet || []).map((c) => ({ id: c.k, label: c.l + (c.u ? " (" + c.u + ")" : ""), type: tyyppi(c.t) })) : undefined
      })).concat([
        { id: "tila", label: "Tila", type: "text" },
        { id: "tulos", label: "Tulos", type: "text" }
      ])
    }));
  }
  function osioNimi(h) {
    if (h.akkOsa && window.AKK) { const d = AKK.OSIOT.find((x) => x.id === h.akkOsa); if (d) return d.luku + " " + d.nimi; }
    if (h.kaOsa && window.KAData) { const d = KAData.OSAT.find((x) => x.id === h.kaOsa); if (d) return d.nimi; }
    return Model.sijaintiTeksti(h.sijainti) || "";
  }
  async function kuvaTavut(fid) {
    let f = await DB.get("tiedostot", fid);
    if ((!f || !f.blob) && S.kohde.pilvi && window.Sync) { const b = await Sync.haeTiedosto(S.kohde.id, fid).catch(() => null); f = b ? { blob: b.blob || b } : null; }
    if (!f || !f.blob) return null;
    const pieni = await Camera.shrink(f.blob, 1600);
    const bmp = await createImageBitmap(pieni);
    return { bytes: new Uint8Array(await pieni.arrayBuffer()), width: bmp.width, height: bmp.height };
  }
  async function aineisto(k, opts) {
    opts = opts || {};
    const RN = window.Export && Export.raporttiNro ? Export.raporttiNro() : (h) => UI.nro(h.nro);
    const hs = S.havainnot.slice().sort((a, b) => String(RN(a)).localeCompare(String(RN(b)), "fi", { numeric: true }));
    const entries = [];
    for (const h of hs) {
      if (!h.menetelma) continue;
      const m = M.menetelma(h.menetelma);
      const values = {};
      (m.kentat || []).forEach((f) => { values[f.k] = f.t === "table" ? M.rivit(h, f) : h.kentat[f.k]; });
      values.paikka = RN(h) + (h.kentat.tunnus ? " " + h.kentat.tunnus : "");
      values.osio = osioNimi(h);
      values.tila = Model.sijaintiTeksti(h.sijainti) || "";
      values.tulos = h.tulos ? M.TULOKSET[h.tulos] : "";
      values.huomiot = [h.sanelu, h.tulkinta ? "Alustava tulkinta: " + h.tulkinta : ""].filter((x) => x && String(x).trim()).join("\n");
      const photos = [];
      if (opts.kuvat !== false) {
        for (const [i, fid] of h.kuvat.entries()) {
          const p = await kuvaTavut(fid).catch(() => null);
          if (p) photos.push(Object.assign(p, { caption: RN(h) + (h.kuvat.length > 1 ? " (" + (i + 1) + ")" : "") + (values.tila ? " · " + values.tila : "") }));
        }
      }
      entries.push({ methodId: h.menetelma, values, photos, marker: !!(h.sijainti && h.sijainti.piste), markerLabel: RN(h) });
    }
    const osiot = [];
    entries.forEach((e) => { if (e.values.osio && !osiot.includes(e.values.osio)) osiot.push(e.values.osio); });
    return {
      project: { nimi: k.nimi, osoite: k.osoite || "", tilaaja: k.tilaaja || "", yhteyshenkilo: "", tutkija: k.tutkija || "", pvm: k.pvm || "", projektinumero: k.projektinro || "" },
      methods: menetelmat(), entries, osiot, reportDate: new Date().toISOString().slice(0, 10)
    };
  }

  async function tee(pohja) {
    if (!window.JSZip) await UI.loadScript("lib/jszip.min.js");
    toast("Muodostetaan Word-raporttia…", 8000);
    const input = await aineisto(S.kohde);
    const out = await ReportTemplateEngine.fill(await pohja.blob.arrayBuffer(), input, { type: "blob" });
    const blob = out.output;
    const varoitukset = (out && out.warnings) || [];
    const nimi = "Raportti_" + String(S.kohde.nimi || "kohde").replace(/[^A-Za-z0-9ÅÄÖåäö_-]+/g, "_").slice(0, 40) + "_" + new Date().toISOString().slice(0, 10) + ".docx";
    const file = new File([blob], nimi, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nimi }); return { nimi, varoitukset }; } catch (e) { if (e && e.name === "AbortError") return { nimi, varoitukset }; }
    }
    const url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = nimi; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast("Raportti tallennettu: " + nimi, 4000);
    return { nimi, varoitukset, blob };
  }

  /* ---------- Näkymä ---------- */
  async function view() {
    const k = S.kohde;
    const root = document.getElementById("app");
    let pilvi = null, varoitukset = null;
    async function paint() {
      const omat = await lista();
      root.innerHTML = App.topbar({ title: "Word-raportti", sub: k.nimi, back: "#/k/" + k.id + "/lahto" }) +
        '<main class="view no-nav">' +
        '<p class="hint" style="margin:0 0 12px">Raportti tehdään yrityksen Word-pohjasta. Pohjan merkinnät ({{kohde}}, {{kirjaukset}}, {{toista:rh}} …) ovat samat kuin Kenttälomakkeessa. Raportti muodostetaan puhelimessa; tietoja ei lähetetä muualle.</p>' +
        '<section class="card"><div class="card-h"><h2>Pohjat tällä laitteella</h2><span class="meta">' + omat.length + "</span></div>" +
        (omat.length ? omat.map((p) => '<div class="row"><div class="grow"><div class="t">' + esc(p.nimi) + '</div><div class="s">' + esc((p.lahde === "sharepoint" ? "SharePoint · " : "") + UI.pvm(p.lisatty)) + "</div></div>" +
          '<button class="btn btn-sm btn-primary" data-a="tee" data-id="' + esc(p.id) + '">' + icon("download") + "Tee raportti</button>" +
          '<button class="icon-btn" data-a="poista" data-id="' + esc(p.id) + '" aria-label="Poista pohja">' + icon("trash") + "</button></div>").join("")
          : '<div class="empty">Ei pohjia. Lisää .docx-pohja tiedostosta' + (window.Cloud && Cloud.enabled ? " tai hae SharePointista" : "") + ".</div>") +
        '<div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap;padding-top:10px"><button class="btn" data-a="lisaa">' + icon("plus") + "Lisää pohja (.docx)</button>" +
        (window.Cloud && Cloud.enabled && Cloud.palvelu ? '<button class="btn" data-a="pilvi">' + icon("download") + "Hae SharePointista</button>" : "") + "</div></section>" +
        (pilvi ? '<section class="card"><div class="card-h"><h2>SharePoint: Raporttipohjat</h2></div>' +
          (pilvi.length ? pilvi.map((p) => '<div class="row"><div class="grow"><div class="t">' + esc(p.nimi) + "</div></div>" +
            '<button class="btn btn-sm" data-a="lataa" data-n="' + esc(p.nimi) + '">Lataa laitteelle</button></div>').join("")
            : '<div class="empty">Kirjaston kansiossa Raporttipohjat ei ole .docx-pohjia.</div>') + "</section>" : "") +
        (varoitukset && varoitukset.length ? '<section class="card"><div class="card-h"><h2>Tarkista raportissa</h2></div><div class="card-b"><ul style="margin:0;padding-left:18px">' +
          varoitukset.map((v) => "<li>" + esc(v) + "</li>").join("") + "</ul></div></section>" : "") +
        "</main>";
    }
    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      try {
        if (a === "lisaa") {
          const files = await UI.pickFile(".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          if (!files[0]) return;
          if (!/\.docx$/i.test(files[0].name)) { toast("Valitse .docx-tiedosto"); return; }
          await lisaa(files[0].name, files[0], "laite"); toast("Pohja lisätty"); await paint();
        } else if (a === "pilvi") {
          toast("Haetaan pohjia…"); pilvi = await Cloud.palvelu.pohjat(); await paint();
        } else if (a === "lataa") {
          const blob = await Cloud.palvelu.haePohja(b.dataset.n);
          await lisaa(b.dataset.n, blob, "sharepoint"); toast("Pohja ladattu laitteelle"); await paint();
        } else if (a === "poista") {
          if (!(await confirmSheet({ title: "Poistetaanko pohja laitteelta?", ok: "Poista", danger: true }))) return;
          await DB.del("asetukset", b.dataset.id); await paint();
        } else if (a === "tee") {
          const p = (await lista()).find((x) => x.id === b.dataset.id);
          if (!p) return;
          b.disabled = true;
          const r = await tee(p);
          varoitukset = r.varoitukset; await paint();
        }
      } catch (err) { console.warn(err); toast("Ei onnistunut: " + (err.message || err), 4000); b.disabled = false; }
    };
    await paint();
    S.cleanup = () => { root.onclick = null; };
  }

  window.Raporttipohjat = { view, aineisto, lista, lisaa, tee };
})();
