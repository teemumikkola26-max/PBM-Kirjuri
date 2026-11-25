# Kirjurin taidot: muoto ja ohje taidon tekijälle (myös Claude)

Taito on käyttäjän oma toimintatapa: mitä täytetään valmiiksi, mitä kysytään, mitä muistutetaan, mitkä lyhenteet ja puhekomennot ovat käytössä ja mitä raportille toivotaan. Taito on pelkkää tietoa (JSON), ei ohjelmakoodia, joten sen voi tuoda sovellukseen ilman sovelluspäivitystä:

- **Liitä taito**: Taidot-näkymä → *Liitä taito* → liitä teksti (koodilohko kelpaa sellaisenaan).
- **Tiedosto**: `Nimi.kirjuri-taito.json` → puhelimessa *Jaa → Kirjuri* tai Taidot → *Tuo tiedosto*.
- **Lomake**: Taidot → *Uusi taito*.

Ennen käyttöönottoa sovellus näyttää, mitä taito tekee, ja varoittaa tuntemattomista kentistä tai toiminnoista. Taidot ovat käyttäjäkohtaisia ja toimivat kaikissa kohteissa. Vanha versio jää versiohistoriaan.

## Muoto (versio 1)

```json
{
  "format": "kirjuri-taito",
  "versio": 1,
  "id": "rh-betonilaatta",
  "nimi": "Betonilaatan RH-mittaus",
  "kuvaus": "Porareikämittaukset maanvaraisessa laatassa",
  "milloin": { "menetelmat": ["rh"], "akk": false, "kuntoarvio": false },
  "oletukset": [{ "k": "Mittaustapa", "v": "Porareikä" }],
  "kysy": [{ "k": "Rakenne mittauspisteen kohdalla" }],
  "alaKysy": [],
  "muista": "Mittaussyvyydet laatan paksuuden mukaan, vertailumittaus huoneilmasta.",
  "lyhenteet": [{ "sana": "rh-piste", "tarkoittaa": "rh-mittaus" }],
  "komennot": [{ "lause": "piste valmis", "toiminto": "seuraava" }],
  "raportille": "RH-tulokset syvyyksittäin, tulkinta ja vertailu tavoitearvoon lähteineen."
}
```

| Kohta | Merkitys |
|---|---|
| `milloin.menetelmat` | Menetelmien tunnukset (taulukko alla). Tyhjä = kaikki kirjaukset. `akk` / `kuntoarvio`: vain kun kohde on asuntokaupan kuntotarkastus / kuntoarvio |
| `oletukset` | Tyhjä kenttä täytetään. `k` = kentän nimi tai tunnus, `v` = arvo, valinnainen `m` = menetelmä, jos taito koskee useaa menetelmää |
| `kysy` | Kenttä nostetaan *Raporttia varten vielä* -listalle, vaikka se ei ole pakollinen |
| `alaKysy` | Kenttää ei kysytä. Myös `tulos`, `kohta` (suunnitelman kohta), `tila` |
| `muista` | Muistutus kamerassa ja kirjauksessa |
| `lyhenteet` | Sanelussa: lyhenne tulkitaan pidempänä sanana (tunnistus menetelmälle, tilalle ja kentille) |
| `komennot` | Puhekomento, kun lause on sanelun lopussa tai yksinään. Toiminnot: `kunnossa` (tarkistuslistan tyhjät kohdat kunnossa), `seuraava`, `kumoa`, `yleiskuva`, `tulos:ok`, `tulos:poikkeama`, `menetelma:<tunnus>` |
| `raportille` | Ohje raportin laatijalle ja AI:lle (tulee raportointipaketin LUE_MINUT.txt:hen) |

Ohjeita taidon tekijälle:
- Älä kirjoita taitoon mittaustuloksia, viitearvoja tai normien pykäliä muistista. Raportille-ohjeessa viittaa lähteeseen yleisesti ja jätä arvojen tarkistus raportin laatijalle.
- Älä kirjoita taitoon asiakas- tai kohdetietoja: taito on toimintatapa, ei kohteen tieto.
- Pidä taito yhdessä tilanteessa (menetelmä tai kohdetyyppi). Useampi pieni taito on helpompi ylläpitää kuin yksi suuri.
- Kentän nimi kirjoitetaan kuten alla (ilman hakasulkeita). Valintakentän arvon on oltava jokin vaihtoehdoista, jos ne on lueteltu.

