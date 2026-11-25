/* =========================================================================
   sharepoint.js – Kirjurin pilvipalvelu: SharePoint Microsoft Graphin kautta

   Rakenne organisaation Kirjuri-sivustolla (ks. KAYTTOONOTTO-SHAREPOINT.md):
     Lista "Kirjuri-rivit"     yksi kohde = useita rivejä (sama malli kuin sync.js:n rivit)
       Title      avain  <kohde>|<laji>|<id>   (yksilöllinen, indeksoitu)
       KohdeId    kohteen tunnus                (indeksoitu)
       Laji       kohde, kerros, tila, kohta, havainto, tiedosto, …
       RiviId     rivin tunnus
       Data       rivin sisältö JSON-tekstinä (monirivinen, pelkkä teksti)
       Poistettu  kyllä/ei
       Muokkaaja  viimeisen muokkaajan nimi
     Kirjasto "Kirjuri"
       Kohteet/<kansio>/tiedostot/<tiedosto>   kuvat, pohjakuvat, äänitteet
       Kohteet/<kansio>/rivit/<laji>_<id>.json  poikkeuksellisen suuret rivit (> 60 000 merkkiä)

   Kaksi tutkijaa voi kirjata samaan kohteeseen: eri rivit eivät koske toisiinsa.
   Muutokset haetaan Modified-ajan perusteella (minuutin limitys; sync.js tunnistaa
   jo haetut tiivisteestä). Rivin tallennus: tunnettu rivi päivitetään, uusi luodaan;
   jos toinen laite ehti luoda saman rivin (409), se haetaan ja päivitetään.
   ========================================================================= */
