# Kirjuri

PBM Rakennustutkimuksen kenttäsovellus kuntotutkimuksiin, katselmuksiin, kuntoarvioihin ja asuntokaupan kuntotarkastuksiin. Kirjuri yhdistää Kuva + sanelu -sovelluksen nopean kirjauksen ja PBM Kenttälomakkeen selkeyden. Tavoite on, että kirjaus kentällä on vähintään yhtä nopeaa kuin kuvien ottaminen ja muistiinpanot puhelimen muistioon, ja raportointi nopeutuu.

Osa RTA-opinnäytetyön kehitystyötä (Teemu Mikkola, 2026).

## Tila: versio K3

| Valmis | Kuvaus |
|---|---|
| Runko ja pilvi (K1) | Kuva + sanelun moduulit, SharePoint Microsoft Graphin kautta (`js/pilvi.js`, `js/sharepoint.js`, `js/sync.js`). Toimii ilman pilveä, kunnes IT on valmis |
| Kohdesivu (K1) | Yksi sivu: kohde, seuraavaksi, suunnitelma kirjauksineen, muistiinpanot, pohjakuva ja liitteet, Viimeistele |
| Alapalkki ja sanelu (K1) | Muistio – Kamera – Sanelu. Sanelu-painike pohjassa: teksti ja tunnistetut asiat heti näkyvissä, korjaus napautuksella |
| Kirjausnäkymä (K2) | Kuvat ja sijainti (pieni pohjakuvaote) ylhäällä, yksi kasvava havaintoteksti ja siitä poimitut tiedot. *Raporttia varten vielä* listaa vain puuttuvat: napautus avaa vastauksen (valinta, Sanele, Ota kuva, Ei tiedossa, OK). Tallennus aina |
| Tekstilaatikot (K2) | Kaikki tekstilaatikot kasvavat tekstin mukana |
| Kamera (K2) | Tallenna ja seuraava, Kumoa-ilmoitus kuvan jälkeen, salama (jos puhelin tukee), Muista-rivi menetelmälle. Puheohjaus: menetelmä sanelun alussa vaihtaa menetelmän, ”seuraava” lopussa tallentaa ja aloittaa uuden, ”kumoa” poistaa viimeisen kuvan, ”yleiskuva” |
| Kuvien merkinnät (K2) | Havaintokuvaan piirretyt merkinnät säilyvät muokattavina sovelluksessa. Raportointipaketissa piirretystä kuvasta on lisäksi PDF (`kuvat/muokattavat/`), jossa merkinnät ovat muokattavia kommentteja |
| Pohjakuvan merkinnät (K2) | Kenttälomakkeen merkintäeditori (`js/plan-markup.js`): napautus vain valitsee, siirto ja muotoilu vasta Siirrä-painikkeella, vanhat merkinnät lukittu (🔒). Merkinnät kerroksittain, synkronoituvat ja tulevat PDF:ään muokattavina merkintöinä. Kirjaukset ilman merkittyä kohtaa näkyvät tilan kohdalla katkoviivalla |
| Kuntoarvio ja AKK (K2) | Kamera ei kysy menetelmää eikä osiota; sanelu ohjaa havainnon osioon (näkyy kuvan päällä). Puuttuva osio kysytään kirjausnäkymässä |
| Word-raportti (K2) | Kenttälomakkeen raporttipohjamoottori (`js/raporttipohja-moottori.js`): yrityksen .docx-pohja laitteelta tai SharePointin kansiosta *Raporttipohjat*. Viimeistele → Word-raportti |
| Siirtotyökalu (K2) | Kenttälomakkeen kohde Kirjuriin: `tools/kenttalomake-vienti-kirjuriin.js` kenttälomakkeessa → ZIP → Kirjurin etusivu: *Palauta varmuuskopio tai tuo kenttälomakkeesta*. Kuvat siirtyvät piirroksineen (kenttälomake tallentaa piirrokset kuvaan, joten ne eivät ole siirron jälkeen muokattavia). Pohjakuva siirtyy merkkeineen ja merkintöineen muokattavana |

