/* =========================================================================
   pilvi.js – kirjautuminen Microsoft 365 -tunnuksilla ja yhteys SharePointiin

   - Ei asetuksia (config.js: pilvi "") -> sovellus toimii vain laitteella.
   - Kirjautuminen: MSAL (Microsoft Entra ID), uudelleenohjaus, PKCE. Kaksivaiheinen
     tunnistus ja tunnusten sulku hoidetaan organisaation Entra-asetuksista.
   - Selainsovelluksen kirjautuminen on voimassa noin vuorokauden. Sen jälkeen
     synkronointi odottaa, kunnes tutkija kirjautuu uudelleen; kirjaukset tallentuvat
     sillä välin puhelimeen, joten mitään ei häviä.
   - Oikeus: Sites.Selected = vain Kirjuri-sivusto (IT antaa sovellukselle oikeuden).

   Sama rajapinta (window.Cloud) kuin aiemmassa Supabase-versiossa, jotta muu
   sovellus ei riipu pilvipalvelusta. Palvelu: window.Cloud.palvelu (sharepoint.js).
   ========================================================================= */
(function () {
  "use strict";
  const C = window.KS_CONFIG || {};
  const tila = C.pilvi === "sharepoint" ? (C.tenantId && C.clientId && C.sivusto && window.msal ? "sharepoint" : "puutteellinen")
    : C.pilvi === "testi" ? "testi" : "";
  const enabled = tila === "sharepoint" || tila === "testi";
  const SCOPES = ["User.Read", "https://graph.microsoft.com/Sites.Selected"];
  let msalApp = null, account = null, profile = null, kirjautunut = false;
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ohita */ } } };

  function sallittu(email) {
    const d = String(email || "").split("@")[1] || "";
    return (C.sallitutDomainit || []).map((x) => x.toLowerCase()).includes(d.toLowerCase());
  }
  // Turvatarkistus: CSP:n connect-src sallii Microsoftin osoitteet (muuten pilviyhteys estetään)
  function cspOk() {
    if (tila === "testi") return true;
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return !!m && m.content.includes("https://graph.microsoft.com") && m.content.includes("https://login.microsoftonline.com");
  }

  async function init() {
    if (tila === "puutteellinen") { Cloud.virhe = "Ylläpito: config.js:n SharePoint-asetukset ovat puutteelliset (tenantId, clientId, sivusto)."; return; }
    if (!enabled) return;
    if (!cspOk()) { Cloud.virhe = "Ylläpito: index.html:n Content-Security-Policy ei salli Microsoftin osoitteita."; return; }
    if (tila === "testi") {
      kirjautunut = LS.get("kirjuri.testi.kirjautunut") === "1";
      if (kirjautunut) await loadProfile();
      return;
    }
    msalApp = new window.msal.PublicClientApplication({
      auth: { clientId: C.clientId, authority: "https://login.microsoftonline.com/" + C.tenantId, redirectUri: location.origin + location.pathname, navigateToLoginRequestUrl: false },
      cache: { cacheLocation: "localStorage" },
      system: { allowNativeBroker: false }
    });
    await msalApp.initialize();
    try {
      const r = await msalApp.handleRedirectPromise();
      if (r && r.account) msalApp.setActiveAccount(r.account);
    } catch (e) { console.warn("Kirjautuminen", e); Cloud.virhe = "Kirjautuminen epäonnistui. Yritä uudelleen."; }
    account = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0] || null;
    if (account && !sallittu(account.username)) { await logout(); Cloud.virhe = "Tunnus ei ole sallitusta organisaatiosta."; return; }
    if (account) {
      msalApp.setActiveAccount(account);
      kirjautunut = true;
      await loadProfile();
    }
  }

  /* Graphin käyttöoikeustunnus. Palauttaa null, jos tarvitaan uusi kirjautuminen. */
  async function token() {
    if (tila === "testi") return kirjautunut ? "testi" : null;
    if (!msalApp || !account) return null;
    try {
      const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account });
      return r.accessToken;
    } catch (e) {
      if (window.msal.InteractionRequiredAuthError && e instanceof window.msal.InteractionRequiredAuthError) { kirjautunut = false; emit(); return null; }
      throw e;
    }
  }

  async function loadProfile() {
    try {
      const me = await Cloud.palvelu.me();
      const vanha = user() || {};
      profile = { id: me.id, email: (me.mail || me.userPrincipalName || "").toLowerCase(), nimi: me.displayName || me.mail, sarja: vanha.sarja || oletusSarja(me.displayName || me.mail) };
      LS.set("ks_profiili", JSON.stringify(profile));
    } catch (e) {
      try { profile = JSON.parse(LS.get("ks_profiili") || "null"); } catch (x) { profile = null; }
    }
  }
  function oletusSarja(nimi) {
    const osat = String(nimi || "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
    return (osat.length >= 2 ? osat[0][0] + osat[osat.length - 1][0] : (osat[0] || "XX").slice(0, 2)).toUpperCase();
  }

  async function login() {
    if (tila === "testi") { LS.set("kirjuri.testi.kirjautunut", "1"); kirjautunut = true; await loadProfile(); emit(); return; }
    if (!msalApp) return;
    await msalApp.loginRedirect({ scopes: SCOPES, prompt: "select_account" });
  }
  async function logout() {
    profile = null; kirjautunut = false;
    LS.set("ks_profiili", null);
    if (tila === "testi") { LS.set("kirjuri.testi.kirjautunut", null); emit(); return; }
    if (msalApp) {
      // Vain sovelluksen omat tunnukset pois laitteelta; Microsoft-istunto muissa palveluissa säilyy
      try { await msalApp.clearCache(); } catch (e) { /* ohita */ }
      account = null;
    }
    emit();
  }
  /* Kenttänumeroiden kirjaimet (TM-05): laitekohtainen asetus */
  async function setSarja(s) {
    s = String(s || "").toUpperCase().replace(/[^A-ZÅÄÖ]/g, "").slice(0, 4);
    if (!s) return false;
    const p = user() || {};
    p.sarja = s; profile = p;
    LS.set("ks_profiili", JSON.stringify(p));
    return true;
  }
  // Offline: viimeksi kirjautuneen tutkijan tiedot laitteelta (kirjaukset jatkuvat ilman verkkoa)
  function user() {
    if (profile) return profile;
    try { return JSON.parse(LS.get("ks_profiili") || "null"); } catch (e) { return null; }
  }

  const Cloud = {
    enabled, tila, init, login, logout, setSarja, user, sallittu, token,
    get kirjautunut() { return kirjautunut; },
    onChange(f) { listeners.push(f); },
    virhe: "",
    palvelu: null      // sharepoint.js asettaa
  };
  window.Cloud = Cloud;
})();
