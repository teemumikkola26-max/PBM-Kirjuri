/* =========================================================================
   kenttalomake-vienti-kirjuriin.js – siirtotyökalun ensimmäinen puoli
   Ajetaan PBM Kenttälomakkeessa (kenttalomake.html), kun kohde on auki.
   Tekee ZIP-tiedoston "Kirjuri-siirto_<kohde>.zip", jonka Kirjuri tuo
   (Kohteet → Tuo kenttälomakkeesta).

   Käyttöönotto kenttälomakkeessa (yksi kerta), joko
     a) lisää kenttalomake.html:n loppuun  <script src="kenttalomake-vienti-kirjuriin.js"></script>
        ja kutsu  vieKirjuriin()  esim. Lisää toimintoja -valikon painikkeesta, tai
     b) avaa kohde, avaa selaimen konsoli ja liitä tämän tiedoston sisältö,
        sitten  vieKirjuriin()

   Sisältö: kohteen perustiedot (ilman yhteyshenkilöä), kirjaukset kenttineen,
   valokuvat, pohjakuvan merkit ja merkinnät, tutkimussuunnitelma, menetelmien
   kenttärakenteet (nimet arvojen tulkintaan) ja pohjakuva-PDF.
   Muoto: siirto.json { format: "kenttalomake-siirto", version: 1, … } + tiedostot/.
   ========================================================================= */
/* global project, entries, METHODS, studyPlan, planMarkup, floorPlanBlob, JSZip */
async function vieKirjuriin() {
  if (typeof JSZip === "undefined") throw new Error("JSZip puuttuu");
  const zip = new JSZip();
  const tiedostot = zip.folder("tiedostot");
  const kuva = async (p) => {
    if (p.blob instanceof Blob) return p.blob;
    if (p.path && window.SubmissionSync) { try { return await window.SubmissionSync.downloadPhoto(p.path); } catch (e) { console.warn("Kuvaa ei saatu", p.path, e); } }
    return null;
  };
  let puuttuu = 0;
  const kirjaukset = [];
  for (const e of entries) {
    const kuvat = [];
    for (const [i, p] of (e.photos || []).filter((x) => !x.deleted).entries()) {
      const b = await kuva(p);
      if (!b) { puuttuu++; continue; }
      const nimi = "k_" + e.id + "_" + (i + 1) + (/png/i.test(b.type) ? ".png" : ".jpg");
      tiedostot.file(nimi, b);
      kuvat.push({ tiedosto: "tiedostot/" + nimi, kuvateksti: p.caption || "" });
    }
    kirjaukset.push({ id: e.id, methodId: e.methodId, values: e.values || {}, marker: e.marker || null, kuvat, author: e.author || "", createdAt: e.createdAt || e.created || null });
  }
  if (floorPlanBlob instanceof Blob) tiedostot.file("pohjakuva.pdf", floorPlanBlob);
  const data = {
    format: "kenttalomake-siirto", version: 1, vietu: new Date().toISOString(),
    kohde: { nimi: project.nimi || "", osoite: project.osoite || "", tilaaja: project.tilaaja || "", projektinumero: project.projektinumero || "", tutkija: project.tutkija || "", pvm: project.pvm || "" },
    menetelmat: (METHODS || []).map((m) => ({ id: m.id, name: m.name, fields: (m.fields || []).map((f) => ({ id: f.id, label: f.label, type: f.type })) })),
    kirjaukset,
    suunnitelma: ((studyPlan && studyPlan.items) || []).map((i) => ({ id: i.id, section: i.section || "", method: i.method || "", text: i.text || "", target: i.target || "", done: !!i.done, skip: !!i.skip, reason: i.reason || "" })),
    merkinnat: ((planMarkup && planMarkup.shapes) || []),
    pohjakuva: floorPlanBlob instanceof Blob ? "tiedostot/pohjakuva.pdf" : null
  };
  zip.file("siirto.json", JSON.stringify(data, null, 1));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const nimi = "Kirjuri-siirto_" + String(project.nimi || "kohde").replace(/[^A-Za-z0-9ÅÄÖåäö_-]+/g, "_").slice(0, 40) + ".zip";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nimi; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  const viesti = "Siirtotiedosto tehty: " + kirjaukset.length + " kirjausta" + (puuttuu ? ", " + puuttuu + " kuvaa ei saatu (ei verkkoa?)" : "") + ".";
  console.log(viesti);
  try { if (typeof toast === "function") toast(viesti); } catch (e) { /* ohita */ }
  return { nimi, kirjauksia: kirjaukset.length, kuviaPuuttuu: puuttuu };
}
if (typeof window !== "undefined") window.vieKirjuriin = vieKirjuriin;
