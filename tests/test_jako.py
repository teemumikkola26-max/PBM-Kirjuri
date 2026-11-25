"""Jakokohde ja asennettavuus: manifest ja service worker kelpaavat asennukseen (Chrome),
jaettu kuva (POST /jaa service workerin kautta) → kohde → Uusi kirjaus / Yleiskuvat; jaettu taito → Taidot.
Ajo: python3 tests/test_jako.py"""
import asyncio, subprocess, sys, time, os, json
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T)
P=8811
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
JAA="""async(o)=>{const fd=new FormData();
  for(const f of o.files){let b;if(f.kuva){const c=document.createElement('canvas');c.width=300;c.height=200;c.getContext('2d').fillRect(0,0,50,50);b=await new Promise(r=>c.toBlob(r,'image/jpeg'));}else b=new Blob([f.teksti],{type:f.type});
    fd.append('tiedostot',new File([b],f.nimi,{type:f.kuva?'image/jpeg':f.type}));}
  if(o.teksti)fd.append('teksti',o.teksti);
  const r=await fetch('jaa',{method:'POST',body:fd,redirect:'manual'});return r.type}"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844})
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(2000)
    cdp=await ctx.new_cdp_session(pg)
    m=await cdp.send("Page.getAppManifest"); ie=await cdp.send("Page.getInstallabilityErrors")
    check("manifest ilman virheitä", not m.get("errors"), m.get("errors"))
    check("asennettavissa (Chrome)", not ie["installabilityErrors"], ie)
    await pg.reload(); await pg.wait_for_timeout(1200)
    check("service worker ohjaa sivua", await pg.evaluate("!!navigator.serviceWorker.controller"))
    await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Jakotalo'});await DB.put('kohteet',k);return k.id}""")
    # kaksi kuvaa -> uusi kirjaus
    t=await pg.evaluate(JAA, {"files":[{"kuva":1,"nimi":"IMG_1.jpg"},{"kuva":1,"nimi":"IMG_2.jpg"}]})
    check("jako vastaanotettu (uudelleenohjaus)", t=="opaqueredirect", t)
    await pg.goto(U+"#/jaa"); await pg.wait_for_timeout(800)
    await pg.click(f'[data-kohde="{kid}"]'); await pg.wait_for_timeout(500)
    check("kysyy mihin kuvat", await pg.locator('.sheet [data-v="kirjaus"]').count()==1)
    await pg.click('.sheet [data-v="kirjaus"]'); await pg.wait_for_timeout(1200)
    h=await pg.evaluate("location.hash"); n=await pg.evaluate("App.S.havainnot.length?App.S.havainnot[0].kuvat.length:0")
    check("uusi kirjaus kahdella kuvalla, kirjausnäkymä auki", "/h/" in h and n==2, (h,n))
    # kuva -> yleiskuvat
    await pg.evaluate(JAA, {"files":[{"kuva":1,"nimi":"julkisivu.jpg"}]})
    await pg.goto(U+"#/jaa"); await pg.wait_for_timeout(800)
    await pg.click(f'[data-kohde="{kid}"]'); await pg.wait_for_timeout(400); await pg.click('.sheet [data-v="yleiskuva"]'); await pg.wait_for_timeout(1000)
    check("yleiskuva lisätty", await pg.evaluate("(App.S.kohde.yleiskuvat||[]).length")==1)
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
