#!/usr/bin/env python3
"""
testipalvelin.py – Kirjurin kehityspalvelin ja SharePointia jäljittelevä Graph-palvelu

Käyttö:  python3 tools/testipalvelin.py [portti]      (oletus 8790)
Avaa:    http://localhost:8790/index.html

- Tarjoilee sovelluksen tiedostot. js/config.js korvataan testiasetuksilla (pilvi: "testi").
- /graph-testi/v1.0/… jäljittelee niitä Microsoft Graphin kutsuja, joita sharepoint.js käyttää:
  sivusto, lista "Kirjuri-rivit" (kohteiden rivit) ja kirjasto "Kirjuri" (kuvat).
  Listan Title on yksilöllinen (kuten SharePointissa asetettuna), Modified sekunnin tarkkuudella.
- Tiedot ovat muistissa (testit: POST /graph-testi/_nollaa, GET /graph-testi/_tila).
Ei tuotantokäyttöön: ei tunnistusta, ei salausta.
"""
import json, os, re, sys, threading, time, uuid
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

JUURI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LUKKO = threading.Lock()
TILA = {"items": {}, "files": {}, "uploads": {}, "seq": 0, "pyynnot": 0}

CONFIG = """window.KS_CONFIG = {
  pilvi: "testi", tenantId: "", clientId: "", sivusto: "testi.sharepoint.com:/sites/Kirjuri",
  lista: "Kirjuri-rivit", kirjasto: "Kirjuri", sallitutDomainit: ["pbm.fi"],
  puheentunnistus: "palvelin", laitteellaPaivia: 14
};
"""

def nyt():
    return datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")

def suodatin(f):
    """fields/X eq 'v' [and fields/Modified gt 'iso'] -> lista ehtoja"""
    ehdot = []
    for osa in re.split(r"\s+and\s+", f or ""):
        m = re.match(r"fields/(\w+)\s+(eq|gt)\s+'((?:[^']|'')*)'", osa.strip())
        if m:
            ehdot.append((m.group(1), m.group(2), m.group(3).replace("''", "'")))
    return ehdot

