/* =========================================================================
   piirto.js – merkintöjen piirtäminen havaintokuvaan (kuten kenttälomakkeessa)

   Työkalut: kynä, ympyrä, nelikulmio ja nuoli; värit; kumoa.
   Muodot tallennetaan kuvan suhteellisina koordinaatteina (0–1), jotta ne voi
   avata ja muokata myöhemmin. Tallennettaessa muodostetaan uusi kuva, jossa
   merkinnät ovat näkyvissä (kortti, pikkukuvat, raportointipaketti).
   Alkuperäinen kuva säilyy (h.piirrokset[uusiId].orig) ja menee pakettiin
   kansioon kuvat/alkuperaiset/, jotta raportoinnissa näkyy myös merkitsemätön kuva.

   Piirto.avaa({ blob, muodot, otsikko }) -> Promise<{ blob, muodot } | null>
   ========================================================================= */
(function () {
  "use strict";
  const { icon, toast } = UI;

  const VARIT = ["#e11d48", "#facc15", "#2563eb", "#16a34a", "#ffffff", "#111111"];
  const TYOKALUT = [["pen", "Kynä"], ["ellipse", "Ympyrä"], ["rect", "Nelikulmio"], ["arrow", "Nuoli"]];

  /* Muoto piirretään kontekstiin, jonka koko on W×H (px). Viivan paksuus suhteessa kuvan leveyteen. */
  function piirraMuoto(g, m, W, H) {
    const lw = Math.max(2, (m.w || 0.006) * Math.max(W, H));
    g.save();
    g.strokeStyle = m.c; g.fillStyle = m.c; g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
    // Tumma reunus vaaleille väreille, jotta merkintä erottuu vaalealta pinnalta
    if (m.c === "#ffffff" || m.c === "#facc15") { g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = lw * 0.8; }
    const P = (p) => [p[0] * W, p[1] * H];
    if (m.t === "pen") {
      g.beginPath();
      m.p.forEach((p, i) => { const [x, y] = P(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    } else {
      const [x1, y1] = P(m.a), [x2, y2] = P(m.b);
      if (m.t === "rect") { g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
      else if (m.t === "ellipse") {
        g.beginPath(); g.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(1, Math.abs(x2 - x1) / 2), Math.max(1, Math.abs(y2 - y1) / 2), 0, 0, Math.PI * 2); g.stroke();
      } else if (m.t === "arrow") {
        const a = Math.atan2(y2 - y1, x2 - x1), k = lw * 4.5;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - Math.cos(a) * k * 0.6, y2 - Math.sin(a) * k * 0.6); g.stroke();
        g.beginPath(); g.moveTo(x2, y2);
        g.lineTo(x2 - k * Math.cos(a - 0.45), y2 - k * Math.sin(a - 0.45));
        g.lineTo(x2 - k * Math.cos(a + 0.45), y2 - k * Math.sin(a + 0.45));
        g.closePath(); g.fill();
      }
    }
    g.restore();
  }

  /* Valmis kuva: alkuperäinen täysikokoisena + muodot */
  async function koosta(blob, muodot) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0);
    muodot.forEach((m) => piirraMuoto(g, m, c.width, c.height));
    if (bmp.close) bmp.close();
    return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  }

  function avaa(o) {
    return new Promise(async (resolve) => {
      const muodot = (o.muodot || []).map((m) => JSON.parse(JSON.stringify(m)));
      let tyokalu = "pen", vari = VARIT[0], kesken = null, valmis = false;
      const bmp = await createImageBitmap(o.blob);
      const v = document.createElement("div");
      v.className = "piirto";
      v.innerHTML =
        '<div class="pi-top"><button class="btn" data-x="peru">Peruuta</button><span class="pi-ots">' + (o.otsikko || "Piirrä kuvaan") + "</span>" +
          '<button class="btn btn-primary" data-x="ok">' + icon("check") + "Tallenna</button></div>" +
        '<div class="pi-alue"><canvas></canvas></div>' +
        '<div class="pi-tyot">' + TYOKALUT.map(([t, l]) => '<button class="pi-btn" data-t="' + t + '">' + l + "</button>").join("") +
          '<button class="pi-btn" data-x="kumoa" disabled>Kumoa</button></div>' +
        '<div class="pi-varit">' + VARIT.map((c) => '<button class="pi-vari" data-c="' + c + '" style="background:' + c + '" aria-label="Väri ' + c + '"></button>').join("") + "</div>";
      document.body.appendChild(v);
      const alue = v.querySelector(".pi-alue"), cv = v.querySelector("canvas"), g = cv.getContext("2d");
      let W = 0, H = 0, dpr = window.devicePixelRatio || 1;

      function mitoita() {
        const r = alue.getBoundingClientRect(), s = Math.min(r.width / bmp.width, r.height / bmp.height);
        W = Math.max(1, Math.floor(bmp.width * s)); H = Math.max(1, Math.floor(bmp.height * s));
        cv.style.width = W + "px"; cv.style.height = H + "px";
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        piirra();
      }
      function piirra() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H); g.drawImage(bmp, 0, 0, W, H);
        muodot.concat(kesken ? [kesken] : []).forEach((m) => piirraMuoto(g, m, W, H));
        v.querySelector('[data-x="kumoa"]').disabled = !muodot.length;
      }
      function maalaa() {
        v.querySelectorAll("[data-t]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === tyokalu)));
        v.querySelectorAll("[data-c]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === vari)));
      }
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };

      cv.addEventListener("pointerdown", (e) => {
        e.preventDefault(); cv.setPointerCapture(e.pointerId);
        const p = pos(e);
        kesken = tyokalu === "pen" ? { t: "pen", c: vari, w: 0.008, p: [p] } : { t: tyokalu, c: vari, w: 0.008, a: p, b: p };
        piirra();
      });
      cv.addEventListener("pointermove", (e) => {
        if (!kesken) return;
        const p = pos(e);
        if (kesken.t === "pen") kesken.p.push(p); else kesken.b = p;
        piirra();
      });
      const loppu = () => {
        if (!kesken) return;
        const pieni = kesken.t === "pen" ? kesken.p.length < 2 : Math.hypot(kesken.b[0] - kesken.a[0], kesken.b[1] - kesken.a[1]) < 0.01;
        if (!pieni) {
          if (kesken.t === "pen") kesken.p = kesken.p.map((q) => [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]);
          muodot.push(kesken);
        }
        kesken = null; piirra();
      };
      cv.addEventListener("pointerup", loppu);
      cv.addEventListener("pointercancel", () => { kesken = null; piirra(); });

      function sulje(tulos) {
        if (valmis) return; valmis = true;
        window.removeEventListener("resize", mitoita);
        v.remove(); if (bmp.close) bmp.close();
        resolve(tulos);
      }
      v.addEventListener("click", async (e) => {
        const t = e.target.closest("[data-t]"), c = e.target.closest("[data-c]"), x = e.target.closest("[data-x]");
        if (t) { tyokalu = t.dataset.t; maalaa(); }
        else if (c) { vari = c.dataset.c; maalaa(); }
        else if (x && x.dataset.x === "kumoa") { muodot.pop(); piirra(); }
        else if (x && x.dataset.x === "peru") sulje(null);
        else if (x && x.dataset.x === "ok") {
          x.disabled = true;
          try { sulje({ blob: await koosta(o.blob, muodot), muodot }); }
          catch (err) { console.warn(err); toast("Kuvan tallennus ei onnistunut"); x.disabled = false; }
        }
      });
      window.addEventListener("resize", mitoita);
      maalaa(); mitoita();
    });
  }

  window.Piirto = { avaa, koosta, piirraMuoto, VARIT };
})();
