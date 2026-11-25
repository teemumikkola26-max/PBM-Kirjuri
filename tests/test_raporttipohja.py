"""Word-raportti pohjasta: pohja tiedostosta ja SharePointista, raportti sisältää kirjaukset ja kuvat.
Ajo: python3 tests/test_raporttipohja.py"""
import asyncio, subprocess, sys, time, os, zipfile, io, urllib.request
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T)
P=8798
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
POHJA=os.path.join(T,"testipohja.docx")
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
async def main():
  # pohja SharePointin kirjastoon
  urllib.request.urlopen(urllib.request.Request(f"http://localhost:{P}/graph-testi/v1.0/drives/drive1/root:/Raporttipohjat/PBM_kosteus.docx:/content",data=open(POHJA,"rb").read(),method="PUT",headers={"Authorization":"Bearer testi"}))
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block",accept_downloads=True)
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(600); await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Pohjatalo'});k.kerrokset=[{id:'e1',nimi:'1. krs'}];k.tilat=[{id:'t1',kerrosId:'e1',tunnus:'101',nimi:'Kylpyhuone'}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,500));
      const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');g.fillStyle='#8a7';g.fillRect(0,0,640,480);const kb=await new Promise(r=>c.toBlob(r,'image/jpeg'));
      const h=App.Model.newHavainto(App.S.kohde,{menetelma:'pintakosteus'});h.sijainti={kerrosId:'e1',tilaId:'t1',piste:null};h.sanelu='Lattia koholla suihkun edessä.';h.tulos='poikkeama';
      h.kuvat=[await DB.putFile(App.S.kohde.id,kb,{kind:'kuva',havaintoId:h.id})];await App.Model.saveHavainto(h);return k.id}""")
    await pg.goto(U+"#/k/"+kid+"/lahto"); await pg.wait_for_timeout(700)
    check("Word-raportti linkki viimeistelyssä", await pg.locator('a[href$="/word"]').count()==1)
    await pg.click('a[href$="/word"]'); await pg.wait_for_timeout(600)
    await pg.click('[data-a="pilvi"]'); await pg.wait_for_timeout(800)
    check("SharePointin pohja listalla", "PBM_kosteus.docx" in await pg.inner_text("main"))
    await pg.click('[data-a="lataa"]'); await pg.wait_for_timeout(800)
    check("pohja laitteella", await pg.locator('[data-a="tee"]').count()==1)
    async with pg.expect_download() as dl:
      await pg.click('[data-a="tee"]')
    d=await dl.value; path=await d.path()
    z=zipfile.ZipFile(path); xml=z.read("word/document.xml").decode()
    check("kohteen nimi täytetty", "Pohjatalo" in xml and "{{kohde}}" not in xml)
    check("kirjaus raportissa", "Lattia koholla" in xml and "101 Kylpyhuone" in xml)
    check("kuva raportissa", any(n.startswith("word/media/") for n in z.namelist()), [n for n in z.namelist() if "media" in n])
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
