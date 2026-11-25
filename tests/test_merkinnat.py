"""Pohjakuvan merkinnät: piirto, napautus vain valitsee (ei siirrä), Siirrä-painike, vanhat lukittu, PDF-vienti,
arvioidut kirjausmerkit. Ajo: python3 tests/test_merkinnat.py"""
import asyncio, subprocess, sys, time, os
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T); OUT=T+"/kuvat"; os.makedirs(OUT,exist_ok=True)
P=8796
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block",has_touch=False)
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();localStorage.setItem('ks.ohje.kuvaus','1');sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(600); await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Merkintätalo'});
      const c=document.createElement('canvas');c.width=1000;c.height=700;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1000,700);g.lineWidth=6;g.strokeRect(40,40,920,620);g.strokeRect(40,40,400,300);
      const pb=await new Promise(r=>c.toBlob(r,'image/png'));
      k.kerrokset=[{id:'e1',nimi:'1. krs'}];k.tilat=[{id:'t1',kerrosId:'e1',tunnus:'101',nimi:'Luokka',pos:{x:.25,y:.3}}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,500));
      App.S.kohde.kerrokset[0].planId=await DB.putFile(k.id,pb,{kind:'pohja'});await App.Model.saveKohde();
      const h=App.Model.newHavainto(App.S.kohde,{menetelma:'aisti'});h.sijainti={kerrosId:'e1',tilaId:'t1',piste:null};h.sanelu='Tummumaa.';await App.Model.saveHavainto(h);
      return k.id}""")
    await pg.goto(U+"#/x"); await pg.goto(U+"#/k/"+kid+"/pohja?kerros=e1"); await pg.wait_for_timeout(900)
    check("arvioitu kirjausmerkki (katkoviiva)", await pg.locator(".pin.arvio").count()==1)
    await pg.click('[data-a="markup"]'); await pg.wait_for_timeout(800)
    check("editori auki", await pg.locator(".pm-ov").count()==1)
    # piirrä suorakulmio
    await pg.click('.pm-ov [data-t="rect"], .pm-ov button[aria-label="Suorakulmio"], .pm-ov [title="Suorakulmio"]')
    st=await pg.locator(".pm-stage").bounding_box()
    x0,y0=st["x"]+80,st["y"]+st["height"]/2-60
    await pg.mouse.move(x0,y0); await pg.mouse.down(); await pg.mouse.move(x0+120,y0+80,steps=6); await pg.mouse.up(); await pg.wait_for_timeout(300)
    await pg.click('.pm-ov [data-a="save"]'); await pg.wait_for_timeout(800)
    n=await pg.evaluate("(App.S.kohde.kerrokset[0].merkinnat||[]).length")
    check("merkintä tallentui kerrokseen", n==1, n)
    check("merkinnät näkyvät pohjakuvassa", await pg.locator(".pm-esikatselu svg").count()==1)
    pts0=await pg.evaluate("JSON.stringify(App.S.kohde.kerrokset[0].merkinnat[0].pts)")
    # avaa uudelleen: vanhat lukittu -> veto ei siirrä
    await pg.click('[data-a="markup"]'); await pg.wait_for_timeout(800)
    check("lukko näkyy", await pg.locator('.pm-ov [data-a="lukko"][aria-pressed="true"]').count()==1)
    await pg.mouse.move(x0+60,y0+2); await pg.mouse.down(); await pg.mouse.move(x0+160,y0+100,steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
    # avaa lukko, napauta (valitsee), vedä -> ei siirry
    await pg.click('.pm-ov [data-a="lukko"]'); await pg.wait_for_timeout(200)
    sel=pg.locator('.pm-ov svg [data-id]').first
    bb=await pg.locator('.pm-ov svg [data-id] rect').last.bounding_box()
    cx,cy=bb["x"]+bb["width"]/2, bb["y"]+1
    await pg.mouse.click(cx,cy); await pg.wait_for_timeout(200)
    check("napautus valitsee ja Siirrä-painike", await pg.locator('.pm-ov [data-c="siirra"]').count()==1)
    await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx+100,cy+100,steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
    await pg.screenshot(path=OUT+"/30_merkinnat_valittu.png")
    await pg.click('.pm-ov [data-a="save"]'); await pg.wait_for_timeout(600)
    pts1=await pg.evaluate("JSON.stringify(App.S.kohde.kerrokset[0].merkinnat[0].pts)")
    check("veto ilman Siirrä ei liikuttanut", pts0==pts1)
    # Siirrä
    await pg.click('[data-a="markup"]'); await pg.wait_for_timeout(800)
    await pg.click('.pm-ov [data-a="lukko"]'); await pg.wait_for_timeout(200)
    bb=await pg.locator('.pm-ov svg [data-id] rect').last.bounding_box(); cx,cy=bb["x"]+bb["width"]/2, bb["y"]+1
    await pg.mouse.click(cx,cy); await pg.wait_for_timeout(200)
    await pg.click('.pm-ov [data-c="siirra"]'); await pg.wait_for_timeout(200)
    bb=await pg.locator('.pm-ov svg [data-id] rect').last.bounding_box(); cx,cy=bb["x"]+bb["width"]/2, bb["y"]+1
    await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx+60,cy+40,steps=8); await pg.mouse.up(); await pg.wait_for_timeout(200)
    await pg.click('.pm-ov [data-a="save"]'); await pg.wait_for_timeout(600)
    pts2=await pg.evaluate("JSON.stringify(App.S.kohde.kerrokset[0].merkinnat[0].pts)")
    check("Siirrä-tilassa siirtyy", pts2!=pts1, (pts1,pts2))
    await pg.screenshot(path=OUT+"/31_pohja_merkinnat.png", full_page=True)
    # PDF
    size=await pg.evaluate("""async()=>{const b=await PohjaPdf.luo(App.S.kohde.kerrokset[0],h=>'H'+h.nro);const d=await PDFLib.PDFDocument.load(await b.arrayBuffer());const a=d.getPage(0).node.Annots();return [b.size,a?a.size():0]}""")
    check("PDF sisältää merkinnän", size[1]>=1, size)
    k=await pg.evaluate("""async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,10,10);const bl=await new Promise(r=>c.toBlob(r,'image/jpeg'));
      const pdf=await PohjaPdf.kuvaPdf(bl,[{t:'arrow',c:'#e11d48',w:.006,a:[.1,.1],b:[.5,.5]},{t:'ellipse',c:'#2563eb',w:.006,a:[.6,.6],b:[.8,.9]},{t:'pen',c:'#16a34a',w:.004,p:[[.1,.8],[.2,.85]]}]);
      const d=await PDFLib.PDFDocument.load(await pdf.arrayBuffer());const a=d.getPage(0).node.Annots();return a?a.size():0}""")
    check("havaintokuvan merkinnät muokattavina PDF:ssä", k==3, k)
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
