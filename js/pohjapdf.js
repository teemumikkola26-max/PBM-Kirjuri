/* =========================================================================
   pohjapdf.js – pohjakuva PDF:nä muokattavin merkinnöin (kuten kenttälomakkeessa)

   Havainnot ja olosuhdeseurannan mittalaitteet viedään oikeina PDF-
   kommentteina (FreeText-nuolitekstilaatikko: laatikko, nuoli ja pallo
   kärjessä yhtenä objektina). Adobe Acrobatissa ja muissa kommentteja
   tukevissa ohjelmissa merkintöjä voi siirtää, muokata ja poistaa
   raporttia tehdessä; ne eivät ole poltettuja kuvaan.

   Pohja: alkuperäinen PDF-sivu vektorina (kerros.planPdfId, tallennetaan
   PDF-pohjakuvan lisäyksen yhteydessä v48 alkaen), kopioituna sellaisenaan.
   Sovelluksen koordinaatit (0–1, näyttöasento) muunnetaan sivun kierron ja
   rajauksen mukaan. Jos alkuperäistä
   PDF:ää ei ole (kuvana lisätty tai vanha pohjakuva), sivuksi tulee kuva.

   PohjaPdf.luo(kerros, RN) -> Blob (application/pdf)
   ========================================================================= */
