#!/usr/bin/env python3
"""paivita_sw.py – päivittää sw.js:n SHELL-listan index.html:n skripteistä ja nostaa CACHE-version.
Ajo julkaisun yhteydessä: python3 tools/paivita_sw.py"""
import os, re
J = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
idx = open(os.path.join(J, "index.html"), encoding="utf-8").read()
js = [s for s in re.findall(r'<script src="(js/[^"]+)"', idx)]
sw_p = os.path.join(J, "sw.js"); sw = open(sw_p, encoding="utf-8").read()
alku = '  "./", "index.html", "css/app.css",\n  '
uusi = alku + ", ".join('"%s"' % s for s in js) + ",\n"
sw = re.sub(r'  "\./", "index\.html", "css/app\.css",\n  [^\n]*\n', lambda m: uusi, sw, count=1)
m = re.search(r'const CACHE = "kirjuri-v(\d+)"', sw)
sw = sw.replace(m.group(0), 'const CACHE = "kirjuri-v%d"' % (int(m.group(1)) + 1))
open(sw_p, "w", encoding="utf-8").write(sw)
print("SHELL:", len(js), "skriptiä; CACHE kirjuri-v%d" % (int(m.group(1)) + 1))