## Menetelmät ja kentät (Kirjuri K3)

Ajantasainen lista näkyy sovelluksessa: Taidot → Uusi taito (kentät valituille menetelmille). Menetelmiä muokataan Menetelmät-sivulla.

| Tunnus | Menetelmä | Kentät [vaihtoehtoja] |
|---|---|---|
| `aisti` | Aistinvarainen tarkastelu | – |
| `pintakosteus` | Pintakosteuskartoitus | Havaintokohdan lukema; Vertailukohdan lukema |
| `rh` | Rakenteen RH-mittaus | Mittauspisteen tunnus; Tasaantumisaika; Mittaukset (taulukko); Ympäröivät olosuhteet (taulukko); Mittaustapa [Porareikä / Näytepala]; Rakenne mittauspisteen kohdalla |
| `avaus` | Rakenneavaus | Avauksen tunnus; Rakennekerrokset (sisältä ulos) |
| `nayte` | Näytteenotto | Näytetyyppi [Asbesti, materiaali / Asbesti, ilma / PAH, materiaali / PCB, materiaali / POP-yhdisteet / klooratut parafiinit, materiaali / Ftalaatit ja TXIB, materiaali / Raskasmetallit / lyijy, materiaali / Laskeumapöly, mineraalikuidut (geeliteippi)]; Näytenumero; Materiaali; Rakenne ja näytteen kerrokset; Rakenneavaus, josta näyte otettiin; Näytteenottopaikka (osasto / rajattu tila); Suodatin [Ø 25 mm / Ø 37 mm]; Virtaus; Pumpun tunnus; Aloitusaika; Lopetusaika; Näytteenottoaika; Ilmamäärä; Alipaineistus päällä [Kyllä / Ei]; Viimeisin pölyävä työvaihe ja sen päättymisaika; Rakenne ja näytteen kerrokset; Keräyksen aloituspäivä; Keräysaika; Keräyspinta [Tasopinta / Lasilevy]; Keräyskorkeus; Kanava [Tuloilmakanava / Poistoilmakanava]; Kohta kanavassa / päätelaite; Mittauksen tarkoitus [Siivouksen lopputulos / Siivousjärjestelmä / Pölyyntymisnopeus]; Pinta [Kova lattia / Puolikova lattia / Kalusteen vaakapinta / Kiintokalusteen vaakapinta]; Pölypeitto; Näytteen pinta [Tasopinta / Tuloilmakanavan sisäpinta]; Pölyn kertymäaika; Näytteenottotapa [Henkilökohtainen / Staattinen]; Kenttänollakeräimen tunnus; Työvaihe; Näytteen syvyys pinnasta; Elatusalusta / keräimen tunnus [M2 / DG18 / THG]; Näytteenottoaika; Ulkoilman vertailunäyte [Otettu / Ei otettu]; Lumipeite [Kyllä / Ei]; Kenttänollamaljat mukana [Kyllä / Ei]; Keräimen numero; Kenttänollakeräimen numero; Pinta / materiaali; Näytteenottoala; Vertailupinta [Näyte on vertailupinta / Vertailupinnan näyte otettu / Ei otettu]; Pyyhitty alue; Kertymän alkupäivä (pinta puhdistettu); Pinta; Näyteputken numero; Kenttänollaputken numero; Ilmanvaihto näytteenoton aikana [Koneellinen, normaalisti päällä / Painovoimainen / Ei tiedossa]; Näyte vai nollanäyte [Näyte / Nollanäyte]; Sisääntuloputken numero; Näytteenottoputkien numerot; Tuuletuksen putkien numerot; Pumppujen koodit; Puhallusvirtaus; Ulostulovirtaus; Imevien pumppujen virtaukset; Tiivistys valkoisella massalla [Kyllä / Ei]; Kenttänollakeräin (KN) mukana [Kyllä / Ei]; Rakenneosa; Porauspinta / suunta; Halkaisija; Pituus; Pinnoite / rappaus; Osuiko raudoitteeseen [Kyllä / Ei]; Karbonatisoitumissyvyys (kenttä, fenoliftaleiini); Näytteen muoto [Porakappale / Porajauhe]; Syvyysvälit; Kasa / jäte-erä; Osanäytteiden määrä; Näytteen massa; BTEX-erillisnäyte [Otettu / Ei]; Laboratorio; Lisätiedot labralle |
| `merkkiaine` | Merkkiainekoe | Kokeen tunnus; Injektointikohta; Painesuhde; Ilmavuodon luokka [Ei vuotoa / Pistemäinen ilmavuoto / Vähäinen ilmavuoto / Merkittävä ilmavuoto] |
| `lampokuvaus` | Lämpökuvaus | Sisälämpötila; Ulkolämpötila; Painesuhde; Kuvauksen vaihe [Normaali käyttötilanne / Alipaineistettuna]; Sisäilman suhteellinen kosteus |
| `paine` | Paine-eromittaus | Painesuhde; Tarkastelujakso |
| `mtk` | Märkätilakartoitus | Asunto; Märkätila [Pesuhuone / Sauna / Erillinen WC / Keittiö]; Lattiapinnoite [Keraaminen laatta / Muovimatto / Vinyylilaatta / Klinkkeri / Mikrosementti / pinnoite / Epoksi- tai massalattia / Maalattu betoni / Muu]; Lattian kunto [Hyvä / Välttävä / Huono]; Seinäpinnoite [Keraaminen laatta / Muovimatto / Märkätilatapetti / Märkätilalevy / Mikrosementti / pinnoite / Maalattu rappaus / betoni / Lasitiili / Puupaneeli]; Seinien kunto [Hyvä / Välttävä / Huono]; Kattopinnoite [Puupaneeli / Maalattu levy / Muovipaneeli / Metallikasetti / Maalattu betoni / Märkätilalevy / Muu]; Katon kunto [Hyvä / Välttävä / Huono]; Lattian pko-arvo (suurin); Lattian vertailuarvo; Seinien pko-arvo (suurin); Seinien vertailuarvo; Saumaukset [Ei puutteita / Rakoja / puutteita / Tummentumaa]; Lattian kaadot [Riittävät / Vaatimattomat / Puutteelliset]; Tulvakynnys [Riittävän korkea / Liian matala / Puuttuu]; Lattiakaivo [Ei puutteita / Puutteita]; WC-istuin [Alkuperäinen, kunnossa / Uusittu, kunnossa / Vuotoja]; Allas ja hana [Alkuperäinen, kunnossa / Uusittu, kunnossa / Vuotoja]; Viemärikalusteet [Ei puutteita / Silikonisaumaus puuttuu WC-istuimen juurelta / Kiinnitysruuvien suojatulpat puuttuvat / Muita puutteita]; Kiintokalusteet [Ei vaurioita / Vaurioita]; Allaskaappi [Ei puutteita / Vesivuotojälkiä / Putkien kannakointi puutteellinen / Viemärin liitos epätiivis]; Astianpesukoneen tulvakaukalo [Kyllä / Ei]; Jääkaapin tulvakaukalo [Kyllä / Ei]; Lieden kaatumaeste [Kyllä / Ei] |
| `seuranta` | Olosuhdeseuranta | – |
| `kuntoarvio` | Kuntoarvio | – |
| `ilmamaara` | Ilmamäärämittaus | Mittalaite [Paine-eromittari / Siipipyöräanemometri]; Päätelaitteen tunnus / tyyppi; Tulo / poisto [Tulo / Poisto]; Mitattu ilmamäärä; Suunniteltu ilmamäärä |
| `tiiviys` | Tiiveysmittaus | Mitattu alue / tila; Ilmanvuotoluku q50; Ilmanvaihtuvuus n50; Lattiapinta-ala; Rakennusvaipan ala; Ilmatilavuus |
| `sisailma` | Sisäilman olosuhteiden kertamittaus | Lämpötila; Suhteellinen kosteus; Hiilidioksidi |
| `puukosteus` | Puun kosteusmittaus | Kosteuspitoisuus; Vertailukohdan arvo |
| `asuntokauppa` | Asuntokaupan kuntotarkastus | – |
| `kalvopaksuus` | Kalvopaksuusmittaus | Vedeneristetuote; Valmistajan vaatimus; Mitattu kalvopaksuus; Mittauskohta |
| `viilto` | Viiltomittaus | Mittauspisteen tunnus; Lattiapinnoite; Tasaantumisaika; RH; T |
| `hetkkost` | Hetkellinen rakenteen kosteusmittaus | Mittauspisteen tunnus; Mittauskohta [Eristetaso / Porareikä / Muu]; RH; T |
| `melu` | Melumittaus | Mittauspiste; Mittauksen kesto; LAeq; Taustamelu [Analysoitu / Ei voitu analysoida]; Häiriöt mittauksen aikana |
| `radon_purkki` | Radonmittaus, pitkäaikainen (purkit) | Radonpurkin numero; Huoneisto / tila; Mittaus alkoi; Mittaus päättyi |
| `radon_jatkuva` | Radonmittaus, lyhytaikainen seuranta | Mittaus alkoi; Mittausjakso; Korkein pitoisuus; Keskiarvo |
| `vss` | Väestönsuojan tarkastus (VSS) | Tiiveyskokeen ajaksi tehdyt muutokset; Koepaine; Paineen putoamisaika 200 → 50 Pa; Väestönsuoja tiivis [Kyllä / Ei]; Sulkuteltta/huone [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Käymälä/-komero [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Ovet ja luukut [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Ilmanvaihdon sulkulaitteet/venttiilit [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Ilmanvaihtolaitteisto [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Ylipainemittari [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Vedensaanti ja varavesisäiliöt [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Viemäröinti [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Vuotoveden poisto [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Lämmitys [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Sähkölaitteet [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Viestilaitteet [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Ruosteensuojaus [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Suojan materiaali / suojahäkin lukitus [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Turvallisuushenkilöstön varusteet [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Huoltotyöt [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Suojapuhaltimen öljyn tarkistus [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Suojapuhaltimen norjistuskäyttö [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Erikoissuodattimen tiiviystarkistus [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Ylipainemittarin nestemäärä ja toiminta [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Vuotovesien poisto (laitteet ja käytävät) [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Vesi- ja viemäröintien toiminta [Kunnossa / Korjaustarve / Puuttuu / Ei koske]; Säteilymittarin toiminta [Kunnossa / Korjaustarve / Puuttuu / Ei koske] |
| `vetokoe` | Vetokoe | Mittauspisteen tunnus; Tutkimuspisteen halkaisija; Murtokuorma; Vetolujuus; Murtosyvyys (min–max); Murtotapa [Adheesiomurtuma / Koheesiomurtuma / Osittain liimauksesta]; Murtotavan %-osuudet; Murtopinta suhteessa kiviainekseen; Teräkset murtopinnassa; Suuri kivirae (> 1/3 halkaisijasta) [Kyllä / Ei] |
| `pid` | VOC-kenttämittaus (PID) | Mittauskohta [Huoneilma / Porareikä / Pinta tai rako]; Lukema; Taustataso (huoneilma) |
| `savukoe` | Merkkisavukoe | Tarkoitus [Ilman vaihtuvuus / Ilman leviäminen / Epätiiveyskohdat]; Paine-ero; Havainto |
| `muu` | Muu menetelmä | Menetelmän nimi |

## Mitä sovellus oppii itse (Omat opit)

Sovellus ehdottaa, tutkija hyväksyy (Taidot → *Kirjuri oppi*):
- sama valinta neljässä peräkkäisessä kirjauksessa → täytetäänkö valmiiksi
- sama tieto kolmesti *Ei tiedossa* → lakataanko kysymästä
- tuntematon lyhenne sanelun alussa ja menetelmä korjattu käsin kahdesti → tunnistetaanko jatkossa

Hyväksytyt opit kertyvät taitoon *Omat opit*. Kun samalle menetelmälle on vähintään kolme oppia, ne voi koota nimetyksi taidoksi.

Käyttömittarit (vain lukuja): kirjausten määrä ja kesto, korjaukset, kumotut kuvat, Ei tiedossa, puuttuvat tallennettaessa, puhekomennot. Taidot → *Kopioi yhteenveto* → anna Claudelle kehitysehdotuksia varten.