(function () {
  "use strict";
  const C = window.KS_CONFIG || {};
  if (!window.Cloud || !Cloud.enabled) return;
  const BASE = Cloud.tila === "testi" ? location.origin + "/graph-testi/v1.0" : "https://graph.microsoft.com/v1.0";
  const SUURI = 60000;
  const PREFER = { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" };
  let ids = null;      // { site, list, drive }

  class GraphError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }

  async function req(method, path, opts) {
    opts = opts || {};
    const t = await Cloud.token();
    if (!t) throw new GraphError(401, "Kirjautuminen vanhentunut", "kirjaudu");
    const h = Object.assign({ Authorization: "Bearer " + t }, opts.headers || {});
    let body = opts.body;
    if (body && !(body instanceof Blob) && typeof body !== "string") { body = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const url = /^https?:/.test(path) ? path : BASE + path;
    for (let yritys = 0; ; yritys++) {
      const r = await fetch(url, { method, headers: h, body });
      if ((r.status === 429 || r.status === 503) && yritys < 4) {          // kuormitusraja: odota ja yritä uudelleen
        const s = Number(r.headers.get("Retry-After")) || 2 ** yritys;
        await new Promise((res) => setTimeout(res, Math.min(30, s) * 1000));
        continue;
      }
      if (!r.ok) {
        let msg = r.status + " " + r.statusText, code = "";
        try { const j = await r.json(); msg = (j.error && j.error.message) || msg; code = (j.error && j.error.code) || ""; } catch (e) { /* ohita */ }
        throw new GraphError(r.status, msg, code);
      }
      if (opts.raw) return r;
      if (r.status === 204) return null;
      const ct = r.headers.get("Content-Type") || "";
      return ct.includes("json") ? r.json() : r.blob();
    }
  }
  const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
  const esc = (s) => String(s).replace(/'/g, "''");

  async function tunnukset() {
    if (ids) return ids;
    try { ids = JSON.parse(localStorage.getItem("kirjuri.sp.ids") || "null"); } catch (e) { ids = null; }
    if (ids && ids.sivusto === C.sivusto) return ids;
    const site = await req("GET", "/sites/" + C.sivusto + "?$select=id");
    const lists = await req("GET", "/sites/" + site.id + "/lists?$select=id,displayName&$filter=displayName eq '" + esc(C.lista) + "'");
    const drives = await req("GET", "/sites/" + site.id + "/drives?$select=id,name");
    const list = (lists.value || []).find((l) => l.displayName === C.lista);
    const drive = (drives.value || []).find((d) => d.name === C.kirjasto);
    if (!list) throw new GraphError(404, "SharePoint-listaa \"" + C.lista + "\" ei löydy sivustolta.", "asetus");
    if (!drive) throw new GraphError(404, "Dokumenttikirjastoa \"" + C.kirjasto + "\" ei löydy sivustolta.", "asetus");
    ids = { sivusto: C.sivusto, site: site.id, list: list.id, drive: drive.id };
    try { localStorage.setItem("kirjuri.sp.ids", JSON.stringify(ids)); } catch (e) { /* ohita */ }
    return ids;
  }

  /* Rivi-id:t (SharePointin listakohteiden tunnukset) muistetaan laitteella */
  const itemMap = {};
  async function kartta(kid) {
    if (!itemMap[kid]) itemMap[kid] = ((await DB.get("asetukset", "sp:" + kid)) || {}).items || {};
    return itemMap[kid];
  }
  const tallennaKartta = (kid) => DB.put("asetukset", { id: "sp:" + kid, items: itemMap[kid] || {} });

  const FIELDS = "Title,KohdeId,Laji,RiviId,Data,Poistettu,Muokkaaja,Modified";
  async function kaikkiSivut(polku) {
    const out = [];
    let url = polku;
    while (url) {
      const r = await req("GET", url, { headers: PREFER });
      out.push(...(r.value || []));
      url = r["@odata.nextLink"] || null;
    }
    return out;
  }
  async function kansioDatasta(kid, f) {
    let data = {};
    try { data = f.Data ? JSON.parse(f.Data) : {}; } catch (e) { data = {}; }
    if (data && data._tiedosto) {
      const b = await req("GET", "/drives/" + ids.drive + "/root:/" + enc(data._tiedosto) + ":/content");
      data = JSON.parse(await b.text());
    }
    return data;
  }

  const palvelu = {
    async me() {
      return req("GET", "/me?$select=id,displayName,mail,userPrincipalName");
    },

    /* Pilven kohteet (laji = kohde) */
    async kohteet() {
      const I = await tunnukset();
      const rows = await kaikkiSivut("/sites/" + I.site + "/lists/" + I.list + "/items?$expand=fields($select=" + FIELDS + ")&$filter=fields/Laji eq 'kohde'&$top=500");
      return rows.map((r) => r.fields).filter((f) => !f.Poistettu).map((f) => {
        let d = {}; try { d = JSON.parse(f.Data || "{}"); } catch (e) { /* ohita */ }
        return { id: f.KohdeId, nimi: d.nimi || "", updated_at: f.Modified, deleted: false };
      }).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    },

    /* Muuttuneet rivit kursorista (ISO-aika) lähtien */
    async muutokset(kid, cursor) {
      const I = await tunnukset();
      const map = await kartta(kid);
      let f = "fields/KohdeId eq '" + esc(kid) + "'";
      if (cursor) f += " and fields/Modified gt '" + new Date(Date.parse(cursor) - 60000).toISOString() + "'";
      const items = await kaikkiSivut("/sites/" + I.site + "/lists/" + I.list + "/items?$expand=fields($select=" + FIELDS + ")&$filter=" + encodeURIComponent(f) + "&$top=500");
      const rows = [];
      for (const it of items) {
        const x = it.fields;
        map[x.Laji + ":" + x.RiviId] = it.id;
        rows.push({ laji: x.Laji, id: x.RiviId, data: x.Poistettu ? {} : await kansioDatasta(kid, x), deleted: !!x.Poistettu, updated_at: x.Modified, updated_by: x.Muokkaaja || "" });
      }
      await tallennaKartta(kid);
      rows.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)) || a.laji.localeCompare(b.laji) || String(a.id).localeCompare(String(b.id)));
      return rows;
    },

    /* Rivien tallennus: [{ laji, id, data, deleted }] */
    async tallennaRivit(kid, rows, kansio) {
      const I = await tunnukset();
      const map = await kartta(kid);
      const me = (Cloud.user() || {}).nimi || "";
      const yksi = async (r) => {
        const key = r.laji + ":" + r.id;
        let data = JSON.stringify(r.data || {});
        if (data.length > SUURI) {                         // suuri rivi tiedostoksi
          const polku = "Kohteet/" + (kansio || kid) + "/rivit/" + r.laji + "_" + r.id + ".json";
          await req("PUT", "/drives/" + I.drive + "/root:/" + enc(polku) + ":/content", { body: new Blob([data], { type: "application/json" }), headers: { "Content-Type": "application/json" } });
          data = JSON.stringify({ _tiedosto: polku });
        }
        const fields = { KohdeId: kid, Laji: r.laji, RiviId: String(r.id), Data: data, Poistettu: !!r.deleted, Muokkaaja: me };
        const paivita = (itemId) => req("PATCH", "/sites/" + I.site + "/lists/" + I.list + "/items/" + itemId + "/fields", { body: fields });
        if (map[key]) {
          try { await paivita(map[key]); return; } catch (e) { if (e.status !== 404) throw e; delete map[key]; }
        }
        try {
          const it = await req("POST", "/sites/" + I.site + "/lists/" + I.list + "/items", { body: { fields: Object.assign({ Title: kid + "|" + key.replace(":", "|") }, fields) } });
          map[key] = it.id;
        } catch (e) {
          if (e.status !== 409) throw e;                   // toinen laite ehti luoda rivin: haetaan ja päivitetään
          const loyto = await req("GET", "/sites/" + I.site + "/lists/" + I.list + "/items?$select=id&$filter=" + encodeURIComponent("fields/Title eq '" + esc(kid + "|" + key.replace(":", "|")) + "'"), { headers: PREFER });
          const id = loyto.value && loyto.value[0] && loyto.value[0].id;
          if (!id) throw e;
          map[key] = id;
          await paivita(id);
        }
      };
      // Neljä rinnakkain: nopea, mutta ei kuormitusrajaa
      const jono = rows.slice();
      const tyontekija = async () => { while (jono.length) await yksi(jono.shift()); };
      try { await Promise.all([tyontekija(), tyontekija(), tyontekija(), tyontekija()]); }
      finally { await tallennaKartta(kid); }
    },

    /* Kuva tai muu tiedosto kirjastoon */
    async lahetaTiedosto(kid, kansio, nimi, blob, type) {
      const I = await tunnukset();
      const polku = "Kohteet/" + (kansio || kid) + "/tiedostot/" + nimi;
      if (blob.size <= 4 * 1024 * 1024) {
        await req("PUT", "/drives/" + I.drive + "/root:/" + enc(polku) + ":/content?@microsoft.graph.conflictBehavior=replace", { body: blob, headers: { "Content-Type": type || blob.type || "application/octet-stream" } });
        return;
      }
      // Suuri tiedosto: latausistunto paloina (jatkuu katkoksen jälkeen seuraavalla synkronoinnilla alusta)
      const s = await req("POST", "/drives/" + I.drive + "/root:/" + enc(polku) + ":/createUploadSession", { body: { item: { "@microsoft.graph.conflictBehavior": "replace" } } });
      const PALA = 5 * 1024 * 1024 + 2 * 327680;            // 320 KiB:n monikerta
      for (let a = 0; a < blob.size; a += PALA) {
        const b = Math.min(blob.size, a + PALA);
        const r = await fetch(s.uploadUrl, { method: "PUT", headers: { "Content-Range": "bytes " + a + "-" + (b - 1) + "/" + blob.size }, body: blob.slice(a, b) });
        if (!r.ok && r.status !== 202) throw new GraphError(r.status, "Tiedoston lataus keskeytyi", "lataus");
      }
    },
    async haeTiedosto(kid, kansio, nimi) {
      const I = await tunnukset();
      try { return await req("GET", "/drives/" + I.drive + "/root:/" + enc("Kohteet/" + (kansio || kid) + "/tiedostot/" + nimi) + ":/content"); }
      catch (e) { if (e.status === 404) return null; throw e; }
    },

    /* Raporttipohjat: kirjaston kansio Raporttipohjat/ (pääkäyttäjät ylläpitävät toimistolla) */
    async pohjat() {
      const I = await tunnukset();
      try {
        const r = await req("GET", "/drives/" + I.drive + "/root:/Raporttipohjat:/children?$select=name,size,lastModifiedDateTime");
        return (r.value || []).filter((x) => /\.docx$/i.test(x.name)).map((x) => ({ nimi: x.name, koko: x.size, muokattu: x.lastModifiedDateTime }));
      } catch (e) { if (e.status === 404) return []; throw e; }
    },
    async haePohja(nimi) {
      const I = await tunnukset();
      return req("GET", "/drives/" + I.drive + "/root:/" + enc("Raporttipohjat/" + nimi) + ":/content");
    },

    GraphError,
    _nollaa() { ids = null; Object.keys(itemMap).forEach((k) => delete itemMap[k]); }
  };
  Cloud.palvelu = palvelu;
})();
