#!/usr/bin/env python3
"""Playgama derlemesi: index.html'den portal sürümünü üretir ve yüklemeye hazır zip yapar.

Kullanım:  python3 tools/build_playgama.py
Çıktı:     playgama/index.html, playgama/playgama-bridge-config.json, playgama/mine-duel-playgama.zip

Portal sürümünde <meta name="tanik-platform" content="playgama"> ve Playgama Bridge SDK bulunur;
oyun bu işarete bakarak reklamları, platform olaylarını ve portal kurallarını (dış bağlantı yok,
yalnızca misafir hesap) devreye alır. Normal site (index.html) değişmez.
"""
import json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "playgama")
SDK = "https://bridge.playgama.com/v2/stable/playgama-bridge.js"

def main():
    src = open(os.path.join(ROOT, "index.html"), "rb").read().decode("utf-8")
    nl = "\r\n" if "<head>\r\n" in src else "\n"
    head = "  <head>" + nl
    if src.count(head) != 1:
        sys.exit("index.html içinde <head> bulunamadı")
    inject = (head + '    <meta name="tanik-platform" content="playgama" />' + nl +
              '    <script src="' + SDK + '"></script>' + nl)
    out = src.replace(head, inject, 1)
    # Portalda gerekmeyen ya da dışarıyı gösteren bağlantılar.
    for pat in [r'<link rel="canonical"[^>]*>\r?\n', r'<link rel="manifest"[^>]*>\r?\n', r'<link rel="apple-touch-icon"[^>]*>\r?\n']:
        out, k = re.subn(pat, "", out, count=1)
        if k != 1:
            sys.exit("beklenen satır bulunamadı: " + pat)
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "index.html"), "wb").write(out.encode("utf-8"))
    cfg = {}
    open(os.path.join(OUT, "playgama-bridge-config.json"), "w").write(json.dumps(cfg, indent=2) + "\n")
    z = os.path.join(OUT, "mine-duel-playgama.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as f:
        f.write(os.path.join(OUT, "index.html"), "index.html")
        f.write(os.path.join(OUT, "playgama-bridge-config.json"), "playgama-bridge-config.json")
    ver = re.search(r'VERSION = "([^"]+)"', src).group(1)
    print("Playgama derlemesi hazır: sürüm %s, zip %.0f KB" % (ver, os.path.getsize(z) / 1024))

if __name__ == "__main__":
    main()