| Taidot (K3) | Käyttäjän omat toimintatavat ilman koodimuutoksia: oletukset, kysy / älä kysy, Muista, lyhenteet, puhekomennot, raportille-ohjeet. Tuonti tekstinä (*Liitä taito*), tiedostona tai puhelimen jakovalikosta; muokkaus lomakkeella, versiohistoria. Muoto ja menetelmien kentät: [TAIDOT.md](TAIDOT.md) |
| Omat opit (K3) | Sovellus ehdottaa toistuvista valinnoista oletuksia, toistuvista *Ei tiedossa* -merkinnöistä ”älä kysy” ja käsin korjatuista lyhenteistä tunnistusta; tutkija hyväksyy. Opit kootaan taidoiksi |
| Käyttömittarit (K3) | Vain lukuja (kirjausten määrä ja kesto, korjaukset, kumotut kuvat, Ei tiedossa, puhekomennot); yhteenveto Claudelle kehitystä varten |

Periaate: uudet toimintatavat tuodaan taitoina, menetelmät ja kentät Menetelmät-sivulla ja raporttipohjat Word-tiedostoina. Sovelluksen koodia muutetaan vain, kun tarvitaan kokonaan uusi rakennuspalikka.

Seuraavaksi (ks. *Tiekartta*): SharePoint käyttöön (IT), pilottikäyttö kentällä ja sen palautteen korjaukset.

## Käyttö ilman asennusta

Sovellus on tavallisia tiedostoja (HTML, CSS, JavaScript), ei käännösvaihetta. Kirjastot ovat repossa (`lib/`, versiot ja tiivisteet `lib/VERSIONS.txt`), joten sovellus toimii myös ilman verkkoa (service worker).

```
python3 tools/testipalvelin.py        # http://localhost:8790/index.html
```

Testipalvelin tarjoilee sovelluksen ja jäljittelee SharePointia (pilvi = "testi"): kirjautuminen on painike, ja tiedot ovat palvelimen muistissa. Pelkkä laite -tila: `python3 -m http.server` hakemistossa (config.js: `pilvi: ""`).

Puhelimella testaus vaatii HTTPS:n (kamera, sanelu, anturit). Julkaisu esim. GitHub Pagesiin tai Azure Static Web Appsiin.

### Asennus puhelimen alkunäyttöön

- Avaa julkaistu osoite (esim. `https://<käyttäjä>.github.io/kirjuri/index.html`) **Chromessa Androidilla** → valikko ⋮ → *Asenna sovellus*. Avaa sivu kerran ja odota pari sekuntia ennen asennusta (service worker käynnistyy).
- Ei toimi: ZIP:stä tai tiedostosta avattuna (`file://`), GitHubin koodinäkymästä (github.com/…/index.html) eikä yksityisestä GitHub Pages -sivusta ilmaisella tilillä. Asennuksessa Google hakee kuvakkeet ja manifestin, joten osoitteen on oltava julkinen (sovellus itsessään ei sisällä asiakastietoja; ne ovat puhelimessa ja SharePointissa).
- Jos samaan osoitteeseen on aiemmin asennettu toinen sovellus (esim. Kuva + sanelu), poista vanha ensin.
- Jos asennus sanoo *Lataaminen epäonnistui*: Chrome-valikko ⋮ → *Lisää aloitusnäyttöön* → *Luo pikakuvake* toimii ilman asennuspakettia (ei kuitenkaan näy jakovalikossa). Jakokohteen asetukset on pidetty samoina kuin Kuva + sanelussa, joka asentuu (K3.1).
- Samsung-puhelimessa avaa osoite **Chromessa**, ei Samsung Internetissä (Samsung Internetin asennus voi päättyä ilmoitukseen *Lataaminen epäonnistui*).
- iPhone: Safari → Jaa → *Lisää Koti-valikkoon*. iPhonessa jakaminen muista sovelluksista Kirjuriin ei ole mahdollista (Applen rajoitus).
- Jakaminen Kirjuriin (Android): kuva → *Jaa* → Kirjuri → valitse kohde → *Uusi kirjaus*, *Yleiskuviksi* tai *Lähtötiedoiksi*. Toimii asennetussa sovelluksessa, kun se on avattu ainakin kerran.

