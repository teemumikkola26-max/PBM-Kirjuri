"""Siirtotyökalu: kenttälomakkeen siirtotiedosto (tools/kenttalomake-vienti-kirjuriin.js) Kirjuriin.
Ajaa myös vientifunktion jäljitellyssä kenttälomakkeen tilassa. Ajo: python3 tests/test_siirto.py"""
import asyncio, subprocess, sys, time, os
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T)
P=8799
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
VIENTI=open(os.path.join(JUURI,"tools","kenttalomake-vienti-kirjuriin.js")).read()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block",accept_downloads=True)
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(600)
    # Kenttälomakkeen tila (globaalit) ja vienti
    await pg.evaluate("""async()=>{await UI.loadScript('lib/jszip.min.js');await UI.loadScript('lib/pdf-lib.min.js');
      const d=await PDFLib.PDFDocument.create();const pgs=[d.addPage([842,595]),d.addPage([842,595])];pgs[0].drawRectangle({x:40,y:40,width:700,height:500,borderWidth:3});
      window.floorPlanBlob=new Blob([await d.save()],{type:'application/pdf'});
      const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,50,50);const kb=await new Promise(r=>c.toBlob(r,'image/jpeg'));
      window.project={nimi:'Siirtokoulu',osoite:'Testitie 1',tilaaja:'Kaupunki',yhteyshenkilo:'Matti Meikäläinen 040 123',projektinumero:'26001',tutkija:'T. Tutkija',pvm:'2026-11-20'};
      window.METHODS=[{id:'rh',name:'RH-mittaus',fields:[{id:'syvyys',label:'Mittaussyvyys (mm)',type:'number'},{id:'rh',label:'RH (%)',type:'number'},{id:'lampo',label:'Lämpötila (°C)',type:'number'},{id:'tasaantuminen',label:'Tasaantumisaika',type:'number'}]},
        {id:'aisti',name:'Aistinvarainen',fields:[{id:'havainnot',label:'Silmämääräiset havainnot',type:'textarea'},{id:'haju',label:'Hajuhavainto',type:'select'}]}];
      window.entries=[{id:'e1',methodId:'rh',values:{syvyys:'40',rh:'85,2',lampo:'21,0',tasaantuminen:'3',__planItem:'sp1'},marker:{x:.3,y:.4,page:1,label:'RH1'},photos:[{blob:kb,caption:'RH1'}]},
        {id:'e2',methodId:'aisti',values:{havainnot:'Jalkalistan takana tummumaa.',haju:'Lievä'},marker:{x:.6,y:.5,page:2,label:'A1'},photos:[]}];
      window.studyPlan={items:[{id:'sp1',section:'Alapohja',method:'rh',text:'RH-mittaukset',target:'3',done:false,skip:false,reason:''}],deleted:[]};
      window.planMarkup={shapes:[{id:'s1',page:1,type:'rect',pts:[[100,100],[300,200]],stroke:'#ED1C24',width:2,dash:'solid',fill:null,fillOpacity:0,opacity:1}],deleted:[]};}""")
    await pg.evaluate(VIENTI)
    async with pg.expect_download() as dl:
      await pg.evaluate("vieKirjuriin()")
    d=await dl.value; path=await d.path()
    import zipfile, json
    z=zipfile.ZipFile(path); data=json.loads(z.read("siirto.json"))
    check("siirtotiedosto: ei yhteyshenkilöä", "yhteyshenkilo" not in json.dumps(data["kohde"]) and "Meikäläinen" not in z.read("siirto.json").decode())
    check("siirtotiedosto: kuvat ja pohjakuva", "tiedostot/pohjakuva.pdf" in z.namelist() and any(n.startswith("tiedostot/k_e1") for n in z.namelist()))
    await pg.goto(U+"#/x"); await pg.goto(U); await pg.wait_for_timeout(500)
    await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    kid=await pg.evaluate("""async(b64)=>{const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const f=new File([u],'s.zip');return await Export.restore(f)}""", __import__("base64").b64encode(open(path,"rb").read()).decode())
    await pg.goto(U+"#/k/"+kid); await pg.wait_for_timeout(1500)
    r=await pg.evaluate("""()=>({nimi:App.S.kohde.nimi,ker:App.S.kohde.kerrokset.map(e=>[e.nimi,!!e.planId,(e.merkinnat||[]).length]),
      hs:App.S.havainnot.map(h=>({m:h.menetelma,s:h.sanelu,k:h.kentat,ku:h.kuvat.length,ke:h.sijainti.kerrosId,p:h.sijainti.piste,su:h.suunnitelmaId})),su:App.S.kohde.suunnitelma})""")
    check("kohde siirtyi", r["nimi"]=="Siirtokoulu", r["nimi"])
    check("kaksi kerrosta (PDF-sivut) pohjakuvineen", len(r["ker"])==2 and all(x[1] for x in r["ker"]), r["ker"])
    check("merkintä sivun 1 kerrokseen", r["ker"][0][2]==1, r["ker"])
    hs=r["hs"]; rh=[h for h in hs if h["m"]=="rh"]; ai=[h for h in hs if h["m"]=="aisti"]
    check("RH-kirjaus kenttineen", rh and rh[0]["k"].get("tasaantuminen")=="3", rh)
    check("RH: kuva ja merkki", rh and rh[0]["ku"]==1 and rh[0]["p"] and rh[0]["p"]["x"]==.3, rh)
    check("RH: suunnitelman kohta", rh and rh[0]["su"]=="p_sp1" and r["su"][0]["maara"]==3)
    check("aisti: havaintoteksti", ai and "tummumaa" in ai[0]["s"] and "Lievä" in ai[0]["s"], ai)
    check("ei JS-virheitä", not errs, errs[:3])
    print("RH",json.dumps(rh[0] if rh else None, ensure_ascii=False)[:400])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
