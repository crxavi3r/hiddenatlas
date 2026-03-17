#!/usr/bin/env python3
"""
HiddenAtlas — Japan Grand Cultural Journey
Premium Editorial Route Map — v2
"""
import os, sys
import numpy as np

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, PathPatch, FancyArrowPatch
from matplotlib.path import Path
import matplotlib.patheffects as pe
from matplotlib.lines import Line2D
import matplotlib.ticker as ticker

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT = os.path.abspath(__file__)
ROOT   = os.path.dirname(os.path.dirname(SCRIPT))
OUT    = os.path.join(ROOT, "content/itineraries/japan-grand-cultural-journey/map/route-map.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ── Colors (HiddenAtlas palette) ──────────────────────────────────────────────
BG       = "#F5F0E8"   # warm parchment
OCEAN    = "#C5D9E5"   # soft, desaturated ocean blue
LAND     = "#DDD4BE"   # warm neutral land
LAND_E   = "#B0A48A"   # land border
ROUTE_C  = "#1F3D3A"   # deep green route
GOLD     = "#C9A96E"   # muted gold
GOLD_F   = "#F2E4CB"   # light gold fill
GREEN    = "#2A5248"   # deep green
GREEN_F  = "#C8D9D5"   # light green fill
DAYT_C   = "#8A9E9B"   # day-trip dotted line
TXT_H    = "#1C1A16"   # heading
TXT_B    = "#3C3830"   # body
TXT_S    = "#7C7060"   # subtle
TXT_N    = "#9A8E80"   # very subtle (Nara)
GRID_C   = "#C0B8A8"   # grid lines
WATER_L  = "#7B9FAD"   # water label

# ── Geographic bounds ─────────────────────────────────────────────────────────
X0, X1 = 131.8, 141.8
Y0, Y1 = 32.6, 38.0
LAT_C  = 35.3
cos_c  = np.cos(np.radians(LAT_C))

# ── Figure ────────────────────────────────────────────────────────────────────
DPI = 150
FW, FH = 15.8, 9.8   # inches → 2370×1470 px

fig = plt.figure(figsize=(FW, FH), dpi=DPI)
ax  = fig.add_axes([0, 0, 1, 1])
ax.set_facecolor(OCEAN)
fig.patch.set_facecolor(BG)
ax.set_xlim(X0, X1)
ax.set_ylim(Y0, Y1)
ax.set_aspect(1 / cos_c)
ax.axis('off')

# ── Subtle grid ───────────────────────────────────────────────────────────────
for lon in np.arange(132, 142, 2):
    ax.axvline(lon, color=GRID_C, lw=0.4, alpha=0.25, zorder=1)
for lat in np.arange(33, 38, 1):
    ax.axhline(lat, color=GRID_C, lw=0.4, alpha=0.25, zorder=1)

# ─────────────────────────────────────────────────────────────────────────────
# JAPAN LAND OUTLINES
# ─────────────────────────────────────────────────────────────────────────────

# Honshu — simplified clockwise from NE Aomori
HONSHU = np.array([
    # Aomori / northeast tip
    (140.8, 41.5), (141.3, 41.0), (141.5, 40.5),
    (141.5, 39.5), (141.8, 38.3), (141.3, 37.5), (141.0, 36.9),
    # Kanto Pacific coast
    (141.0, 36.0), (141.0, 35.7),
    # Boso Peninsula tip
    (140.8, 35.1), (140.3, 34.9),
    # Tokyo Bay / Miura Peninsula
    (139.8, 34.9), (139.7, 35.1), (139.4, 35.2), (139.1, 35.2),
    # Izu Peninsula
    (138.9, 35.0), (138.7, 34.8), (138.6, 34.6),
    (138.4, 34.7), (138.2, 34.8),
    # Shizuoka coast
    (137.8, 34.7), (137.4, 34.7),
    # Ise Bay
    (137.1, 34.7), (136.9, 34.5), (136.7, 34.3),
    # Kii Peninsula (south lobe)
    (137.0, 33.8), (136.8, 33.5), (136.4, 33.4),
    (136.0, 33.4), (135.7, 33.5), (135.4, 33.5),
    (135.1, 33.8), (134.8, 34.0),
    # Osaka Bay coast
    (135.0, 34.4), (135.2, 34.6), (135.0, 34.8),
    (134.7, 34.8), (134.5, 34.9),
    # Harima / Seto coast going west
    (134.2, 34.8), (133.9, 34.7), (133.5, 34.5),
    (133.1, 34.4),
    # Hiroshima coast
    (132.7, 34.5), (132.3, 34.4), (131.8, 34.1),
    # Shimonoseki
    (130.9, 33.9), (130.8, 34.1),
    # Japan Sea coast going NE
    (131.1, 34.5), (131.5, 34.9), (131.9, 35.1),
    (132.3, 35.3), (132.6, 35.5),
    # San'in / Shimane / Tottori
    (132.9, 35.5), (133.2, 35.5), (133.6, 35.5),
    (133.9, 35.5), (134.3, 35.5),
    # Hyogo north coast
    (134.6, 35.5), (134.9, 35.6), (135.2, 35.6),
    (135.4, 35.8), (135.6, 35.9),
    # Fukui coast
    (136.0, 35.8), (136.2, 35.8),
    # Noto Peninsula (distinctive north bump)
    (136.5, 36.2), (136.7, 36.5), (136.9, 36.8),
    (137.1, 37.3), (137.3, 37.5),
    # Toyama / Niigata coast
    (137.6, 37.4), (138.0, 37.5), (138.5, 37.5),
    (138.8, 37.7), (139.0, 38.0),
    # Tohoku Japan Sea coast
    (139.4, 38.3), (139.8, 38.6), (140.0, 39.3),
    (140.3, 40.0), (140.5, 40.7), (140.8, 41.5),
])

# Shikoku
SHIKOKU = np.array([
    (132.0, 34.1), (132.5, 34.3), (133.0, 34.3),
    (133.5, 34.2), (134.0, 34.2), (134.7, 34.1),
    (135.2, 33.8),
    (134.2, 33.2), (133.5, 33.0),
    (132.7, 32.8),
    (132.4, 33.1), (132.1, 33.5), (132.0, 34.1),
])

# Kyushu (eastern visible portion)
KYUSHU = np.array([
    (130.9, 33.9), (131.2, 33.5), (131.5, 33.2),
    (131.7, 32.9), (131.3, 32.8), (130.8, 32.9),
    (130.4, 33.1), (130.2, 33.4), (130.4, 33.7),
    (130.7, 33.9), (130.9, 33.9),
])

# Awaji Island (in Osaka Bay)
AWAJI = np.array([
    (134.9, 34.7), (135.1, 34.8), (135.2, 34.6),
    (135.3, 34.3), (135.1, 34.2), (134.9, 34.3),
    (134.8, 34.5), (134.9, 34.7),
])

for pts, alpha in [(HONSHU, 0.97), (SHIKOKU, 0.95), (KYUSHU, 0.92), (AWAJI, 0.90)]:
    poly = Polygon(pts, closed=True,
                   facecolor=LAND, edgecolor=LAND_E,
                   linewidth=0.8, zorder=2, alpha=alpha)
    ax.add_patch(poly)

# ─────────────────────────────────────────────────────────────────────────────
# SMOOTH ROUTE PATH
# ─────────────────────────────────────────────────────────────────────────────

ROUTE_PTS = [
    (139.69, 35.68),  # 0  Tokyo
    (136.63, 36.56),  # 1  Kanazawa
    (136.91, 36.26),  # 2  Shirakawa-go
    (137.25, 36.14),  # 3  Takayama
    (135.77, 35.01),  # 4  Kyoto
    (135.50, 34.69),  # 5  Osaka
    (135.59, 34.21),  # 6  Koyasan
    (134.69, 34.82),  # 7  Himeji
    (133.93, 34.66),  # 8  Okayama
    (133.77, 34.58),  # 9  Kurashiki
    (139.02, 35.23),  # 10 Hakone
    (139.69, 35.68),  # 11 Tokyo (return)
]

def catmull_bezier(pts_list, tension=0.38):
    """Catmull-Rom to cubic Bezier path."""
    pts = [np.array(p) for p in pts_list]
    n = len(pts)
    verts = [pts[0].tolist()]
    codes = [Path.MOVETO]
    for i in range(n - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(n - 1, i + 2)]
        cp1 = p1 + (p2 - p0) * tension
        cp2 = p2 - (p3 - p1) * tension
        verts += [cp1.tolist(), cp2.tolist(), pts[i + 1].tolist()]
        codes += [Path.CURVE4, Path.CURVE4, Path.CURVE4]
    return Path(verts, codes)

# Slight shadow for depth
shadow_patch = PathPatch(
    catmull_bezier(ROUTE_PTS),
    facecolor='none',
    edgecolor='#000000',
    linewidth=3.5,
    zorder=4,
    alpha=0.08,
    capstyle='round',
    joinstyle='round',
)
ax.add_patch(shadow_patch)

# Main route line
route_patch = PathPatch(
    catmull_bezier(ROUTE_PTS),
    facecolor='none',
    edgecolor=ROUTE_C,
    linewidth=2.4,
    zorder=5,
    alpha=0.90,
    capstyle='round',
    joinstyle='round',
)
ax.add_patch(route_patch)

# ─────────────────────────────────────────────────────────────────────────────
# NARA DAY TRIP (dotted)
# ─────────────────────────────────────────────────────────────────────────────
KYOTO_PT = (135.77, 35.01)
NARA_PT  = (135.84, 34.68)

ax.annotate('',
    xy=NARA_PT,
    xytext=KYOTO_PT,
    arrowprops=dict(
        arrowstyle='-',
        color=DAYT_C,
        lw=1.3,
        linestyle=(0, (4, 4)),
        connectionstyle='arc3,rad=0.1',
    ),
    zorder=4,
)

# ─────────────────────────────────────────────────────────────────────────────
# DIRECTION ARROWS (subtle, mid-segment)
# ─────────────────────────────────────────────────────────────────────────────
# Draw small arrowheads at ~60% along selected segments
def mid_arrow(ax, p1, p2, frac=0.55, color=ROUTE_C):
    x = p1[0] + (p2[0] - p1[0]) * frac
    y = p1[1] + (p2[1] - p1[1]) * frac
    dx = (p2[0] - p1[0]) * 0.001
    dy = (p2[1] - p1[1]) * 0.001
    ax.annotate('',
        xy=(x + dx, y + dy),
        xytext=(x - dx, y - dy),
        arrowprops=dict(
            arrowstyle='->', color=color, lw=1.0,
            mutation_scale=8,
        ),
        zorder=6,
    )

for i in range(len(ROUTE_PTS) - 2):
    if i not in [1, 2, 9]:   # skip very short segments and long return
        mid_arrow(ax, ROUTE_PTS[i], ROUTE_PTS[i + 1])

# ─────────────────────────────────────────────────────────────────────────────
# CITY DATA — (name, lon, lat, tier, day_label, txt_offset_pts, ha, va)
# ─────────────────────────────────────────────────────────────────────────────
# tier: 1=primary (gold), 2=secondary (green), 3=tertiary (green, small), 0=day-trip
CITIES = [
    # Primary
    ("Tokyo",          139.69, 35.68, 1, "Days 1–3",  (+14, +1),   'left',   'center'),
    ("Kanazawa",       136.63, 36.56, 1, "Days 4–5",  (-14, +1),   'right',  'center'),
    ("Kyoto",          135.77, 35.01, 1, "Days 9–11", (-14, +3),   'right',  'bottom'),
    ("Osaka",          135.50, 34.69, 1, "Days 12–13",(-14, -3),   'right',  'top'),
    # Secondary
    ("Shirakawa-go",   136.91, 36.26, 2, "Day 6",     (+12, +2),   'left',   'center'),
    ("Takayama",       137.25, 36.14, 2, "Days 7–8",  (+12, +2),   'left',   'center'),
    ("Kōyasan",        135.59, 34.21, 2, "Day 14",    (+12, +1),   'left',   'center'),
    ("Hakone",         139.02, 35.23, 2, "Day 18",    (+12, -3),   'left',   'top'),
    # Tertiary
    ("Himeji",         134.69, 34.82, 3, "Day 15",    (  0, +12),  'center', 'bottom'),
    ("Okayama",        133.93, 34.66, 3, "Day 16",    (+12,  +2),  'left',   'center'),
    ("Kurashiki",      133.77, 34.58, 3, "Day 17",    (-12,  -2),  'right',  'center'),
    # Day trip
    ("Nara",           135.84, 34.68, 0, "day trip",  (+11, +1),   'left',   'center'),
]

# Tier visual config
T_CFG = {
    1: dict(dot_s=260, dot_fc=GOLD_F,  dot_ec=GOLD,    dot_lw=2.0, lbl_fs=9.5, lbl_fw='bold',     day_fs=6.8, day_c=TXT_S),
    2: dict(dot_s=140, dot_fc=GREEN_F, dot_ec=GREEN,   dot_lw=1.6, lbl_fs=8.2, lbl_fw='semibold', day_fs=6.2, day_c=TXT_S),
    3: dict(dot_s=70,  dot_fc=GREEN_F, dot_ec=GREEN,   dot_lw=1.3, lbl_fs=7.0, lbl_fw='normal',   day_fs=5.8, day_c=TXT_S),
    0: dict(dot_s=38,  dot_fc='#EDE8E0',dot_ec=DAYT_C, dot_lw=1.0, lbl_fs=6.5, lbl_fw='normal',   day_fs=6.0, day_c=TXT_N),
}

for name, lon, lat, tier, day_lbl, offset_pts, ha, va in CITIES:
    cfg = T_CFG[tier]

    # Outer halo (subtle glow ring)
    halo_s = cfg['dot_s'] * 2.8
    halo_alpha = 0.12 if tier in (1, 2) else 0.08
    halo_c = GOLD if tier == 1 else GREEN if tier in (2, 3) else DAYT_C
    ax.scatter(lon, lat, s=halo_s, c=halo_c, zorder=5, alpha=halo_alpha, linewidths=0)

    # Main dot
    ax.scatter(lon, lat,
               s=cfg['dot_s'],
               facecolors=cfg['dot_fc'],
               edgecolors=cfg['dot_ec'],
               linewidths=cfg['dot_lw'],
               zorder=7)

    ox, oy = offset_pts

    # City name
    txt = ax.annotate(name,
                 xy=(lon, lat),
                 xytext=(ox, oy),
                 textcoords='offset points',
                 fontsize=cfg['lbl_fs'],
                 fontweight=cfg['lbl_fw'],
                 color=TXT_B if tier > 0 else TXT_N,
                 ha=ha, va=va,
                 zorder=9,
                 fontfamily='Georgia')

    # Day label (below city name — shift further)
    if day_lbl:
        sign = 1 if oy >= 0 else -1
        dy_extra = 9 if oy >= 0 else -9
        ax.annotate(day_lbl,
                    xy=(lon, lat),
                    xytext=(ox, oy + dy_extra),
                    textcoords='offset points',
                    fontsize=cfg['day_fs'],
                    color=cfg['day_c'],
                    ha=ha,
                    va='top' if oy >= 0 else 'bottom',
                    zorder=9,
                    fontfamily='Helvetica',
                    style='italic' if tier == 0 else 'normal')

# ─────────────────────────────────────────────────────────────────────────────
# WATER LABELS (subtle geographic context)
# ─────────────────────────────────────────────────────────────────────────────
for txt, x, y, rot in [
    ("Sea of Japan",        133.5, 36.5, -18),
    ("Pacific Ocean",       138.5, 33.3,   0),
    ("Seto Inland Sea",     133.5, 33.8,  -3),
]:
    ax.text(x, y, txt,
            fontsize=6.8, color=WATER_L, alpha=0.7,
            ha='center', va='center',
            rotation=rot,
            fontfamily='Helvetica',
            style='italic',
            zorder=3)

# ─────────────────────────────────────────────────────────────────────────────
# HEADER PANEL (top strip on BG color)
# ─────────────────────────────────────────────────────────────────────────────
# Draw a parchment header band at the top in figure coordinates
fig.add_axes([0, 0.88, 1, 0.12]).set_visible(False)   # placeholder for layout

# Title and subtitle in figure coords
fig.text(0.50, 0.955, "The Cultural Route Through Japan",
         ha='center', va='center',
         fontsize=20, fontweight='bold',
         color=TXT_H,
         fontfamily='Georgia')

fig.text(0.50, 0.925, "18 Day Cultural Grand Journey",
         ha='center', va='center',
         fontsize=10, color=TXT_S,
         fontfamily='Helvetica',
         style='italic')

# Thin separator line under title
line_ax = fig.add_axes([0.15, 0.905, 0.70, 0.002])
line_ax.set_facecolor(GOLD)
line_ax.axis('off')

# ─────────────────────────────────────────────────────────────────────────────
# LEGEND (bottom-left, minimal)
# ─────────────────────────────────────────────────────────────────────────────
# Place legend in data coords (lower-left ocean area)
LX, LY = 132.3, 33.05   # anchor in data coords
dy = 0.28

# Legend frame (subtle box)
from matplotlib.patches import FancyBboxPatch
legend_bg = FancyBboxPatch(
    (LX - 0.12, LY - 0.15),
    2.7, 1.05,
    boxstyle='round,pad=0.05',
    facecolor=BG, edgecolor=LAND_E,
    linewidth=0.6, alpha=0.88, zorder=10
)
ax.add_patch(legend_bg)

# Legend items
legend_items = [
    (DAYT_C, '#EDE8E0', "Day trip",      1.0,  55, True),
    (GREEN,  GREEN_F, "Route stop",      1.6, 100, False),
    (GOLD,   GOLD_F,  "Start / End",     2.0, 160, False),
]

for i, (ec, fc, label, lw, s, is_dayt) in enumerate(legend_items):
    iy = LY + i * dy
    if is_dayt:
        ax.plot([LX + 0.05, LX + 0.45], [iy, iy],
                linestyle='--', color=ec, lw=1.2, dashes=(3, 3), zorder=11)
        ax.scatter(LX + 0.25, iy, s=40, facecolors=fc, edgecolors=ec,
                   linewidths=1.0, zorder=12)
    else:
        ax.scatter(LX + 0.25, iy, s=s, facecolors=fc, edgecolors=ec,
                   linewidths=lw, zorder=12)
    ax.text(LX + 0.52, iy, label,
            fontsize=6.5, color=TXT_B, va='center', zorder=12,
            fontfamily='Helvetica')

# ─────────────────────────────────────────────────────────────────────────────
# BRAND MARK (lower-right, very subtle)
# ─────────────────────────────────────────────────────────────────────────────
fig.text(0.97, 0.024, "HiddenAtlas",
         ha='right', va='center',
         fontsize=6.5, color=TXT_N, alpha=0.6,
         fontfamily='Georgia', style='italic')

# ─────────────────────────────────────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────────────────────────────────────
plt.savefig(OUT, dpi=DPI, bbox_inches='tight',
            facecolor=BG, edgecolor='none',
            metadata={'Title': 'Japan Grand Cultural Journey Route Map'})
plt.close()
print(f"✓  Saved → {OUT}")
