"""Kirjausnäkymä: kuvat ja sijainti ylhäällä, yksi teksti, Raporttia varten vielä (vain puuttuvat), Ei tiedossa, tallennus aina.
Ajo: python3 tests/test_kirjausnakyma.py"""
import asyncio, subprocess, sys, time, os
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T); OUT=T+"/kuvat"; os.makedirs(OUT,exist_ok=True)
P=8794
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
FAKE="""() => { window.Dictation = class { constructor(o){this.o=o;this.active=false;this.mode='speech';}
  static supported(){return true} static available(){return true}
  start(){this.active=true;} stop(){ if(!this.active) return; this.active=false; this.o.onCommit(window.__sanelu||''); this.o.onState('stopped'); } } }"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},device_scale_factor=2,service_workers="block")
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();localStorage.setItem('ks.ohje.kuvaus','1');sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(600); await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    await pg.evaluate(FAKE)
    hid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Testitalo'});
      const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,800,500);g.strokeRect(50,50,700,400);g.strokeRect(50,50,300,200);
      const pb=await new Promise(r=>c.toBlob(r,'image/png'));
      k.kerrokset=[{id:'e1',nimi:'1. krs'}];k.tilat=[{id:'t1',kerrosId:'e1',tunnus:'101',nimi:'Kylpyhuone',pos:{x:.25,y:.3}}];
      k.suunnitelma=[{id:'p1',menetelma:'rh',maara:2,kuvaus:'lattia'}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,600));
      const pid=await DB.putFile(k.id,pb,{kind:'pohja'});App.S.kohde.kerrokset[0].planId=pid;await App.Model.saveKohde();
      const h=App.Model.newHavainto(App.S.kohde,{menetelma:'rh'});h.sijainti={kerrosId:'e1',tilaId:'t1',piste:{x:.3,y:.35}};h.sanelu='Porareikä lattiassa suihkun vieressä.';
      g.fillStyle='#b9ad9c';g.fillRect(0,0,800,500);const kb=await new Promise(r=>c.toBlob(r,'image/jpeg'));
      h.kuvat=[await DB.putFile(App.S.kohde.id,kb,{kind:'kuva',havaintoId:h.id})];await App.Model.saveHavainto(h);return h.id}""")
    kid=await pg.evaluate("App.S.kohde.id")
    await pg.goto(U+"#/k/"+kid+"/h/"+hid); await pg.wait_for_timeout(900)
    # järjestys: kuvat -> sijainti -> teksti -> puuttuvat
    y=await pg.evaluate("""()=>['.thumbs','.sijainti-rivi','.havaintoteksti','.aukot'].map(s=>{const e=document.querySelector(s);return e?e.getBoundingClientRect().top:-1})""")
    check("järjestys kuvat, sijainti, teksti, puuttuvat", all(v>=0 for v in y) and y==sorted(y), y)
    check("minipohja näkyy", await pg.locator(".minipohja img").count()==1)
    au=await pg.locator(".aukko").count(); check("puuttuvia listalla", au>=1, au)
    names=await pg.locator(".aukko .t").all_inner_texts(); check("vain puuttuvat (ei tilaa)", "Tila" not in names, names)
    await pg.screenshot(path=OUT+"/10_kirjaus.png", full_page=True)
    # autogrow
    h0=await pg.evaluate("document.querySelector('.havaintoteksti').offsetHeight")
    await pg.fill(".havaintoteksti", "Rivi\n"*14); await pg.wait_for_timeout(200)
    h1=await pg.evaluate("document.querySelector('.havaintoteksti').offsetHeight")
    check("tekstilaatikko kasvaa", h1>h0+80, (h0,h1))
    await pg.fill(".havaintoteksti", "Porareikä lattiassa suihkun vieressä."); await pg.wait_for_timeout(500)
    # avaa ensimmäinen puute ja merkitse Ei tiedossa
    first=names[0]
    await pg.click(".aukko >> nth=0 >> .row"); await pg.wait_for_timeout(300)
    check("napautus avaa vastauksen", await pg.locator(".aukko-ed").count()==1)
    check("Ei tiedossa ja OK", await pg.locator('[data-a="eitied"]').count()==1 and await pg.locator('[data-a="aukkook"]').count()==1)
    await pg.screenshot(path=OUT+"/11_kirjaus_aukko.png", full_page=True)
    await pg.click('[data-a="eitied"]'); await pg.wait_for_timeout(500)
    names2=await pg.locator(".aukko .t").all_inner_texts()
    check("Ei tiedossa poistaa listalta", first not in names2, (first,names2))
    check("tallentui eiTiedossa", await pg.evaluate(f"App.Model.havainto('{hid}').eiTiedossa.length")==1)
    # sanele puuttuva: tulos tai kenttä
    if await pg.locator(".aukko").count():
      await pg.click(".aukko >> nth=0 >> .row"); await pg.wait_for_timeout(300)
      await pg.evaluate("window.__sanelu='poikkeama, mittaussyvyys 40 mm'")
      bb=await pg.locator('[data-dictbtn="aukko"]').bounding_box()
      await pg.mouse.move(bb["x"]+10,bb["y"]+10); await pg.mouse.down(); await pg.wait_for_timeout(400); await pg.mouse.up(); await pg.wait_for_timeout(800)
      s=await pg.evaluate(f"App.Model.havainto('{hid}').sanelu")
      check("aukon sanelu lisätty tekstiin", "poikkeama" in s.lower(), s)
    # tallenna aina
    await pg.click('[data-a="valmis"]'); await pg.wait_for_timeout(600)
    check("tallenna palaa kohteeseen", await pg.evaluate("location.hash")=="#/k/"+kid)
    # tyhjä kirjaus: kaikki puuttuvat näkyvät, tallennus onnistuu
    hid2=await pg.evaluate("""async()=>{const h=App.Model.newHavainto(App.S.kohde,{});await App.Model.saveHavainto(h);return h.id}""")
    await pg.goto(U+"#/k/"+kid+"/h/"+hid2); await pg.wait_for_timeout(700)
    names3=await pg.locator(".aukko .t").all_inner_texts()
    check("tyhjän puutteet", any("Tila"==n for n in names3) and any("Menetelmä"==n for n in names3), names3)
    await pg.click('[data-a="valmis"]'); await pg.wait_for_timeout(500)
    check("tyhjänkin voi tallentaa", await pg.evaluate("location.hash")=="#/k/"+kid)
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
