"""Kaikki näkymät vain laite -tilassa (ei pilveä): ei JS-virheitä. Ajo: python3 tests/test_reitit_laite.py"""
import asyncio, subprocess, sys, time, os
JUURI=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
# Vain laite -tila: tavallinen http-palvelin (config.js: pilvi "")
P=8794
srv=subprocess.Popen([sys.executable,"-m","http.server",str(P),"-d",JUURI],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)+" @ "+(e.stack or "")[:400]))
    await pg.goto(U); await pg.wait_for_timeout(600)
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Paikallinen'});await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,500));
      const h=App.Model.newHavainto(App.S.kohde,{menetelma:'rh'});h.sanelu='RH 30 mm 78 %';await App.Model.saveHavainto(h);return k.id+'|'+h.id}""")
    k,h=kid.split("|")
    for r in ["","havainnot","pohja","lahto","muistio","kuvaus","h/"+h,"tiedot","suunnitelma","akk","kuntoarvio","seuranta","yleiskuvat","kalusto","lahtotiedot","katselmus"]:
      await pg.goto(U+"#/x"); await pg.goto(U+"#/k/"+k+("/"+r if r else "")); await pg.wait_for_timeout(700)
      n=await pg.locator(".kalapalkki").count()
      print(r or "kohde", "alapalkki" if n else "-", "virheet:",len(errs))
    print("pilleri:", await (pg.goto(U+"#/k/"+k)) or await pg.wait_for_timeout(500) or await pg.inner_text("[data-syncpill]"))
    await pg.goto(U+"#/"); await pg.wait_for_timeout(500); print("etusivu ok", "Kirjuri" in await pg.inner_text("body"))
    print("ERR",errs[:5]); await b.close()
    print("FAILS", ["JS-virheet"] if errs else [])
  srv.terminate()
asyncio.run(main())
