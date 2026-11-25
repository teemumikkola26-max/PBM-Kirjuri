/* =========================================================================
   config.js – ympäristön asetukset (ylläpitäjä täyttää)

   Pilvi: organisaation SharePoint (Microsoft 365) ja kirjautuminen
   Microsoft 365 -tunnuksilla. Jos pilvi on "", sovellus toimii pelkästään
   laitteella: kaikki kenttätyö, varmuuskopio ja raportointipaketti ZIP-tiedostona.

   Käyttöönotto: ks. KAYTTOONOTTO-SHAREPOINT.md. Lyhyesti IT:ltä tarvitaan
     - sovellusrekisteröinti Entra ID:hen (tyyppi SPA, uudelleenohjaus = sovelluksen osoite)
     - delegoidut oikeudet User.Read ja Sites.Selected (vain Kirjuri-sivustoon, rooli write)
     - sivusto, jolla lista "Kirjuri-rivit" ja dokumenttikirjasto "Kirjuri"

   TÄRKEÄÄ: index.html:n Content-Security-Policy (connect-src) sallii vain
   login.microsoftonline.com, graph.microsoft.com ja organisaation SharePointin.
   Muualle sovellus ei lähetä tietoja.
   ========================================================================= */
window.KS_CONFIG = {
  pilvi: "",                         // "" = vain laite, "sharepoint" = organisaation SharePoint, "testi" = kehityksen testipalvelin
  tenantId: "",                      // Entra ID: Directory (tenant) ID
  clientId: "",                      // Entra ID: Application (client) ID
  sivusto: "",                       // esim. "pbmrakennustutkimus.sharepoint.com:/sites/Kirjuri"
  lista: "Kirjuri-rivit",            // SharePoint-lista kohteiden tiedoille (rivit)
  kirjasto: "Kirjuri",               // dokumenttikirjasto kuville, pohjakuville ja raporteille
  sallitutDomainit: ["pbm.fi"],      // vain nämä sähköpostidomainit hyväksytään

  /* Puheentunnistus:
     "laite"     tunnistus vain puhelimessa (processLocally). Jos suomen kielipakettia ei ole,
                 sanelu tallennetaan äänitteenä eikä ääntä lähetetä mihinkään.
     "palvelin"  selaimen oletus: ääni lähetetään selaimen puheentunnistuspalveluun
                 (Chrome: Google). Käytä vain, jos yritys on hyväksynyt tämän. */
  puheentunnistus: "palvelin",

  /* Laitteen tiedot: pilvikohteen tiedot poistetaan puhelimesta, kun kohde on synkronoitu
     eikä sitä ole avattu näin moneen päivään. */
  laitteellaPaivia: 14
};