## Pilvi: SharePoint

Kirjaukset tallentuvat aina ensin puhelimeen (IndexedDB) ja siirtyvät pilveen, kun verkko on. Kohde puretaan riveiksi (kohde, kerros, tila, suunnitelman kohta, havainto, tiedosto …), joten kaksi tutkijaa voi kirjata samaan kohteeseen yhtä aikaa.

| SharePoint | Sisältö |
|---|---|
| Lista `Kirjuri-rivit` | Yksi rivi = yksi kohteen osa JSON-tekstinä (`Title` = kohde\|laji\|id, yksilöllinen) |
| Kirjasto `Kirjuri` | `Kohteet/<kohde>_<tunnus>/tiedostot/` kuvat, pohjakuvat ja äänitteet; toimistolla näkyvät tavallisena kansiona |

Kirjautuminen: Microsoft 365 -tunnus (MSAL, Entra ID). Oikeus: `Sites.Selected` (vain Kirjuri-sivusto). Käyttöönotto IT:lle: [KAYTTOONOTTO-SHAREPOINT.md](KAYTTOONOTTO-SHAREPOINT.md).

Ennen IT:n hyväksyntää: config.js `pilvi: ""`. Kaikki kenttätyö toimii; varmuuskopio ja raportointi ZIP-pakettina. Kaksi tutkijaa samassa kohteessa eri puhelimilla ei toimi ennen pilveä.

## Tiedostot

| Polku | Sisältö |
|---|---|
| `index.html`, `css/app.css`, `sw.js` | Sovellus, ulkoasu, toiminta ilman verkkoa |
| `js/app.js` | Malli, reititys, kohdesivu, alapalkki |
| `js/sanelu.js` | Sanelu-painike ja -paneeli |
| `js/pilvi.js`, `js/sharepoint.js`, `js/sync.js`, `js/cloudui.js` | Kirjautuminen, Graph-palvelu, rivisynkronointi, tila yläpalkissa |
| `js/capture.js`, `js/card.js`, `js/komennot.js` | Kamera, kirjausnäkymä, puheohjaus |
| `js/plan-markup.js` | Pohjakuvan merkintäeditori (kenttälomakkeesta; napautus valitsee, Siirrä siirtää) |
| `js/raporttipohja-moottori.js`, `js/raporttipohjat.js` | Word-raportti yrityksen pohjasta |
| `js/siirto.js`, `tools/kenttalomake-vienti-kirjuriin.js` | Siirtotyökalu kenttälomakkeesta |
| `js/taidot.js`, `js/taidotnakyma.js`, `TAIDOT.md` | Taidot, Omat opit, käyttömittarit; muoto ja ohje |
| `js/autofill.js`, `js/fieldfill.js` | Sanelusta menetelmä, tila, tulos ja menetelmän kentät |
| `js/meter.js`, `js/lukulaite-ocr.js` | Mittarin näytön luku kameralla (Vaisala HM40) |
| `js/paikannus.js`, `js/plan.js` | Seuranta (askeleet ja kompassi) ja pohjakuva |
| `js/akk.js`, `js/kuntoarvio.js` | Asuntokaupan kuntotarkastus ja kuntoarvio |
| `js/export.js` | Raportointipaketti (ZIP) ja varmuuskopio |
| `js/menetelmat-data.js` | Menetelmät, näytetyypit, AKK-osiot (`tools/build_data.py`) |
| `tools/testipalvelin.py` | Kehityspalvelin ja SharePoint-jäljitelmä |
| `tools/paivita_sw.py` | Päivittää `sw.js`:n tiedostolistan ja välimuistin version julkaisussa |
| `tests/` | Playwright-testit (`python3 tests/test_*.py`) |
| `docs/kuva-sanelu-historia.md` | Kuva + sanelun README versiohistorioineen (v1–v48) |