(function () {
  "use strict";
  const { S, Model } = App;
  const PDFLIB = "lib/pdf-lib.min.js";

  const VARI = { poikkeama: "#a15a1e", ok: "#2f6f4e", muu: "#33455c", laite: "#1f5f8b" };
  const rgb01 = (hex) => { const n = parseInt(hex.slice(1), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
  const pvm = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return "D:" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
  // Vakiofontti (WinAnsi): ä, ö ja å ovat mukana, muut merkit korvataan
  const winAnsi = (s) => String(s || "").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "?");

  function lisaaAnnot(doc, page, ref) {
    const { PDFName, PDFArray } = PDFLib;
    let a = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!a) { a = doc.context.obj([]); page.node.set(PDFName.of("Annots"), a); }
    a.push(ref);
  }

  /* Nuolitekstilaatikko (FreeTextCallout) omalla ulkoasulla (AP), jotta se näkyy samoin kaikissa katselimissa */
  function callout(doc, page, font, o) {
    const { PDFString, PDFHexString } = PDFLib, ctx = doc.context;
    const k = o.k, fs = 9 * k, pad = 4 * k, r = 7 * k, ringW = 2.2 * k, bw = 1.2 * k, lw = 1.4 * k;
    const text = winAnsi(o.text), tw = font.widthOfTextAtSize(text, fs), boxW = tw + pad * 2, boxH = fs + pad * 2;
    const cx = o.boxCx, cy = o.boxCy, bl = cx - boxW / 2, bb = cy - boxH / 2;
    const dx = o.x - cx, dy = o.y - cy;
    let ax = cx, ay = cy, viiva = false;
    if (dx || dy) {
      const t = Math.min(dx ? (boxW / 2) / Math.abs(dx) : Infinity, dy ? (boxH / 2) / Math.abs(dy) : Infinity);
      if (t < 1) { ax = cx + dx * t; ay = cy + dy * t; viiva = true; }
    }
    const m = r + ringW + 1;
    const rect = [Math.min(bl, o.x - m), Math.min(bb, o.y - m), Math.max(bl + boxW, o.x + m), Math.max(bb + boxH, o.y + m)];
    // T: näyttöasennon koordinaatit -> sivun (kiertämättömät) koordinaatit [a b c d e f]
    const T = o.T || [1, 0, 0, 1, 0, 0], tp = (x, y) => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]];
    const kulmat = [tp(rect[0], rect[1]), tp(rect[2], rect[1]), tp(rect[0], rect[3]), tp(rect[2], rect[3])];
    const rectS = [Math.min(...kulmat.map((q) => q[0])), Math.min(...kulmat.map((q) => q[1])), Math.max(...kulmat.map((q) => q[0])), Math.max(...kulmat.map((q) => q[1]))];
    const kaanto = T[0] === 1 && T[3] === 1 && !T[1] && !T[2];
    const c = o.color, col = c.r.toFixed(3) + " " + c.g.toFixed(3) + " " + c.b.toFixed(3), f = (n) => n.toFixed(2), kk = 0.5523, px = o.x, py = o.y;
    const ops = ["q"];
    if (viiva) ops.push(col + " RG", f(lw) + " w", "1 J", f(ax) + " " + f(ay) + " m", f(px) + " " + f(py) + " l", "S");
    ops.push("1 1 1 rg", f(bl) + " " + f(bb) + " " + f(boxW) + " " + f(boxH) + " re", "f",
      col + " RG", f(bw) + " w", f(bl + bw / 2) + " " + f(bb + bw / 2) + " " + f(boxW - bw) + " " + f(boxH - bw) + " re", "S",
      "BT", "/F1 " + f(fs) + " Tf", "0.12 0.12 0.12 rg", f(bl + pad) + " " + f(bb + pad + 0.15 * fs) + " Td", font.encodeText(text).toString() + " Tj", "ET",
      col + " rg", col + " RG", f(ringW) + " w",
      f(px + r) + " " + f(py) + " m",
      f(px + r) + " " + f(py + r * kk) + " " + f(px + r * kk) + " " + f(py + r) + " " + f(px) + " " + f(py + r) + " c",
      f(px - r * kk) + " " + f(py + r) + " " + f(px - r) + " " + f(py + r * kk) + " " + f(px - r) + " " + f(py) + " c",
      f(px - r) + " " + f(py - r * kk) + " " + f(px - r * kk) + " " + f(py - r) + " " + f(px) + " " + f(py - r) + " c",
      f(px + r * kk) + " " + f(py - r) + " " + f(px + r) + " " + f(py - r * kk) + " " + f(px + r) + " " + f(py) + " c",
      "f", "Q");
    const ap = ctx.register(ctx.stream(ops.join("\n"), { Type: "XObject", Subtype: "Form", FormType: 1, BBox: rect, Matrix: T, Resources: { Font: { F1: font.ref } } }));
    const k1 = tp(px, py), k2 = tp(ax, ay);
    const perus = {
      Type: "Annot", Subtype: "FreeText", Rect: rectS,
      IT: "FreeTextCallout", CL: [k1[0], k1[1], k2[0], k2[1]], LE: "Circle",
      Contents: PDFHexString.fromText(o.text), Subj: PDFHexString.fromText(o.subj || ""),
      DA: PDFString.of("0.12 0.12 0.12 rg /Helv " + f(fs) + " Tf"),
      C: [c.r, c.g, c.b], IC: [1, 1, 1], CA: 1, BS: { W: bw }, F: 4,
      T: PDFString.of("Kirjuri"), M: PDFString.of(pvm()), NM: PDFString.of(o.nimi), AP: { N: ap }
    };
    // Kiertämätön sivu: tekstilaatikon reunat (RD). Kierretty sivu: Acrobatin Rotate-merkintä tekstin suunnalle.
    if (kaanto) perus.RD = [bl - rect[0], bb - rect[1], rect[2] - (bl + boxW), rect[3] - (bb + boxH)];
    else perus.Rotate = o.rot || 0;
    const annot = ctx.obj(perus);
    lisaaAnnot(doc, page, ctx.register(annot));
    return [bl, bb, bl + boxW, bb + boxH];
  }

  /* Pohjasivu: alkuperäinen PDF-sivu näyttöasennossa tai kuva */
  async function pohjasivu(doc, kerros) {
    const { PDFDocument } = PDFLib;
    const pdfF = kerros.planPdfId && await DB.get("tiedostot", kerros.planPdfId);
    if (pdfF && pdfF.blob) {
      // Alkuperäinen sivu kopioidaan sellaisenaan (vektori, kierto ja rajaus säilyvät). Merkinnät lasketaan
      // näyttöasennossa ja muunnetaan sivun koordinaatteihin (T), joten ne osuvat samaan kohtaan kuin sovelluksessa.
      const src = await PDFDocument.load(await pdfF.blob.arrayBuffer(), { ignoreEncryption: true });
      const idx = Math.max(0, Math.min(src.getPageCount() - 1, (kerros.planPdfSivu || 1) - 1));
      const [page] = await doc.copyPages(src, [idx]);
      doc.addPage(page);
      const cb = page.getCropBox(), rot = (((page.getRotation().angle || 0) % 360) + 360) % 360;
      const w = cb.width, h = cb.height, x0 = cb.x, y0 = cb.y, pysty = rot === 90 || rot === 270;
      const T = { 0: [1, 0, 0, 1, x0, y0], 90: [0, 1, -1, 0, x0 + w, y0], 180: [-1, 0, 0, -1, x0 + w, y0 + h], 270: [0, -1, 1, 0, x0, y0 + h] }[rot] || [1, 0, 0, 1, x0, y0];
      return { page, PW: pysty ? h : w, PH: pysty ? w : h, T, rot, vektori: true };
    }
    const f = kerros.planId && await DB.get("tiedostot", kerros.planId);
    if (!f || !f.blob) return null;
    const bytes = await f.blob.arrayBuffer();
    const img = /png/i.test(f.blob.type) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    // Kuva A3-vaakaleveyteen (1191 pt), korkeus kuvan mittasuhteessa
    const PW = 1191, PH = PW * img.height / img.width;
    const page = doc.addPage([PW, PH]);
    page.drawImage(img, { x: 0, y: 0, width: PW, height: PH });
    return { page, PW, PH, T: [1, 0, 0, 1, 0, 0], rot: 0, vektori: false };
  }

  async function luo(kerros, RN) {
    await UI.loadScript(PDFLIB);
    const { PDFDocument, StandardFonts } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle("Pohjakuva " + kerros.nimi + " – " + (S.kohde.nimi || ""));
    doc.setCreator("Kirjuri");
    const p = await pohjasivu(doc, kerros);
    if (!p) return null;
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const { page, PW, PH, T, rot } = p;
    const k = Math.max(1, Math.min(3, Math.max(PW, PH) / 842));
    const varatut = [];
    const paallekkain = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
    // Tekstilaatikko kärjen viereen: ensimmäinen suunta, joka ei osu aiempiin laatikoihin
    function paikka(x, y, txt) {
      const fs = 9 * k, w = font.widthOfTextAtSize(winAnsi(txt), fs) + 8 * k, h = fs + 8 * k, d = 26 * k;
      const ehd = [[d + w / 2, d * 0.6], [-(d + w / 2), d * 0.6], [d + w / 2, -d * 0.6], [-(d + w / 2), -d * 0.6], [0, d + h], [0, -(d + h)], [d * 2 + w / 2, 0], [-(d * 2 + w / 2), 0]];
      for (const [ox, oy] of ehd) {
        const cx = Math.min(PW - w / 2 - 2, Math.max(w / 2 + 2, x + ox)), cy = Math.min(PH - h / 2 - 2, Math.max(h / 2 + 2, y + oy));
        const bx = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (!varatut.some((v) => paallekkain(v, bx))) return { cx, cy };
      }
      return { cx: Math.min(PW - w / 2 - 2, x + d + w / 2), cy: y + d * 0.6 };
    }
    const lyhyt = (h) => { try { return h.menetelma ? window.M.menetelma(h.menetelma) : null; } catch (e) { return null; } };
    let n = 0;
    S.havainnot.filter((h) => h.sijainti && h.sijainti.piste && h.sijainti.kerrosId === kerros.id)
      .sort((a, b) => String(RN(a)).localeCompare(String(RN(b)), "fi", { numeric: true }))
      .forEach((h) => {
        const x = h.sijainti.piste.x * PW, y = PH - h.sijainti.piste.y * PH;
        const m = lyhyt(h), t = h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
        const txt = RN(h) + (m && m.lyhyt ? " " + m.lyhyt : "");
        const pk = paikka(x, y, txt);
        const subj = RN(h) + (m ? " " + m.nimi : "") + (t ? " – " + Model.tilaNimi(t) : "") + (h.sanelu ? ": " + String(h.sanelu).slice(0, 160) : "");
        varatut.push(callout(doc, page, font, { x, y, boxCx: pk.cx, boxCy: pk.cy, k, T, rot, text: txt, subj, nimi: "ks-" + h.id + "-" + (n++),
          color: rgb01(h.tulos === "poikkeama" ? VARI.poikkeama : h.tulos === "ok" ? VARI.ok : VARI.muu) }));
      });
    (S.kohde.seuranta || []).filter((x) => x.nro && x.sijainti && x.sijainti.piste && x.sijainti.kerrosId === kerros.id).forEach((x) => {
      const px = x.sijainti.piste.x * PW, py = PH - x.sijainti.piste.y * PH, txt = Seuranta.tunnus(x);
      const pk = paikka(px, py, txt);
      varatut.push(callout(doc, page, font, { x: px, y: py, boxCx: pk.cx, boxCy: pk.cy, k, T, rot, text: txt, subj: "Olosuhdeseurannan mittalaite " + txt, nimi: "ks-" + x.id + "-" + (n++), color: rgb01(VARI.laite) }));
    });
    // Tutkijan piirtämät merkinnät (plan-markup.js): muokattavina PDF-merkintöinä samalle sivulle
    const ml = kerros.merkinnat || [];
    if (ml.length && window.PlanMarkup && window.Plan) {
      const sk = PW / Plan.MW;
      const skaalattu = ml.map((x) => Object.assign({}, x, {
        page: doc.getPageCount(),
        pts: (x.pts || []).map((pt) => [pt[0] * sk, pt[1] * sk]),
        width: x.width != null ? x.width * sk : x.width,
        fontSize: x.fontSize != null ? x.fontSize * sk : x.fontSize,
        size: x.size != null ? x.size * sk : x.size
      }));
      try { PlanMarkup.addToPdf(PDFLib, doc, skaalattu, await doc.embedFont(StandardFonts.Helvetica)); }
      catch (e) { console.warn("Merkinnät PDF:ään", e); }
    }
    const out = await doc.save();
    return new Blob([out], { type: "application/pdf" });
  }

  /* Pohjakuvanäkymän painike: jako tai lataus */
  async function lataa(kerros) {
    UI.toast("Muodostetaan PDF:ää…", 4000);
    try {
      const nro = window.Export && Export.raporttiNro ? Export.raporttiNro() : (h) => UI.nro(h.nro);
      const blob = await luo(kerros, nro);
      if (!blob) { UI.toast("Kerroksella ei ole pohjakuvaa"); return; }
      const nimi = "Pohjakuva_" + String(kerros.nimi).replace(/[^A-Za-z0-9ÅÄÖåäö_-]+/g, "_") + "_" + String(S.kohde.nimi || "kohde").replace(/[^A-Za-z0-9ÅÄÖåäö_-]+/g, "_").slice(0, 40) + ".pdf";
      const file = new File([blob], nimi, { type: "application/pdf" });
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: nimi }); return; } catch (e) { if (e && e.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = nimi; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      UI.toast("PDF tallennettu: " + nimi, 4000);
    } catch (err) { console.warn(err); UI.toast("PDF:n muodostus ei onnistunut"); }
  }

  /* Havaintokuva PDF:nä, jossa tutkijan piirtämät merkinnät ovat muokattavia PDF-merkintöjä
     (Acrobat, PDF-XChange): raportoidessa nuolen tai rajauksen voi siirtää tai poistaa.
     Pohjana alkuperäinen kuva ilman merkintöjä. muodot: piirto.js-muodot (0–1-koordinaatit). */
  async function kuvaPdf(blob, muodot, otsikko) {
    await UI.loadScript(PDFLIB);
    const { PDFDocument, StandardFonts } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setCreator("Kirjuri");
    if (otsikko) doc.setTitle(otsikko);
    const bytes = await blob.arrayBuffer();
    const img = /png/i.test(blob.type) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const PW = 842, PH = PW * img.height / img.width;
    const page = doc.addPage([PW, PH]);
    page.drawImage(img, { x: 0, y: 0, width: PW, height: PH });
    const L = Math.max(PW, PH);
    const P = (q) => [q[0] * PW, q[1] * PH];
    const tyyppi = { pen: "pen", rect: "rect", ellipse: "ellipse", arrow: "arrow" };
    const shapes = (muodot || []).filter((m) => tyyppi[m.t]).map((m, i) => ({
      id: "k" + i, page: 1, type: tyyppi[m.t], pts: m.t === "pen" ? (m.p || []).map(P) : [P(m.a), P(m.b)],
      stroke: m.c || "#e11d48", width: Math.max(1, (m.w || 0.006) * L), dash: "solid", fill: null, fillOpacity: 0, opacity: 1, author: "Kirjuri"
    }));
    if (shapes.length && window.PlanMarkup) PlanMarkup.addToPdf(PDFLib, doc, shapes, await doc.embedFont(StandardFonts.Helvetica));
    return new Blob([await doc.save()], { type: "application/pdf" });
  }

  window.PohjaPdf = { luo, lataa, kuvaPdf };
})();
