# Kirjuri ja SharePoint: käyttöönotto (IT)

Kirjuri on selainsovellus (PWA), joka tallentaa kenttäkirjaukset ensin puhelimeen ja synkronoi ne organisaation SharePointiin Microsoft Graphin kautta. Palvelinta ei ole: sovellus on staattisia tiedostoja, ja tiedot ovat vain organisaation Microsoft 365 -ympäristössä.

## 1. Sivusto

1. Luo SharePoint-sivusto **Kirjuri** (esim. `https://<tenant>.sharepoint.com/sites/Kirjuri`).
2. Käyttöoikeudet: kenttätutkijat **Muokkaa**, pääkäyttäjät **Omistajat**. Muilla ei pääsyä.
3. Sivuston käyttäjät näkevät kaikki kohteet (kuten nykyisessä kenttälomakkeessa).

## 2. Lista "Kirjuri-rivit"

Yksi kohde tallentuu useana rivinä, jotta kaksi tutkijaa voi kirjata samaan kohteeseen.

| Sarake | Tyyppi | Asetukset |
|---|---|---|
| Title | (oletus) | **Pakota yksilölliset arvot: kyllä** (indeksoitu) |
| KohdeId | Yksi tekstirivi | **Indeksoitu** |
| Laji | Yksi tekstirivi | |
| RiviId | Yksi tekstirivi | |
| Data | Useita tekstirivejä | Pelkkä teksti, ei liitteitä muutoksiin |
| Poistettu | Kyllä/Ei | oletus Ei |
| Muokkaaja | Yksi tekstirivi | |

- Indeksoi myös **Modified** (sovellus hakee muutokset ajan perusteella).
- Versiohistoria päälle (vahingossa muutettu tieto palautettavissa).

PnP.PowerShell-esimerkki:

```powershell
Connect-PnPOnline -Url https://<tenant>.sharepoint.com/sites/Kirjuri -Interactive
New-PnPList -Title "Kirjuri-rivit" -Template GenericList
Set-PnPField -List "Kirjuri-rivit" -Identity "Title" -Values @{EnforceUniqueValues=$true; Indexed=$true}
Add-PnPField -List "Kirjuri-rivit" -DisplayName "KohdeId" -InternalName "KohdeId" -Type Text
Set-PnPField -List "Kirjuri-rivit" -Identity "KohdeId" -Values @{Indexed=$true}
Add-PnPField -List "Kirjuri-rivit" -DisplayName "Laji" -InternalName "Laji" -Type Text
Add-PnPField -List "Kirjuri-rivit" -DisplayName "RiviId" -InternalName "RiviId" -Type Text
Add-PnPField -List "Kirjuri-rivit" -DisplayName "Data" -InternalName "Data" -Type Note
Add-PnPField -List "Kirjuri-rivit" -DisplayName "Poistettu" -InternalName "Poistettu" -Type Boolean
Add-PnPField -List "Kirjuri-rivit" -DisplayName "Muokkaaja" -InternalName "Muokkaaja" -Type Text
Set-PnPField -List "Kirjuri-rivit" -Identity "Modified" -Values @{Indexed=$true}
Set-PnPList -Identity "Kirjuri-rivit" -EnableVersioning $true
```

Data-sarakkeen tekstin on oltava pelkkää tekstiä (ei rich text). Yli 60 000 merkin rivit sovellus tallentaa automaattisesti JSON-tiedostoksi kirjastoon.

## 3. Dokumenttikirjasto "Kirjuri"

Kuvat, pohjakuvat ja äänitteet: `Kohteet/<kohteen nimi>_<tunnus>/tiedostot/`. Toimistolla kohteen kuvat näkyvät tavallisena kansiona. Versiohistoria päälle.

Kansio `Raporttipohjat/`: yrityksen Word-raporttipohjat (.docx). Tutkija lataa pohjan puhelimeen Kirjurissa (Viimeistele → Word-raportti → Hae SharePointista). Pohjia ylläpitävät pääkäyttäjät.

## 4. Sovellusrekisteröinti (Entra ID)

1. Entra admin center → App registrations → **New registration**: nimi *Kirjuri*, *Accounts in this organizational directory only*.
2. Platform: **Single-page application**, Redirect URI = sovelluksen osoite täsmälleen (esim. `https://kirjuri.pbm.fi/index.html`).
3. API permissions → Microsoft Graph → **Delegated**: `User.Read`, `Sites.Selected` → **Grant admin consent**.
4. Kirjaa talteen: Application (client) ID ja Directory (tenant) ID.

Selainsovelluksen kirjautuminen on voimassa noin 24 tuntia (Microsoftin SPA-käytäntö). Sen jälkeen sovellus pyytää kirjautumaan uudelleen; kirjaukset tallentuvat sillä välin puhelimeen.

## 5. Oikeus vain Kirjuri-sivustoon

`Sites.Selected` ei anna pääsyä mihinkään, ennen kuin sovellukselle annetaan oikeus sivustoon. Käyttäjän pääsy on molempien leikkaus: sovelluksen oikeus sivustoon ja käyttäjän oma oikeus sivustoon.

```powershell
Grant-PnPAzureADAppSitePermission -AppId <client-id> -DisplayName "Kirjuri" -Site https://<tenant>.sharepoint.com/sites/Kirjuri -Permissions Write
```

(Tai Graph: `POST /sites/{site-id}/permissions` `{"roles":["write"],"grantedToIdentities":[{"application":{"id":"<client-id>","displayName":"Kirjuri"}}]}`; vaatii ylläpitäjän oikeuden `Sites.FullControl.All`.)

## 6. Sovelluksen asetukset

`js/config.js`:

```js
pilvi: "sharepoint",
tenantId: "<Directory (tenant) ID>",
clientId: "<Application (client) ID>",
sivusto: "<tenant>.sharepoint.com:/sites/Kirjuri",
lista: "Kirjuri-rivit",
kirjasto: "Kirjuri",
sallitutDomainit: ["pbm.fi"],
```

`index.html`: Content-Security-Policy `connect-src` → vaihda `YOUR-TENANT` organisaation SharePoint-osoitteeksi.

## 7. Julkaisu

Staattinen HTTPS-osoite (GitHub Pages, Azure Static Web Apps tai yrityksen palvelin). Osoitteen on oltava sama kuin rekisteröinnin Redirect URI. Päivitys: korvaa tiedostot ja nosta `sw.js`:n `CACHE`-versio.

## 8. Testaus ennen käyttöä

1. Erillinen testisivusto (esim. `/sites/Kirjuri-testi`) ja `config.js` sen mukaan.
2. Kaksi puhelinta samaan kohteeseen: kirjaukset, kuvat ja muutokset näkyvät molemmissa.
3. Lentotila: kirjaukset tallentuvat ja siirtyvät verkon palattua.
4. Kirjautumisen vanheneminen: sovellus pyytää kirjautumaan, mitään ei häviä.

## Tietosuoja

- Tiedot vain organisaation Microsoft 365 -ympäristössä (EU) ja tutkijan puhelimessa.
- Sovellus ei lähetä tietoja muualle (Content-Security-Policy).
- Uloskirjautuminen poistaa pilvikohteet puhelimesta; lähettämättömät muutokset estävät poiston.
- Kenttälomakkeen (Supabase) kohteet siirretään siirtotyökalulla: kenttälomakkeessa `tools/kenttalomake-vienti-kirjuriin.js` tekee kohteesta ZIP-tiedoston, jonka Kirjuri tuo. Yhteyshenkilön tietoja ei siirretä. Kun siirto on tarkistettu, Supabasen tiedot poistetaan.
