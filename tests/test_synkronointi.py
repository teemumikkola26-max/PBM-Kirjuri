"""Kaksi laitetta samassa kohteessa SharePoint-testipalvelimen kautta. Ajo: python3 tests/test_synkronointi.py"""
import asyncio, subprocess, sys, time, json, os, urllib.request
JUURI=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
P=8792
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
def tila(): return json.load(urllib.request.urlopen(f"http://localhost:{P}/graph-testi/_tila"))
U=f"http://localhost:{P}/index.html"
fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
async def laite(b, errs):
  ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block")
  pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
  await pg.goto(U); await pg.wait_for_timeout(800)
  await pg.click("[data-login]"); await pg.wait_for_timeout(800)
  return pg
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    a=await laite(b,errs)
    kid=await a.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Testikoulu'});k.pilvi=true;await DB.put('kohteet',k);
      location.hash='#/k/'+k.id; await new Promise(r=>setTimeout(r,500));
      const h=App.Model.newHavainto(App.S.kohde,{menetelma:'aisti'}); h.sanelu='Ikkunan alla tummumaa'; 
      const c=document.createElement('canvas');c.width=40;c.height=30;const blob=await new Promise(r=>c.toBlob(r,'image/jpeg'));
      const fid=await DB.putFile(App.S.kohde.id,blob,{kind:'kuva',havaintoId:h.id}); h.kuvat=[fid]; await App.Model.saveHavainto(h);
      await Sync.run('testi'); return k.id}""")
    await a.wait_for_timeout(500)
    t=tila(); laji=sorted(set(i["fields"]["Laji"] for i in t["items"]))
    check("rivit pilvessä", "havainto" in laji and "kohde" in laji, laji)
    check("kuva kirjastossa", any("/tiedostot/" in k for k in t["files"]), list(t["files"])[:2])
    st=await a.evaluate("Sync.state"); check("tila ok", st["tila"]=="ok", st)
    # Laite B
    bb=await laite(b,errs)
    await bb.wait_for_timeout(1200)
    txt=await bb.inner_text("body")
    check("B näkee pilvikohteen", "Testikoulu" in txt, txt[:400])
    await bb.click("[data-hae]"); await bb.wait_for_timeout(2500)
    n=await bb.evaluate("App.S.havainnot.length"); check("B haki havainnon", n==1, n)
    s=await bb.evaluate("App.S.havainnot[0] && App.S.havainnot[0].sanelu"); check("sanelu", s=="Ikkunan alla tummumaa", s)
    f=await bb.evaluate("""async()=>{const h=App.S.havainnot[0];const f=await DB.get('tiedostot',h.kuvat[0]); if(f) return 'local'; const g=await Sync.haeTiedosto(App.S.kohde.id,h.kuvat[0]); return g&&g.blob?g.blob.size:null}""")
    check("B saa kuvan", f is not None, f)
    # B muokkaa, A hakee
    await bb.evaluate("""async()=>{const h=App.S.havainnot[0]; h.sanelu='Muokattu B:ssä'; await App.Model.saveHavainto(h); await Sync.run('t')}""")
    await a.evaluate("Sync.run('t')"); await a.wait_for_timeout(800)
    s2=await a.evaluate("App.S.havainnot[0].sanelu"); check("A sai B:n muutoksen", s2=="Muokattu B:ssä", s2)
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
