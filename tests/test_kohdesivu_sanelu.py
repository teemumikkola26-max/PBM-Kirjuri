"""Kohdesivu, alapalkki ja Sanelu-painike (testipalvelin, pilvi = testi). Ajo: python3 tests/test_kohdesivu_sanelu.py"""
import asyncio, subprocess, sys, time, json, os, zipfile, urllib.request
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T); OUT=T+"/kuvat"; os.makedirs(OUT,exist_ok=True)
P=8793
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
FAKE="""() => { window.Dictation = class { constructor(o){this.o=o;this.active=false;this.mode='speech';}
  static supported(){return true} static available(){return true}
  start(){this.active=true; const w=(window.__sanelu||'').split(' '); let i=0; this.t=setInterval(()=>{ if(i<w.length){ this.o.onPreview(w.slice(0,++i).join(' ')); } },60); }
  stop(){ if(!this.active) return; this.active=false; clearInterval(this.t); this.o.onPreview(''); this.o.onCommit(window.__sanelu||''); this.o.onState('stopped'); } } }"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},device_scale_factor=2,service_workers="block")
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();localStorage.setItem('ks.ohje.kuvaus','1');sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(600); await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Testikoulu'});k.pilvi=true;
      k.kerrokset=[{id:'e1',nimi:'1. krs'}];k.tilat=[{id:'t120',kerrosId:'e1',tunnus:'120',nimi:'Luokka'},{id:'t121',kerrosId:'e1',tunnus:'121',nimi:'Käytävä'}];
      k.suunnitelma=[{id:'p1',menetelma:'aisti',maara:1,kuvaus:'oireilutilat'},{id:'p2',menetelma:'avaus',maara:2,naytteet:2,kuvaus:'alapohja'}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,600));return k.id}""")
    await pg.evaluate("""async()=>{const t=App.S.kohde.tilat.find(x=>x.tunnus==='120')||App.S.kohde.tilat[0];
      const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle='#b9ad9c';g.fillRect(0,0,400,300);
      const blob=await new Promise(r=>c.toBlob(r,'image/jpeg'));const p=App.S.kohde.suunnitelma[0];
      const h=App.Model.newHavainto(App.S.kohde,{menetelma:p?p.menetelma:'aisti'});h.suunnitelmaId=p?p.id:null;h.sijainti={kerrosId:t.kerrosId,tilaId:t.id,piste:null};h.sanelu='Ikkunan alanurkassa tummumaa.';
      const id=await DB.putFile(App.S.kohde.id,blob,{kind:'kuva',havaintoId:h.id});h.kuvat=[id];await App.Model.saveHavainto(h);
      App.S.kohde.muistiinpanot=[{id:'m1',teksti:'Huollon mukaan IV-kone pysähtyy viikonloppuisin.',sijainti:null,luotu:Date.now(),muokattu:Date.now()}];await App.Model.saveKohde();}""")
    await pg.goto(U+"#/x"); await pg.goto(U+"#/k/"+kid); await pg.wait_for_timeout(900)
    txt=await pg.inner_text("main")
    for s in ["Raportti","Uusi kirjaus","Tutkimussuunnitelma","Muistiinpanot","Pohjakuva","Viimeistele ja tee raportti","Lisää toimintoja"]:
      check("osio "+s, s in txt)
    check("alapalkki 3", await pg.locator(".kalapalkki .ka-btn").count()==3)
    check("pilleri", await pg.locator("[data-syncpill]").count()==1, await pg.inner_text("[data-syncpill]"))
    await pg.screenshot(path=OUT+"/01_kohde.png", full_page=True)
    # avaa ensimmäinen kohta
    await pg.click(".pl-row >> nth=0"); await pg.wait_for_timeout(300)
    check("kirjaus kohdan alla", await pg.locator(".pl-sis .kr").count()>=1)
    await pg.screenshot(path=OUT+"/02_kohta_auki.png", full_page=True)
    # Sanelu
    await pg.evaluate(FAKE)
    await pg.evaluate("window.__sanelu='Pintakosteus 120 lattia ikkunan alla kostean tuntuinen'")
    btn=pg.locator("[data-sanelu]"); bb=await btn.bounding_box()
    await pg.mouse.move(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]/2); await pg.mouse.down(); await pg.wait_for_timeout(500)
    check("paneeli auki kuunnellessa", await pg.locator(".sn-paneeli").count()==1)
    await pg.screenshot(path=OUT+"/03_sanelu_kuuntelee.png")
    await pg.wait_for_timeout(400); await pg.mouse.up(); await pg.wait_for_timeout(700)
    st=await pg.evaluate("Sanelu._tila()"); check("kirjaus tunnistettu", st and st["laji"]=="kirjaus" and st["menetelma"]=="pintakosteus", st)
    await pg.screenshot(path=OUT+"/04_sanelu_valmis.png")
    n0=await pg.evaluate("App.S.havainnot.length")
    await pg.click('[data-sn="tallenna"]'); await pg.wait_for_timeout(700)
    check("kirjaus tallentui", await pg.evaluate("App.S.havainnot.length")==n0+1)
    # muistiinpano
    await pg.evaluate("window.__sanelu='Isännöitsijän mukaan vesikatto korjattu 2019'")
    bb=await btn.bounding_box(); await pg.mouse.move(bb["x"]+20, bb["y"]+20); await pg.mouse.down(); await pg.wait_for_timeout(900); await pg.mouse.up(); await pg.wait_for_timeout(600)
    st=await pg.evaluate("Sanelu._tila()"); check("muistiinpano tunnistettu", st and st["laji"]=="muistiinpano", st)
    # korjaus: vaihda kirjaukseksi
    await pg.click('[data-sn="laji"]'); await pg.wait_for_timeout(300)
    st=await pg.evaluate("Sanelu._tila()"); check("laji korjattavissa", st["laji"]=="kirjaus", st)
    await pg.click('[data-sn="laji"]'); await pg.wait_for_timeout(300)
    m0=await pg.evaluate("(App.S.kohde.muistiinpanot||[]).length")
    await pg.click('[data-sn="tallenna"]'); await pg.wait_for_timeout(600)
    check("muistiinpano tallentui", await pg.evaluate("(App.S.kohde.muistiinpanot||[]).length")==m0+1)
    await pg.screenshot(path=OUT+"/05_kohde_lopuksi.png", full_page=True)
    await pg.evaluate("Sync.run('t')"); await pg.wait_for_timeout(800)
    t=json.load(urllib.request.urlopen(f"http://localhost:{P}/graph-testi/_tila"))
    check("pilvessä rivejä", len(t["items"])>5, len(t["items"]))
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