Tietomuodot ovat yhteensopivia Kuva + sanelun kanssa (`kuva-sanelu/1`, lähtötietopaketti `kuva-sanelu-lahtotiedot` v1), joten vanhat ZIP-varmuuskopiot ja Clauden lähtötietopaketit (taito `pbm-lahtotiedot`) toimivat sellaisinaan.

## Testit

```
pip install playwright && python3 -m playwright install chromium
for t in tests/test_*.py; do python3 $t; done
```

| Testi | Kattaa |
|---|---|
| `test_kohdesivu_sanelu.py` | kohdesivu, alapalkki, sanelu (kirjaus, muistiinpano, korjaus) |
| `test_kirjausnakyma.py` | kirjausnäkymän järjestys, kasvava teksti, puuttuvat, Ei tiedossa, sanelu puuttuvaan, tallennus aina |
| `test_kamera.py` | Kumoa, puhekomennot (menetelmä, seuraava, kumoa), Muista-rivi, AKK ilman valintoja |
| `test_merkinnat.py` | merkinnät: napautus ei siirrä, lukko, Siirrä, PDF-vienti, arvioidut merkit |
| `test_raporttipohja.py` | Word-raportti pohjasta (SharePoint-jäljitelmä), kirjaukset ja kuvat raportissa |
| `test_siirto.py` | kenttälomakkeen vienti ja tuonti Kirjuriin |
| `test_jako.py` | asennettavuus (Chrome), jaettu kuva kirjaukseksi ja yleiskuvaksi, jaettu taito |
| `test_taidot.py` | taidon tuonti, oletukset, kysy / älä kysy, Muista, lyhenteet, komennot, Omat opit, lomake, versiohistoria |
| `test_synkronointi.py` | kaksi laitetta, kuvat, muutokset puolin ja toisin |
| `test_reitit_laite.py` | kaikki näkymät ilman pilveä, ei JS-virheitä |

## Tiekartta

1. ~~Runko, tallennusrajapinta ja SharePoint, kohdesivu, alapalkki, sanelu~~ (K1)
2. ~~Kirjausnäkymä: kuvat ja sijainti ylhäällä, yksi havaintoteksti, puuttuvat listana~~ (K2)
3. ~~Kamera: Tallenna ja seuraava, salama, Muista-rivi, Kumoa, puheohjaus~~ (K2)
4. ~~Pohjakuvan merkinnät: napautus valitsee, Siirrä-painike, lukko, PDF; arvioidut merkit tilaan~~ (K2)
5. ~~Kuntoarvio ja AKK: kamera ilman valintoja, sanelu ohjaa osion~~ (K2)
6. ~~Word-raporttipohjat; menetelmäeditori (Menetelmät) on jo mukana~~ (K2)
7. SharePoint käyttöön (IT) · ~~siirtotyökalu kenttälomakkeesta~~ (K2)
8. ~~Taidot, Omat opit ja käyttömittarit~~ (K3)
9. Pilotti kentällä; taidot ja opit käyttäjän mukana laitteelta toiselle SharePointin kautta; tiimin yhteiset taidot (kansio Taidot/, pääkäyttäjä hyväksyy); avoimet: kahden tutkijan yhtäaikaiset merkinnät samaan kerrokseen (nyt viimeisin tallennus voittaa), puhekomento ”märkätilat kunnossa”

## Tietosuoja

- Asiakastiedot vain laitteella ja organisaation SharePointissa. Muualle sovellus ei lähetä tietoja (Content-Security-Policy, `index.html`).
- Sanelun puheentunnistus: config.js `puheentunnistus` ("laite" = ääni ei lähde puhelimesta).
- Uloskirjautuminen poistaa pilvikohteet laitteelta; lähettämättömät muutokset estävät poiston.
- Ei henkilöiden nimiä eikä yksilöityjä terveystietoja kirjauksiin (muistutus näkymissä).
