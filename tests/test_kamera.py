"""Kamera: Tallenna ja seuraava, Kumoa, puhekomennot, Muista-rivi, AKK ilman valintoja.
Ajo: python3 tests/test_kamera.py"""
import asyncio, subprocess, sys, time, os
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T); OUT=T+"/kuvat"; os.makedirs(OUT,exist_ok=True)
P=8795
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
FAKE="""() => { window.Dictation = class { constructor(o){this.o=o;this.active=false;this.mode='speech';}
  static supported(){return true} static available(){return true}
  start(){this.active=true;} stop(){ if(!this.active) return; this.active=false; this.o.onCommit(window.__sanelu||''); this.o.onState('stopped'); } } }"""
async def sanele(pg, teksti):
  await pg.evaluate(f"window.__sanelu={teksti!r}")
  bb=await pg.locator("[data-mic]").bounding_box()
  await pg.mouse.move(bb["x"]+bb["width"]/2,bb["y"]+bb["height"]/2); await pg.mouse.down(); await pg.wait_for_timeout(450); await pg.mouse.up(); await pg.wait_for_timeout(900)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block",permissions=["camera"])
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();localStorage.setItem('ks.ohje.kuvaus','1');sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(600); await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    await pg.evaluate("Asetukset.set('pv.milloin','ei')")
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Kameratalo'});
      k.kerrokset=[{id:'e1',nimi:'1. krs'}];k.tilat=[{id:'t1',kerrosId:'e1',tunnus:'101',nimi:'Kylpyhuone'},{id:'t2',kerrosId:'e1',tunnus:'102',nimi:'Eteinen'}];
      k.suunnitelma=[{id:'p1',menetelma:'pintakosteus',maara:3}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,500));return k.id}""")
    await pg.evaluate(FAKE)
    await pg.goto(U+"#/k/"+kid+"/kuvaus"); await pg.wait_for_timeout(1500)
    check("kamera käynnissä", await pg.evaluate("!!Camera.stream"))
    check("Tallenna ja seuraava -painike", "Tallenna ja seuraava" in await pg.inner_text(".cam-bottom"))
    await pg.click("[data-c=shot]"); await pg.wait_for_timeout(1200)
    check("kuva otettu", await pg.evaluate("(App.S.havainnot.slice(-1)[0]||{kuvat:[]}).kuvat.length")==1)
    check("Kumoa-ilmoitus", await pg.locator("#toast .toast-act").count()==1)
    await pg.screenshot(path=OUT+"/20_kamera_kumoa.png")
    await pg.click("#toast .toast-act"); await pg.wait_for_timeout(600)
    check("Kumoa poisti kuvan (ja tyhjän kirjauksen)", await pg.evaluate("App.S.havainnot.length")==0)
    await pg.click("[data-c=shot]"); await pg.wait_for_timeout(1200)
    await sanele(pg, "Pintakosteus 101 lattia kostea seuraava")
    await pg.wait_for_timeout(800)
    hs=await pg.evaluate("App.S.havainnot.map(h=>({s:h.sanelu,m:h.menetelma,k:h.kuvat.length}))")
    check("seuraava-komento tallensi", len(hs)==1 and hs[0]["m"]=="pintakosteus" and "seuraava" not in hs[0]["s"].lower(), hs)
    check("uusi kirjaus aloitettu", await pg.evaluate("!document.querySelector('[data-count]').textContent"))
    await pg.click("[data-c=shot]"); await pg.wait_for_timeout(1000); await pg.click("[data-c=shot]"); await pg.wait_for_timeout(1000)
    await sanele(pg, "kumoa")
    n=await pg.evaluate("App.S.havainnot.slice(-1)[0].kuvat.length")
    check("kumoa-komento poisti kuvan", n==1, n)
    await sanele(pg, "RH-mittaus 102 lattia")
    muista=await pg.inner_text("[data-muista]")
    check("Muista-rivi menetelmälle", len(muista)>5, muista)
    await pg.screenshot(path=OUT+"/21_kamera_muista.png")
    # AKK: ei pikavalintaa, osio sanelusta
    await pg.evaluate("Asetukset.set('pv.milloin','aina')")
    kid2=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'AKK-talo'});k.suunnitelma=[{id:'a1',menetelma:'asuntokauppa',maara:1}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,500));return k.id}""")
    await pg.goto(U+"#/x"); await pg.goto(U+"#/k/"+kid2+"/kuvaus"); await pg.wait_for_timeout(1500)
    await pg.evaluate(FAKE)
    check("AKK: ei pikavalintaa", await pg.locator(".qp").count()==0)
    t=await pg.inner_text("[data-mname]"); check("AKK: osio sanelusta -merkki", "sanelusta" in t.lower(), t)
    await pg.click("[data-c=shot]"); await pg.wait_for_timeout(1000)
    await sanele(pg, "Kylpyhuoneen lattiakaivon ympärillä laatoitus halkeillut")
    t=await pg.inner_text("[data-mname]"); osa=await pg.evaluate("(App.S.havainnot.slice(-1)[0]||{}).akkOsa")
    check("AKK: sanelu ohjasi osioon", bool(osa), (osa,t))
    check("AKK: ei menetelmävalintaa", await pg.locator(".qp").count()==0)
    await pg.screenshot(path=OUT+"/22_akk_kamera.png")
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