def osuu(fields, ehdot):
    for k, op, v in ehdot:
        x = fields.get(k)
        if op == "eq" and str(x) != v:
            return False
        if op == "gt" and not (str(x) > v):
            return False
    return True


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=JUURI, **kw)

    def log_message(self, *a):
        pass

    def json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def virhe(self, code, msg, koodi=""):
        self.json(code, {"error": {"code": koodi or str(code), "message": msg}})

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    # ---------- staattiset ----------
    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith("/graph-testi/"):
            return self.graph("GET", u)
        if u.path.endswith("/js/config.js") or u.path == "/js/config.js":
            b = CONFIG.encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path.startswith("/graph-testi/"):
            return self.graph("POST", u)
        self.send_error(405)

    def do_PATCH(self):
        return self.graph("PATCH", urlparse(self.path))

    def do_PUT(self):
        return self.graph("PUT", urlparse(self.path))

    # ---------- Graph ----------
    def graph(self, metodi, u):
        p = unquote(u.path[len("/graph-testi"):])
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        with LUKKO:
            TILA["pyynnot"] += 1
        if p == "/_nollaa":
            with LUKKO:
                TILA.update({"items": {}, "files": {}, "uploads": {}, "seq": 0, "pyynnot": 0})
            return self.json(200, {"ok": True})
        if p == "/_tila":
            with LUKKO:
                return self.json(200, {"items": list(TILA["items"].values()), "files": {k: len(v[0]) for k, v in TILA["files"].items()}, "pyynnot": TILA["pyynnot"]})
        if p.startswith("/upload/"):
            return self.upload(p.split("/")[-1])
        if not p.startswith("/v1.0/"):
            return self.virhe(404, "ei löydy")
        if self.headers.get("Authorization") != "Bearer testi":
            return self.virhe(401, "InvalidAuthenticationToken", "InvalidAuthenticationToken")
        p = p[len("/v1.0"):]

        if p == "/me":
            return self.json(200, {"id": "u1", "displayName": "Testi Tutkija", "mail": "testi.tutkija@pbm.fi", "userPrincipalName": "testi.tutkija@pbm.fi"})
        m = re.match(r"^/sites/site1/lists/list1/items(?:/(\d+)(/fields)?)?$", p)
        if m:
            return self.lista(metodi, m.group(1), q)
        if p == "/sites/site1/lists":
            return self.json(200, {"value": [{"id": "list1", "displayName": "Kirjuri-rivit"}]})
        if p == "/sites/site1/drives":
            return self.json(200, {"value": [{"id": "drive1", "name": "Kirjuri"}]})
        if p.startswith("/sites/") and "/lists" not in p and "/drives" not in p:
            return self.json(200, {"id": "site1"})
        m = re.match(r"^/drives/drive1/root:/(.+?):/children$", p)
        if m:
            pref = m.group(1).rstrip("/") + "/"
            with LUKKO:
                v = [{"name": k[len(pref):], "size": len(b), "lastModifiedDateTime": nyt()} for k, (b, ct) in TILA["files"].items() if k.startswith(pref) and "/" not in k[len(pref):]]
            if not v:
                return self.virhe(404, "The resource could not be found.", "itemNotFound")
            return self.json(200, {"value": v})
        m = re.match(r"^/drives/drive1/root:/(.+?):/(content|createUploadSession)$", p)
        if m:
            return self.tiedosto(metodi, m.group(1), m.group(2))
        return self.virhe(404, "tuntematon polku " + p)

    def lista(self, metodi, item_id, q):
        with LUKKO:
            items = TILA["items"]
            if metodi == "GET" and not item_id:
                ehdot = suodatin(q.get("$filter"))
                kaikki = [it for it in sorted(items.values(), key=lambda x: int(x["id"])) if osuu(it["fields"], ehdot)]
                top = int(q.get("$top") or 100)
                alku = int(q.get("$skiptoken") or 0)
                sivu = kaikki[alku:alku + top]
                out = {"value": [{"id": it["id"], "fields": dict(it["fields"])} for it in sivu]}
                if alku + top < len(kaikki):
                    base = "http://%s/graph-testi/v1.0/sites/site1/lists/list1/items" % self.headers.get("Host")
                    qq = dict(q); qq["$skiptoken"] = str(alku + top)
                    from urllib.parse import urlencode
                    out["@odata.nextLink"] = base + "?" + urlencode(qq)
                return self.json(200, out)
            if metodi == "POST" and not item_id:
                f = json.loads(self.body() or b"{}").get("fields", {})
                if any(it["fields"].get("Title") == f.get("Title") for it in items.values()):
                    return self.virhe(409, "The list item could not be added or updated because duplicate values were found", "nameAlreadyExists")
                TILA["seq"] += 1
                iid = str(TILA["seq"])
                f["Modified"] = nyt()
                items[iid] = {"id": iid, "fields": f}
                return self.json(201, {"id": iid, "fields": f})
            if metodi == "PATCH" and item_id:
                if item_id not in items:
                    return self.virhe(404, "Item not found", "itemNotFound")
                f = json.loads(self.body() or b"{}")
                items[item_id]["fields"].update(f)
                items[item_id]["fields"]["Modified"] = nyt()
                return self.json(200, items[item_id]["fields"])
        return self.virhe(400, "ei tuettu")

    def tiedosto(self, metodi, polku, laji):
        with LUKKO:
            if laji == "content" and metodi == "PUT":
                b = self.body()
                TILA["files"][polku] = (b, self.headers.get("Content-Type") or "application/octet-stream")
                return self.json(201, {"id": uuid.uuid4().hex, "name": polku.split("/")[-1], "size": len(b)})
            if laji == "content" and metodi == "GET":
                if polku not in TILA["files"]:
                    return self.virhe(404, "The resource could not be found.", "itemNotFound")
                b, ct = TILA["files"][polku]
                self.send_response(200)
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
                return
            if laji == "createUploadSession" and metodi == "POST":
                sid = uuid.uuid4().hex
                TILA["uploads"][sid] = {"polku": polku, "data": bytearray()}
                return self.json(200, {"uploadUrl": "http://%s/graph-testi/upload/%s" % (self.headers.get("Host"), sid)})
        return self.virhe(400, "ei tuettu")

    def upload(self, sid):
        with LUKKO:
            s = TILA["uploads"].get(sid)
            if not s:
                return self.virhe(404, "istunto puuttuu")
            b = self.body()
            m = re.match(r"bytes (\d+)-(\d+)/(\d+)", self.headers.get("Content-Range") or "")
            s["data"] += b
            if m and int(m.group(2)) + 1 >= int(m.group(3)):
                TILA["files"][s["polku"]] = (bytes(s["data"]), "application/octet-stream")
                del TILA["uploads"][sid]
                return self.json(201, {"id": uuid.uuid4().hex})
            return self.json(202, {"nextExpectedRanges": [str(len(s["data"])) + "-"]})


if __name__ == "__main__":
    portti = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    print("Kirjuri testipalvelin: http://localhost:%d/index.html" % portti)
    ThreadingHTTPServer(("127.0.0.1", portti), H).serve_forever()
