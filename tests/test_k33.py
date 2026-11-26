"""K3.3: etusivu, uusi kohde raporttivalinnalla, kohdesivu (raportti, pääpainike, pohjakuva), yhden menetelmän
raportti kamerassa, raportti lähtötietopaketista. Ajo: python3 tests/test_k33.py"""
import asyncio, subprocess, sys, time, os, json
from playwright.async_api import async_playwright
T = os.path.dirname(os.path.abspath(__file__)); JUURI = os.path.dirname(T); OUT = T + "/kuvat"; os.makedirs(OUT, exist_ok=True)
P = 8797
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(P)], cwd=JUURI, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
U = f"http://localhost:{P}/index.html"; fails = []
def check(n, c, i=""):
    print(("OK   " if c else "FAIL ") + n, i)
    if not c: fails.append(n)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]); errs = []
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", permissions=["camera"])
        await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();localStorage.setItem('ks.ohje.kuvaus','1');localStorage.setItem('ks_tutkija','Testi Tutkija');sessionStorage.setItem('x','1')}}catch(e){}")
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(U); await pg.wait_for_timeout(900)
        txt = await pg.inner_text("body")
        check("etusivu Omat kohteet", "Omat kohteet" in txt)
        check("etusivulla asetukset-ratas", await pg.locator(".tb-asetus").count() == 1)
        await pg.screenshot(path=OUT + "/k33_01_etusivu.png")
        # Uusi kohde
        await pg.click('[data-act="newKohde"]'); await pg.wait_for_timeout(500)
        check("uusi kohde -näkymä", "#/uusi" in pg.url)
        check("paluu: Kohteet", (await pg.inner_text(".tb-back-t")).strip() == "Kohteet")
        check("4 yleistä + muu", await pg.locator("[data-rv]").count() == 4 and await pg.locator("[data-rv-muut]").count() == 1)
        check("luo estetty", await pg.locator('[data-uk="luo"]').is_disabled())
        await pg.screenshot(path=OUT + "/k33_02_uusi.png", full_page=True)
        await pg.click("[data-rv-muut]"); await pg.wait_for_timeout(200)
        check("muut auki (10)", await pg.locator("[data-rv]").count() == 10)
        await pg.click('[data-rv="vss"]'); await pg.fill("[data-uk-nimi]", "Testitalo VSS"); await pg.wait_for_timeout(200)
        check("luo sallittu", not await pg.locator('[data-uk="luo"]').is_disabled())
        await pg.screenshot(path=OUT + "/k33_03_uusi_valittu.png", full_page=True)
        await pg.click('[data-uk="luo"]'); await pg.wait_for_timeout(900)
        txt = await pg.inner_text("main")
        check("kohdesivu: raportti", "VSS-tarkastus" in txt)
        check("kohdesivu: pääpainike", await pg.locator(".u-paa").count() == 1)
        check("kohdesivu: ei pohjakuvaa -kortti", "Ei pohjakuvaa" in txt)
        check("kalustokortti ennen 1. kirjausta", "Mukaan kentälle" in txt)
        await pg.screenshot(path=OUT + "/k33_04_kohde.png", full_page=True)
        om = await pg.evaluate("App.S.kohde.oletusMenetelma")
        check("oletusmenetelmä vss", om == "vss", om)
        # kamera: menetelmä raportista
        await pg.click(".u-paa"); await pg.wait_for_timeout(1200)
        mn = await pg.evaluate("(document.querySelector('[data-mname]')||{}).textContent||''")
        check("kamera: VSS valmiina", "VSS" in mn or "Väestönsuoj" in mn, mn)
        check("ei pikavalintaa", await pg.locator(".pv-sheet, [data-pikavalinta]").count() == 0)
        await pg.screenshot(path=OUT + "/k33_05_kamera.png")
        # kalusto: VSS-ryhmä
        kid = await pg.evaluate("App.S.kohde.id")
        await pg.goto(U + "#/k/" + kid + "/kalusto"); await pg.wait_for_timeout(700)
        txt = await pg.inner_text("main")
        check("kalusto: VSS-kalusto", "Ajanottokello" in txt)
        check("paluu: Kohde", (await pg.inner_text(".tb-back-t")).strip() == "Kohde")
        # raportin vaihto
        await pg.goto(U + "#/k/" + kid); await pg.wait_for_timeout(700)
        await pg.click('[data-act="raporttiVaihda"]'); await pg.wait_for_timeout(300)
        await pg.click('.sheet [data-rv="kuntoarvio"], [data-rv="kuntoarvio"] >> nth=-1'); await pg.wait_for_timeout(700)
        r = await pg.evaluate("[App.S.kohde.raportti, App.S.kohde.oletusMenetelma, App.S.kohde.suunnitelma.map(p=>p.menetelma).join(',')]")
        check("vaihto kuntoarvioon", r[0] == "kuntoarvio" and not r[1] and "kuntoarvio" in r[2], r)
        txt = await pg.inner_text("main")
        check("kuntoarvio: Uusi havainto", "Uusi havainto" in txt)
        # lähtötietopaketti: raportti päätellään ja valitaan
        res = await pg.evaluate("""()=>{const j={muoto:'kuva-sanelu-lahtotiedot',versio:1,suunnitelma:[{menetelma:'rh',maara:6},{menetelma:'avaus',maara:2}]};
          const a=Raportit.paketista(j), b=Raportit.paketista({raportti:{arvo:'VSS-tarkastus',lahde:{tiedosto:'Tarjous.pdf',ote:'väestönsuojan määräaikaistarkastus'},varmuus:'varma'}}),
          c=Raportit.paketista({suunnitelma:[{menetelma:'rh',maara:4}]}), d=Raportit.paketista({kuntoarvio:{perustiedot:{rakennusvuosi:1978}}});
          return [a&&a.id,a&&a.varma,b&&b.id,b&&b.peruste,c&&c.id,d&&d.id,d&&d.varma]}""")
        check("päättely: seloste", res[0] == "tutkimusseloste" and res[1], res)
        check("paketin kenttä: VSS", res[2] == "vss" and "Tarjous.pdf" in res[3], res)
        check("päättely: RH", res[4] == "rh", res)
        check("päättely: kuntoarvio epävarma", res[5] == "kuntoarvio" and res[6] is False, res)
        # pohjakuva kohdesivulla + huoneen napautus
        await pg.evaluate("""async()=>{const k=App.S.kohde;const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,800,500);g.strokeRect(10,10,380,480);g.strokeRect(390,10,400,480);
          const blob=await new Promise(r=>c.toBlob(r,'image/png'));const id=await DB.putFile(k.id,blob,{kind:'pohja'});
          k.kerrokset=[{id:'e1',nimi:'1. krs',planId:id},{id:'e2',nimi:'2. krs',planId:id}];
          k.tilat=[{id:'t1',kerrosId:'e1',tunnus:'101',nimi:'Luokka',pos:{x:.25,y:.5},alue:[{x:.01,y:.02},{x:.49,y:.02},{x:.49,y:.98},{x:.01,y:.98}]},{id:'t2',kerrosId:'e1',tunnus:'102',nimi:'Käytävä',pos:{x:.75,y:.5}}];
          await App.Model.saveKohde();}""")
        await pg.goto(U + "#/x"); await pg.goto(U + "#/k/" + kid); await pg.wait_for_timeout(900)
        check("kerrosvälilehdet", await pg.locator(".u-tab").count() == 2)
        await pg.screenshot(path=OUT + "/k33_06_kohde_pohja.png", full_page=True)
        box = await pg.locator("[data-uplan] img").bounding_box()
        await pg.mouse.click(box["x"] + box["width"] * 0.1, box["y"] + box["height"] * 0.2); await pg.wait_for_timeout(900)
        check("napautus alueelle -> kirjaus tilaan", "tila=t1" in pg.url, pg.url)
        # Valmis -> kohde + Kirjaus tallennettu + Seuraava
        await pg.evaluate("localStorage.setItem('ks.kirjauksia','9')")
        await pg.click("[data-c=shot]"); await pg.wait_for_timeout(900)
        await pg.fill("[data-text]", "Lattiassa halkeama ovensuussa."); await pg.wait_for_timeout(300)
        await pg.click("[data-c=valmis]"); await pg.wait_for_timeout(1000)
        t = await pg.inner_text("#toast")
        check("Valmis: kohteeseen ja ilmoitus", pg.url.endswith("/k/" + kid) and "tallennettu" in t and "seuraava" in t.lower(), [t, pg.url[-40:], await pg.inner_html("#toast")])
        await pg.screenshot(path=OUT + "/k33_07_valmis.png")
        await pg.click("#toast .toast-act"); await pg.wait_for_timeout(1000)
        check("+ Seuraava avaa kameran", "/kuvaus" in pg.url, pg.url)
        # olosuhdeseuranta sanelusta -> mittalaite (seloste-kohde)
        await pg.goto(U + "#/k/" + kid); await pg.wait_for_timeout(500)
        await pg.evaluate("Raportit.aseta(App.S.kohde,'tutkimusseloste',null); App.S.kohde.suunnitelma=[]; App.Model.saveKohde()")
        await pg.goto(U + "#/k/" + kid + "/kuvaus?tila=t1&kerros=e1"); await pg.wait_for_timeout(1200)
        await pg.click("[data-c=shot]"); await pg.wait_for_timeout(900)
        await pg.fill("[data-text]", "Olosuhdeseuranta, loggeri 3, korkeus 1,1 metriä."); await pg.wait_for_timeout(300)
        await pg.click("[data-c=valmis]"); await pg.wait_for_timeout(1000)
        sr = await pg.evaluate("(App.S.kohde.seuranta||[]).map(x=>[x.nro,x.sijainti.tilaId,x.kuvat.length])")
        check("seuranta-kirjaus -> laite MIR3", sr == [[3, "t1", 1]], sr)
        txt = await pg.inner_text("main")
        check("seurantakortti kohdesivulla", "Olosuhdeseuranta" in txt and "Seurannassa 1 laite" in txt, "")
        await pg.screenshot(path=OUT + "/k33_08_seuranta.png", full_page=True)
        # AKK: osiot kohdesivulla pikavalinnoin, viimeistelyssä loput kunnossa
        await pg.click('[data-act="raporttiVaihda"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-rv="asuntokauppa"] >> nth=-1'); await pg.wait_for_timeout(800)
        check("AKK osiot kortissa", await pg.locator(".os-kortti .os-p").count() == 18, await pg.locator(".os-kortti .os-p").count())
        await pg.click(".os-kortti .os-p >> nth=1"); await pg.wait_for_timeout(500)
        check("pikavalinnat", await pg.locator(".os-napit > *").count() == 3)
        await pg.screenshot(path=OUT + "/k33_09_akk_osiot.png", full_page=True)
        await pg.click('[data-osa="ok"]'); await pg.wait_for_timeout(600)
        e = await pg.evaluate("AKK.edistyminen()")
        check("Kunnossa kuittasi", e["n"] >= 1, e)
        await pg.goto(U + "#/k/" + kid + "/lahto"); await pg.wait_for_timeout(700)
        check("viimeistely: seurantamuistutus", "Muista noutaa" in await pg.inner_text("main"))
        await pg.click('[data-a="akkLoput"]'); await pg.wait_for_timeout(700)
        e = await pg.evaluate("AKK.edistyminen()")
        check("Merkitse loput kunnossa", e["n"] == e["all"], e)
        check("ei virheitä", not errs, errs[:3])
        await b.close()
    srv.terminate()
    print("\n" + ("KAIKKI OK" if not fails else "EPÄONNISTUI: " + ", ".join(fails)))
    sys.exit(1 if fails else 0)

asyncio.run(main())
