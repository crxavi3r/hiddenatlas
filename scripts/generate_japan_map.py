#!/usr/bin/env python3
"""
Generates the Japan route map SVG + converts to PNG via sips.

Route: Tokyo → Hakone → Kanazawa → Shirakawa-go → Takayama →
       Kyoto → Osaka → Kurashiki → Naoshima → Hiroshima → Miyajima
"""
import subprocess, os, math

# ── Geographic projection ─────────────────────────────────────────────────────
LON_MIN, LON_MAX = 131.5, 141.0   # west → east
LAT_MIN, LAT_MAX = 33.4, 37.7    # south → north (SVG y is inverted)

# SVG canvas
W, H = 960, 600
# Map area (within canvas)
ML, MR, MT, MB = 78, 40, 88, 58  # margin left/right/top/bottom
MW = W - ML - MR   # 842
MH = H - MT - MB   # 454

def gx(lon):
    return ML + (lon - LON_MIN) / (LON_MAX - LON_MIN) * MW

def gy(lat):
    return MT + (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * MH

# ── Colour tokens ─────────────────────────────────────────────────────────────
C = {
    "bg":       "#F4F1EC",
    "sea":      "#E4EFF0",
    "sea2":     "#D8EAEC",
    "land":     "#EDE9E1",
    "land2":    "#E5E0D5",
    "border":   "#C8C0B0",
    "teal":     "#1B6B65",
    "tealDim":  "#2A7F79",
    "gold":     "#C9A96E",
    "goldDim":  "#A8844E",
    "charcoal": "#1C1A16",
    "muted":    "#6B6156",
    "route":    "#1B6B65",
    "white":    "#FFFFFF",
}

# ── Route cities ──────────────────────────────────────────────────────────────
CITIES = [
    ("Tokyo",        139.69, 35.69),
    ("Hakone",       139.02, 35.23),
    ("Kanazawa",     136.63, 36.56),
    ("Shirakawa-go", 136.90, 36.27),
    ("Takayama",     137.25, 36.15),
    ("Kyoto",        135.76, 35.01),
    ("Osaka",        135.50, 34.69),
    ("Kurashiki",    133.77, 34.60),
    ("Naoshima",     133.97, 34.46),
    ("Hiroshima",    132.45, 34.39),
    ("Miyajima",     132.32, 34.30),
]

# Pre-compute SVG positions
STOPS = [(name, round(gx(lon), 1), round(gy(lat), 1))
         for name, lon, lat in CITIES]

# ── Label offsets (dx, dy, anchor) — tuned per city ──────────────────────────
LABEL_OPTS = {
    "Tokyo":        ( 10, -4,  "start"),
    "Hakone":       ( 10,  3,  "start"),
    "Kanazawa":     (-12, -6,  "end"),
    "Shirakawa-go": ( 11,  3,  "start"),
    "Takayama":     ( 11,  0,  "start"),
    "Kyoto":        (-12, -5,  "end"),
    "Osaka":        (-12,  4,  "end"),
    "Kurashiki":    (-12, -5,  "end"),
    "Naoshima":     ( 11,  5,  "start"),
    "Hiroshima":    (-12, -5,  "end"),
    "Miyajima":     (-12,  5,  "end"),
}

# ── Simplified Honshu outline (lon, lat pairs) ────────────────────────────────
# Traced clockwise: Pacific coast south → Seto Inland Sea → Sea of Japan north
# Points approximate real coastline shapes at editorial detail level.
HONSHU = [
    # NE corner / top edge
    (141.0, 37.7), (141.0, 37.1),
    # East coast → Tokyo Bay area
    (140.8, 36.5), (140.7, 36.0), (140.5, 35.7),
    (140.1, 35.5), (139.8, 35.4),
    # Cape Inubosaki / Boso Peninsula
    (140.8, 35.7), (140.6, 35.4), (139.9, 35.2),
    # Sagami Bay
    (139.6, 35.0), (139.2, 34.9), (138.9, 34.6),
    # Izu Peninsula south
    (138.7, 34.4), (138.6, 34.1),
    # Pacific coast westward
    (138.2, 34.2), (137.6, 34.1), (137.1, 34.3),
    (136.7, 34.2),
    # Kii Peninsula
    (136.4, 33.6), (135.9, 33.5), (135.4, 33.5),
    (135.1, 33.7),
    # Osaka Bay / Kii Channel
    (135.2, 34.2), (135.4, 34.4),
    # Seto Inland Sea (Hiroshima → Okayama → Kobe)
    (135.0, 34.3), (134.4, 34.2), (133.9, 34.1),
    (133.5, 34.1), (133.1, 34.2), (132.6, 34.1),
    (132.1, 34.0), (131.7, 34.0),
    # Left edge: western tip of visible Honshu
    (131.5, 34.1), (131.5, 34.6),
    # San'in coast: Sea of Japan side going east
    (131.8, 34.8), (132.3, 34.8), (132.8, 35.1),
    (133.4, 35.4), (133.9, 35.4), (134.4, 35.5),
    (135.0, 35.5), (135.4, 35.5),
    # Wakasa Bay / Fukui area
    (135.7, 35.7), (136.0, 35.8), (136.4, 36.4),
    # Toyama Bay / Noto Peninsula
    (136.8, 37.0), (137.2, 37.1), (137.4, 37.3),
    (138.2, 37.5), (138.8, 37.7),
    # Top edge back to NE
    (140.0, 37.7), (141.0, 37.7),
]

# Shikoku (south of Seto Inland Sea) — small island shape
SHIKOKU = [
    (132.2, 33.8), (132.9, 33.5), (133.5, 33.4),
    (134.1, 33.5), (134.6, 33.5), (135.1, 33.6),
    (135.3, 33.9), (134.8, 34.1), (134.2, 34.2),
    (133.6, 34.1), (132.8, 34.0), (132.2, 34.0),
]

# Kyushu eastern tip (visible at left edge)
KYUSHU = [
    (131.5, 33.4), (132.2, 33.4), (132.5, 33.5),
    (132.3, 33.7), (131.9, 33.8), (131.5, 33.7),
]

def poly_pts(pts):
    return " ".join(f"{gx(ln):.1f},{gy(lt):.1f}" for ln, lt in pts)

def route_pts():
    return " ".join(f"{x},{y}" for _, x, y in STOPS)

# ── SVG builder ───────────────────────────────────────────────────────────────
def build_svg():
    lines = []
    a = lines.append

    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
      f'viewBox="0 0 {W} {H}">')
    a('<defs>')
    # Sea gradient: subtle depth
    a(f'<linearGradient id="seaGrad" x1="0" y1="0" x2="1" y2="1">')
    a(f'  <stop offset="0%" stop-color="{C["sea"]}"/>')
    a(f'  <stop offset="100%" stop-color="{C["sea2"]}"/>')
    a('</linearGradient>')
    # Land gradient
    a(f'<linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">')
    a(f'  <stop offset="0%" stop-color="#EAE5DB"/>')
    a(f'  <stop offset="100%" stop-color="{C["land2"]}"/>')
    a('</linearGradient>')
    # Drop shadow filter for route line
    a('<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">')
    a('  <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#00000020"/>')
    a('</filter>')
    a('</defs>')

    # ── Background ───────────────────────────────────────────────────────────
    a(f'<rect width="{W}" height="{H}" fill="{C["bg"]}"/>')

    # Sea
    a(f'<rect x="{ML}" y="{MT}" width="{MW}" height="{MH}" '
      f'fill="url(#seaGrad)" rx="2"/>')

    # ── Land masses ──────────────────────────────────────────────────────────
    a(f'<polygon points="{poly_pts(KYUSHU)}" '
      f'fill="url(#landGrad)" stroke="{C["border"]}" stroke-width="0.8"/>')
    a(f'<polygon points="{poly_pts(SHIKOKU)}" '
      f'fill="url(#landGrad)" stroke="{C["border"]}" stroke-width="0.8"/>')
    a(f'<polygon points="{poly_pts(HONSHU)}" '
      f'fill="url(#landGrad)" stroke="{C["border"]}" stroke-width="0.9"/>')

    # ── Route line ────────────────────────────────────────────────────────────
    # Shadow layer
    a(f'<polyline points="{route_pts()}" fill="none" '
      f'stroke="rgba(0,0,0,0.12)" stroke-width="3.5" stroke-linecap="round" '
      f'stroke-linejoin="round" filter="url(#shadow)"/>')
    # Main route (solid teal)
    a(f'<polyline points="{route_pts()}" fill="none" '
      f'stroke="{C["teal"]}" stroke-width="2.2" stroke-linecap="round" '
      f'stroke-linejoin="round"/>')
    # Dashed overlay for travel feel
    a(f'<polyline points="{route_pts()}" fill="none" '
      f'stroke="{C["white"]}" stroke-width="0.7" stroke-linecap="round" '
      f'stroke-dasharray="1,18" stroke-linejoin="round" opacity="0.6"/>')

    # ── City markers ──────────────────────────────────────────────────────────
    for i, (name, x, y) in enumerate(STOPS):
        is_start = (i == 0)
        is_end   = (i == len(STOPS) - 1)
        # Outer ring
        ring_r    = 9 if (is_start or is_end) else 7
        inner_r   = 5 if (is_start or is_end) else 4
        ring_col  = C["gold"] if (is_start or is_end) else C["teal"]
        a(f'<circle cx="{x}" cy="{y}" r="{ring_r + 1.5}" '
          f'fill="white" opacity="0.85"/>')
        a(f'<circle cx="{x}" cy="{y}" r="{ring_r}" '
          f'fill="{ring_col}" opacity="0.22"/>')
        a(f'<circle cx="{x}" cy="{y}" r="{inner_r}" '
          f'fill="{ring_col}"/>')
        # Dot number
        num_str = str(i + 1)
        font_sz = 6 if i >= 9 else 7
        a(f'<text x="{x}" y="{y + 2.5}" text-anchor="middle" '
          f'font-family="Helvetica,Arial,sans-serif" font-weight="bold" '
          f'font-size="{font_sz}" fill="{C["white"]}">{num_str}</text>')

    # ── City labels ──────────────────────────────────────────────────────────
    for i, (name, x, y) in enumerate(STOPS):
        dx, dy, anchor = LABEL_OPTS[name]
        lx = x + dx
        ly = y + dy
        is_start = (i == 0)
        is_end   = (i == len(STOPS) - 1)
        col = C["charcoal"]
        # Label background (legibility over land)
        bg_w = len(name) * 5.5 + 8
        bg_h = 14
        if anchor == "start":
            bg_x = lx - 3
        else:
            bg_x = lx - bg_w + 3
        a(f'<rect x="{bg_x:.1f}" y="{ly - 10:.1f}" '
          f'width="{bg_w:.0f}" height="{bg_h}" rx="2" '
          f'fill="{C["bg"]}" opacity="0.75"/>')
        # City name
        weight = "bold" if (is_start or is_end) else "normal"
        a(f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" '
          f'font-family="Helvetica,Arial,sans-serif" '
          f'font-size="9.5" font-weight="{weight}" '
          f'fill="{col}" letter-spacing="0.3">{name}</text>')

    # ── Outer map border ──────────────────────────────────────────────────────
    a(f'<rect x="{ML}" y="{MT}" width="{MW}" height="{MH}" '
      f'fill="none" stroke="{C["border"]}" stroke-width="1" rx="2"/>')

    # ── Title block (top-left) ─────────────────────────────────────────────────
    a(f'<text x="78" y="28" font-family="Georgia,serif" font-size="15" '
      f'font-weight="bold" fill="{C["charcoal"]}" letter-spacing="0.5">'
      f'Japan</text>')
    a(f'<text x="78" y="46" font-family="Helvetica,Arial,sans-serif" '
      f'font-size="8.5" fill="{C["muted"]}" letter-spacing="2">'
      f'11-STOP CULTURAL JOURNEY</text>')
    a(f'<line x1="78" y1="53" x2="200" y2="53" '
      f'stroke="{C["gold"]}" stroke-width="1.2"/>')

    # ── Route label (top-right) ───────────────────────────────────────────────
    route_text = "Tokyo  ·  Hakone  ·  Kanazawa  ·  Kyoto  ·  Osaka  ·  Hiroshima"
    a(f'<text x="{W - 40}" y="28" text-anchor="end" '
      f'font-family="Helvetica,Arial,sans-serif" font-size="7.5" '
      f'fill="{C["muted"]}" letter-spacing="0.8">{route_text}</text>')

    # ── Branding (bottom) ─────────────────────────────────────────────────────
    a(f'<text x="{W // 2}" y="{H - 16}" text-anchor="middle" '
      f'font-family="Helvetica,Arial,sans-serif" font-size="7.5" '
      f'fill="{C["muted"]}" letter-spacing="2.5">HIDDENATLAS · JAPAN</text>')

    # ── Legend ────────────────────────────────────────────────────────────────
    lx0 = W - 40
    ly0 = H - 52
    a(f'<circle cx="{lx0 - 20}" cy="{ly0}" r="5" fill="{C["gold"]}" opacity="0.9"/>')
    a(f'<text x="{lx0 - 12}" y="{ly0 + 3.5}" '
      f'font-family="Helvetica,Arial,sans-serif" font-size="7.5" '
      f'fill="{C["muted"]}">Start / End</text>')
    a(f'<circle cx="{lx0 - 20}" cy="{ly0 + 16}" r="4" fill="{C["teal"]}"/>')
    a(f'<text x="{lx0 - 12}" y="{ly0 + 19.5}" '
      f'font-family="Helvetica,Arial,sans-serif" font-size="7.5" '
      f'fill="{C["muted"]}">Route stop</text>')

    a('</svg>')
    return "\n".join(lines)


# ── Write SVG + convert to PNG ────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_DIR = os.path.join(ROOT, "content", "itineraries",
                       "japan-grand-cultural-journey", "map")
SVG_PATH = os.path.join(MAP_DIR, "route-map.svg")
PNG_PATH = os.path.join(MAP_DIR, "route-map.png")

svg = build_svg()

print(f"[map] writing SVG → {SVG_PATH}")
with open(SVG_PATH, "w") as f:
    f.write(svg)

print(f"[map] converting SVG → PNG via sips")
result = subprocess.run(
    ["sips", "-s", "format", "png", SVG_PATH, "--out", PNG_PATH],
    capture_output=True, text=True
)
if result.returncode != 0:
    print("[map] sips error:", result.stderr)
    raise SystemExit(1)

size = os.path.getsize(PNG_PATH)
print(f"[map] ✓ PNG saved: {PNG_PATH} ({size // 1024} KB)")

# Remove intermediate SVG (only the PNG is needed by the PDF renderer)
os.remove(SVG_PATH)
print("[map] SVG removed. Done.")
