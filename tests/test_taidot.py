"""Taidot: tuonti tekstinä, oletukset, kysy/älä kysy, Muista, lyhenteet, puhekomennot, raportille,
Omat opit (ehdotus → hyväksyntä), lomake, versiohistoria, mittarit. Ajo: python3 tests/test_taidot.py"""
import asyncio, subprocess, sys, time, os, json
from playwright.async_api import async_playwright
T=os.path.dirname(os.path.abspath(__file__)); JUURI=os.path.dirname(T); OUT=T+"/kuvat"; os.makedirs(OUT,exist_ok=True)
P=8802
srv=subprocess.Popen([sys.executable,os.path.join(JUURI,"tools","testipalvelin.py"),str(P)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
U=f"http://localhost:{P}/index.html"; fails=[]
def check(n,c,i=""):
  print(("OK   " if c else "FAIL ")+n,i)
  if not c: fails.append(n)
TAITO={"format":"kirjuri-taito","versio":1,"id":"rh-betoni","nimi":"Betonilaatan RH","kuvaus":"Testitaito",
  "milloin":{"menetelmat":["rh"]},"oletukset":[{"k":"tapa","v":"Porareikä"}],"kysy":[{"k":"rakenne"}],"alaKysy":[{"k":"tasaantuminen"}],
  "muista":"Kirjaa pintabetonin tyyppi.","lyhenteet":[{"sana":"kosteuspiste","tarkoittaa":"rh-mittaus"}],
  "komennot":[{"lause":"piste valmis","toiminto":"seuraava"}],"raportille":"RH-tulokset taulukkona syvyyksittäin."}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); errs=[]
    ctx=await b.new_context(viewport={"width":390,"height":844},service_workers="block")
    await ctx.add_init_script("try{if(!sessionStorage.getItem('x')){localStorage.clear();localStorage.setItem('ks.ohje.kuvaus','1');sessionStorage.setItem('x','1')}}catch(e){}")
    pg=await ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_timeout(700); await pg.click("[data-login]"); await pg.wait_for_timeout(600)
    await pg.goto(U+"#/taidot"); await pg.wait_for_timeout(600)
    t=await pg.inner_text("main")
    check("Taidot-näkymä: Peruskomennot ja Omat opit", "Peruskomennot" in t and "Omat opit" in t)
    # Liitä taito (Clauden vastaus koodilohkossa)
    teksti="Tässä taito:\n```json\n"+json.dumps(TAITO,ensure_ascii=False)+"\n```"
    pr=pg.evaluate("t=>TaidotNakyma.tuoTeksti(t)", teksti)
    task=asyncio.ensure_future(pr); await pg.wait_for_timeout(500)
    sheet=await pg.inner_text(".sheet") if await pg.locator(".sheet").count() else ""
    check("esikatselu kertoo mitä taito tekee", "Täyttää" in sheet and "Ei kysy" in sheet, sheet[:200])
    await pg.screenshot(path=OUT+"/40_taito_esikatselu.png")
    await pg.click('.sheet [data-v="1"]'); n=await task
    check("taito otettu käyttöön", n==1)
    # Kohde ja RH-kirjaus
    kid=await pg.evaluate("""async()=>{const k=App.Model.newKohde({nimi:'Taitotalo'});k.kerrokset=[{id:'e1',nimi:'1'}];k.tilat=[{id:'t1',kerrosId:'e1',tunnus:'101',nimi:'Luokka'}];
      await DB.put('kohteet',k);location.hash='#/k/'+k.id;await new Promise(r=>setTimeout(r,500));return k.id}""")
    r=await pg.evaluate("""()=>{const h=App.Model.newHavainto(App.S.kohde,{menetelma:'rh'});M.taytaMuisti(h,App.Model);
      const au=Check.havaintoAukot(h).map(x=>x.key);return {tapa:h.kentat.tapa,auto:h.auto['k:tapa'],au,vihje:M.vihje(h)}}""")
    check("oletus täytetty taidosta", r["tapa"]=="Porareikä" and r["auto"]=="taito", r)
    check("älä kysy: tasaantumisaika pois", "k:tasaantuminen" not in r["au"], r["au"])
    check("kysy aina: rakenne mukana", "k:rakenne" in r["au"], r["au"])
    check("Muista-rivillä taidon teksti", "pintabetonin" in r["vihje"], r["vihje"])
    m=await pg.evaluate("Komennot.menetelma('kosteuspiste 101 lattia')"); check("lyhenne tunnistaa menetelmän", m=="rh", m)
    k=await pg.evaluate("Komennot.tulkitse('lattia kuiva piste valmis')"); check("taidon puhekomento", k["seuraava"]==True, k)
    k2=await pg.evaluate("Komennot.tulkitse('Märkätilat kunnossa.')"); check("peruskomento märkätilat kunnossa", k2.get("toiminto")=="kunnossa", k2)
    r2=await pg.evaluate("Taidot.raportille(['rh'])"); check("raportille-ohje vientiin", r2 and "syvyyksittäin" in r2[0]["ohje"], r2)
    # Muiden menetelmien kirjauksiin taito ei vaikuta
    r3=await pg.evaluate("""()=>{const h=App.Model.newHavainto(App.S.kohde,{menetelma:'pintakosteus'});return M.vihje(h)}""")
    check("taito vain valituille menetelmille", "pintabetonin" not in r3, r3)
    # Omat opit: sama valinta neljästi -> ehdotus
    await pg.evaluate("""async()=>{const mm=M.MENETELMAT.find(m=>m.id!=='rh'&&!m.piilotettu&&(m.kentat||[]).some(f=>f.t==='select'&&!f.mittaus&&!f.kun&&f.o&&f.o.length));
      for(let i=0;i<4;i++){const h=App.Model.newHavainto(App.S.kohde,{menetelma:mm.id});const f=mm.kentat.find(f=>f.t==='select'&&!f.mittaus&&!f.kun&&f.o&&f.o.length);
      h.kentat[f.k]=f.o[0]; h.auto={}; Taidot.havaitse(h);}}""")
    eh=await pg.evaluate("Taidot.ehdotukset()"); check("toistuva valinta -> ehdotus", any(e["tyyppi"]=="oletus" for e in eh), eh)
    await pg.evaluate("""()=>{for(let i=0;i<3;i++){const h=App.Model.newHavainto(App.S.kohde,{menetelma:'rh'});h.eiTiedossa=['k:olosuhteet'];Taidot.havaitse(h);}}""")
    eh=await pg.evaluate("Taidot.ehdotukset()"); check("toistuva Ei tiedossa -> ehdotus", any(e["tyyppi"]=="alaKysy" for e in eh), [e["teksti"] for e in eh])
    await pg.goto(U+"#/taidot"); await pg.wait_for_timeout(600)
    await pg.screenshot(path=OUT+"/41_taidot.png", full_page=True)
    await pg.click('[data-a="hyv"] >> nth=0'); await pg.wait_for_timeout(300); await pg.click('[data-a="hyv"] >> nth=0'); await pg.wait_for_timeout(300)
    om=await pg.evaluate("Taidot.hae('omat-opit')"); check("hyväksytyt omiin oppeihin", len(om["oletukset"])==1 and len(om["alaKysy"])==1, om)
    # Lomake: uusi taito, virheellinen kenttä -> virhe; korjattu -> tallentuu
    await pg.goto(U+"#/taidot/uusi"); await pg.wait_for_timeout(500)
    await pg.fill('[data-f="nimi"]','Avaukset'); await pg.click('[data-m="avaus"]')
    await pg.fill('[data-f="oletukset"]','Olematon kenttä = x'); await pg.click('[data-a="tallenna"]'); await pg.wait_for_timeout(300)
    check("lomake: tuntematon kenttä estää tallennuksen", "ei löydy" in await pg.inner_text("[data-virheet]"))
    await pg.fill('[data-f="oletukset"]',''); await pg.fill('[data-f="muista"]','Kuva ennen avausta'); await pg.fill('[data-f="komennot"]','avaus kunnossa = tulos:ok')
    await pg.click('[data-a="tallenna"]'); await pg.wait_for_timeout(500)
    t2=await pg.evaluate("Taidot.lista().find(x=>x.nimi==='Avaukset')"); check("lomake: taito tallentui", t2 and t2["milloin"]["menetelmat"]==["avaus"] and t2["komennot"][0]["toiminto"]=="tulos:ok", t2)
    # Muokkaus -> versiohistoria
    await pg.goto(U+"#/taidot/"+t2["id"]); await pg.wait_for_timeout(500)
    await pg.fill('[data-f="muista"]','Kuva ennen ja jälkeen'); await pg.click('[data-a="tallenna"]'); await pg.wait_for_timeout(500)
    h=await pg.evaluate(f"Taidot.hae('{t2['id']}').historia.length"); check("versiohistoria", h==1, h)
    # Päälle/pois
    await pg.goto(U+"#/taidot"); await pg.wait_for_timeout(500)
    await pg.evaluate("""()=>{const c=document.querySelector('[data-a=paalla][data-id="rh-betoni"]');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}))}"""); await pg.wait_for_timeout(300)
    r4=await pg.evaluate("""()=>{const h=App.Model.newHavainto(App.S.kohde,{menetelma:'rh'});M.taytaMuisti(h,App.Model);return (h.auto||{})['k:tapa']||''}""")
    check("pois päältä -> ei vaikuta", r4!="taito", r4)
    # Pysyvyys: uudelleenlataus
    await pg.reload(); await pg.wait_for_timeout(1200)
    n2=await pg.evaluate("Taidot.lista().length"); check("taidot säilyvät uudelleenkäynnistyksessä", n2>=4, n2)
    y=await pg.evaluate("Taidot.yhteenveto()"); check("käyttömittarit: yhteenveto", "kirjauksia" in y, y[:200])
    # TAIDOT.md:n esimerkki (kentät nimillä) jäsentyy ja kentät muuttuvat tunnuksiksi
    md=open(os.path.join(JUURI,"TAIDOT.md"),encoding="utf-8").read()
    esim=md.split("```json")[1].split("```")[0]
    r5=await pg.evaluate("t=>{const x=Taidot.jasenna(t)[0];return {k:x.oletukset[0].k,kysy:x.kysy[0].k,v:Taidot.tarkista(x)}}", esim)
    check("TAIDOT.md-esimerkki kelpaa", r5["k"]=="tapa" and r5["kysy"]=="rakenne" and not r5["v"], r5)
    check("ei JS-virheitä", not errs, errs[:3])
    await b.close()
  srv.terminate(); print("FAILS",fails)
asyncio.run(main())
