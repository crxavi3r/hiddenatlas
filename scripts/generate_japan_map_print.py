#!/usr/bin/env python3
"""
HiddenAtlas — Japan Grand Cultural Journey
Print-Optimized Route Map — A4 Landscape 300 DPI
"""
import os, sys
import numpy as np

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, PathPatch, FancyBboxPatch
from matplotlib.path import Path
import matplotlib.patheffects as pe
from matplotlib.lines import Line2D

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT = os.path.abspath(__file__)
ROOT   = os.path.dirname(os.path.dirname(SCRIPT))
OUT    = os.path.join(ROOT, "content/itineraries/japan-grand-cultural-journey/map/route-map-print.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ── Print colors (higher contrast than web) ────────────────────────────────────
BG       = "#F2EDE3"   # warmer parchment
OCEAN    = "#B8CDD8"   # slightly deeper ocean for print contrast
LAND     = "#D8CEBA"   # warm land (slightly darker for print)
LAND_E   = "#9A8E74"   # stronger land border
ROUTE_C  = "#162E2C"   # very dark green route (print-safe)
GOLD     = "#B8903A"   # richer gold for print
GOLD_F   = "#EDD9A8"   # gold fill
GREEN    = "#1E4038"   # deep green
GREEN_F  = "#B5CECA"   # green fill
DAYT_C   = "#7A9290"   # day-trip line
TXT_H    = "#0E0D0A"   # strong heading
TXT_B    = "#2A2620"   # strong body
TXT_S    = "#5A5040"   # subtle
WATER_L  = "#5A7A88"   # water labels
GRID_C   = "#B0A898"   # grid

# ── Geographic bounds ─────────────────────────────────────────────────────────
X0, X1 = 132.0, 141.8
Y0, Y1 = 32.6, 38.0
LAT_C  = 35.3
cos_c  = np.cos(np.radians(LAT_C))

# ── A4 Landscape at 300 DPI ───────────────────────────────────────────────────
# A4 = 297 × 210 mm = 11.69 × 8.27 inches
DPI  = 300
FW   = 11.69
FH   = 8.27
MARGIN_IN = 0.85   # ~21mm margin in inches

fig = plt.figure(figsize=(FW, FH), dpi=DPI)
fig.patch.set_facecolor(BG)

# ── Layout: header + map + footer strips ─────────────────────────────────────
# All in figure-fraction coordinates [left, bottom, width, height]
HEADER_H = 0.10   # 10% for title
FOOTER_H = 0.07   # 7% for footer/legend
LEFT_M   = MARGIN_IN / FW
RIGHT_M  = MARGIN_IN / FW
BOTTOM_M = MARGIN_IN / FH
TOP_M    = MARGIN_IN / FH

map_left   = LEFT_M
map_bottom = BOTTOM_M + FOOTER_H
map_width  = 1 - LEFT_M - RIGHT_M
map_height = 1 - TOP_M - BOTTOM_M - HEADER_H - FOOTER_H

ax = fig.add_axes([map_left, map_bottom, map_width, map_height])
ax.set_facecolor(OCEAN)
ax.set_xlim(X0, X1)
ax.set_ylim(Y0, Y1)
ax.set_aspect(1 / cos_c)
ax.axis('off')

# ── Subtle paper texture (very light noise overlay) ───────────────────────────
rng = np.random.default_rng(42)
noise = rng.random((200, 300))
ax.imshow(noise, extent=[X0, X1, Y0, Y1], aspect='auto',
          cmap='gray', alpha=0.022, zorder=20, interpolation='nearest')

# ── Subtle grid ───────────────────────────────────────────────────────────────
for lon in np.arange(132, 142, 2):
    ax.axvline(lon, color=GRID_C, lw=0.35, alpha=0.20, zorder=1)
for lat in np.arange(33, 38, 1):
    ax.axhline(lat, color=GRID_C, lw=0.35, alpha=0.20, zorder=1)

# ─────────────────────────────────────────────────────────────────────────────
# JAPAN LAND OUTLINES
# ─────────────────────────────────────────────────────────────────────────────
HONSHU = np.array([
    (140.8,41.5),(141.3,41.0),(141.5,40.5),(141.5,39.5),(141.8,38.3),
    (141.3,37.5),(141.0,36.9),(141.0,36.0),(141.0,35.7),(140.8,35.1),
    (140.3,34.9),(139.8,34.9),(139.7,35.1),(139.4,35.2),(139.1,35.2),
    (138.9,35.0),(138.7,34.8),(138.6,34.6),(138.4,34.7),(138.2,34.8),
    (137.8,34.7),(137.4,34.7),(137.1,34.7),(136.9,34.5),(136.7,34.3),
    (137.0,33.8),(136.8,33.5),(136.4,33.4),(136.0,33.4),(135.7,33.5),
    (135.4,33.5),(135.1,33.8),(134.8,34.0),(135.0,34.4),(135.2,34.6),
    (135.0,34.8),(134.7,34.8),(134.5,34.9),(134.2,34.8),(133.9,34.7),
    (133.5,34.5),(133.1,34.4),(132.7,34.5),(132.3,34.4),(131.8,34.1),
    (130.9,33.9),(130.8,34.1),(131.1,34.5),(131.5,34.9),(131.9,35.1),
    (132.3,35.3),(132.6,35.5),(132.9,35.5),(133.2,35.5),(133.6,35.5),
    (133.9,35.5),(134.3,35.5),(134.6,35.5),(134.9,35.6),(135.2,35.6),
    (135.4,35.8),(135.6,35.9),(136.0,35.8),(136.2,35.8),(136.5,36.2),
    (136.7,36.5),(136.9,36.8),(137.1,37.3),(137.3,37.5),(137.6,37.4),
    (138.0,37.5),(138.5,37.5),(138.8,37.7),(139.0,38.0),(139.4,38.3),
    (139.8,38.6),(140.0,39.3),(140.3,40.0),(140.5,40.7),(140.8,41.5),
])
SHIKOKU = np.array([
    (132.0,34.1),(132.5,34.3),(133.0,34.3),(133.5,34.2),(134.0,34.2),
    (134.7,34.1),(135.2,33.8),(134.2,33.2),(133.5,33.0),(132.7,32.8),
    (132.4,33.1),(132.1,33.5),(132.0,34.1),
])
KYUSHU = np.array([
    (130.9,33.9),(131.2,33.5),(131.5,33.2),(131.7,32.9),(131.3,32.8),
    (130.8,32.9),(130.4,33.1),(130.2,33.4),(130.4,33.7),(130.7,33.9),
    (130.9,33.9),
])
AWAJI = np.array([
    (134.9,34.7),(135.1,34.8),(135.2,34.6),(135.3,34.3),
    (135.1,34.2),(134.9,34.3),(134.8,34.5),(134.9,34.7),
])

for pts, alpha in [(HONSHU,0.97),(SHIKOKU,0.95),(KYUSHU,0.92),(AWAJI,0.88)]:
    poly = Polygon(pts, closed=True,
                   facecolor=LAND, edgecolor=LAND_E,
                   linewidth=1.0, zorder=2, alpha=alpha)
    ax.add_patch(poly)

# ─────────────────────────────────────────────────────────────────────────────
# SMOOTH ROUTE PATH
# ─────────────────────────────────────────────────────────────────────────────
ROUTE_PTS = [
    (139.69,35.68),(136.63,36.56),(136.91,36.26),(137.25,36.14),
    (135.77,35.01),(135.50,34.69),(135.59,34.21),(134.69,34.82),
    (133.93,34.66),(133.77,34.58),(139.02,35.23),(139.69,35.68),
]

def catmull_bezier(pts_list, tension=0.38):
    pts = [np.array(p) for p in pts_list]
    n = len(pts)
    verts = [pts[0].tolist()]
    codes = [Path.MOVETO]
    for i in range(n - 1):
        p0 = pts[max(0, i-1)]
        p1 = pts[i]
        p2 = pts[i+1]
        p3 = pts[min(n-1, i+2)]
        cp1 = p1 + (p2 - p0) * tension
        cp2 = p2 - (p3 - p1) * tension
        verts += [cp1.tolist(), cp2.tolist(), pts[i+1].tolist()]
        codes += [Path.CURVE4, Path.CURVE4, Path.CURVE4]
    return Path(verts, codes)

# Drop shadow
ax.add_patch(PathPatch(catmull_bezier(ROUTE_PTS), facecolor='none',
    edgecolor='#000000', linewidth=5.0, zorder=4, alpha=0.07,
    capstyle='round', joinstyle='round'))
# Main route
ax.add_patch(PathPatch(catmull_bezier(ROUTE_PTS), facecolor='none',
    edgecolor=ROUTE_C, linewidth=2.5, zorder=5, alpha=0.92,
    capstyle='round', joinstyle='round'))

# ── Nara day trip ─────────────────────────────────────────────────────────────
ax.annotate('', xy=(135.84,34.68), xytext=(135.77,35.01),
    arrowprops=dict(arrowstyle='-', color=DAYT_C, lw=1.5,
        linestyle=(0,(4,4)), connectionstyle='arc3,rad=0.12'), zorder=4)

# ── Direction arrows ──────────────────────────────────────────────────────────
def mid_arrow(p1, p2, frac=0.55):
    x = p1[0]+(p2[0]-p1[0])*frac; y = p1[1]+(p2[1]-p1[1])*frac
    dx=(p2[0]-p1[0])*0.001; dy=(p2[1]-p1[1])*0.001
    ax.annotate('', xy=(x+dx,y+dy), xytext=(x-dx,y-dy),
        arrowprops=dict(arrowstyle='->', color=ROUTE_C, lw=1.2,
        mutation_scale=10), zorder=6)

for i in range(len(ROUTE_PTS)-2):
    if i not in [1,2,9]:
        mid_arrow(ROUTE_PTS[i], ROUTE_PTS[i+1])

# ─────────────────────────────────────────────────────────────────────────────
# CITY MARKERS & LABELS
# ─────────────────────────────────────────────────────────────────────────────
CITIES = [
    ("Tokyo",         139.69,35.68, 1, "Days 1–3",  (+14,+1),  'left',  'center'),
    ("Kanazawa",      136.63,36.56, 1, "Days 4–5",  (-14,+1),  'right', 'center'),
    ("Kyoto",         135.77,35.01, 1, "Days 9–11", (-14,+3),  'right', 'bottom'),
    ("Osaka",         135.50,34.69, 1, "Days 12–13",(-14,-3),  'right', 'top'),
    ("Shirakawa-go",  136.91,36.26, 2, "Day 6",     (+12,+2),  'left',  'center'),
    ("Takayama",      137.25,36.14, 2, "Days 7–8",  (+12,+2),  'left',  'center'),
    ("Kōyasan",       135.59,34.21, 2, "Day 14",    (+12,+1),  'left',  'center'),
    ("Hakone",        139.02,35.23, 2, "Day 18",    (+12,-3),  'left',  'top'),
    ("Himeji",        134.69,34.82, 3, "Day 15",    (0,+13),   'center','bottom'),
    ("Okayama",       133.93,34.66, 3, "Day 16",    (+12,+2),  'left',  'center'),
    ("Kurashiki",     133.77,34.58, 3, "Day 17",    (-12,-2),  'right', 'center'),
    ("Nara",          135.84,34.68, 0, "day trip",  (+11,+1),  'left',  'center'),
]

T_CFG = {
    1: dict(dot_s=320, dot_fc=GOLD_F,    dot_ec=GOLD,    dot_lw=2.2, lbl_fs=10.0, lbl_fw='bold',     day_fs=7.2, day_c=TXT_S),
    2: dict(dot_s=160, dot_fc=GREEN_F,   dot_ec=GREEN,   dot_lw=1.8, lbl_fs=8.5,  lbl_fw='semibold', day_fs=6.5, day_c=TXT_S),
    3: dict(dot_s=85,  dot_fc=GREEN_F,   dot_ec=GREEN,   dot_lw=1.5, lbl_fs=7.2,  lbl_fw='normal',   day_fs=6.0, day_c=TXT_S),
    0: dict(dot_s=45,  dot_fc='#EAE4DA', dot_ec=DAYT_C,  dot_lw=1.2, lbl_fs=6.8,  lbl_fw='normal',   day_fs=6.0, day_c=TXT_S),
}

for name, lon, lat, tier, day_lbl, (ox,oy), ha, va in CITIES:
    cfg = T_CFG[tier]
    # halo
    ax.scatter(lon, lat, s=cfg['dot_s']*3.0,
               c=GOLD if tier==1 else GREEN if tier in(2,3) else DAYT_C,
               zorder=5, alpha=0.10, linewidths=0)
    # dot
    ax.scatter(lon, lat, s=cfg['dot_s'],
               facecolors=cfg['dot_fc'], edgecolors=cfg['dot_ec'],
               linewidths=cfg['dot_lw'], zorder=7)
    # city name
    ax.annotate(name, xy=(lon,lat), xytext=(ox,oy),
                textcoords='offset points',
                fontsize=cfg['lbl_fs'], fontweight=cfg['lbl_fw'],
                color=TXT_B if tier>0 else TXT_S,
                ha=ha, va=va, zorder=9, fontfamily='Georgia',
                path_effects=[pe.withStroke(linewidth=2.5, foreground=BG)])
    # day label
    if day_lbl:
        dy_extra = 10 if oy >= 0 else -10
        ax.annotate(day_lbl, xy=(lon,lat), xytext=(ox, oy+dy_extra),
                    textcoords='offset points',
                    fontsize=cfg['day_fs'], color=cfg['day_c'],
                    ha=ha, va='top' if oy>=0 else 'bottom',
                    zorder=9, fontfamily='Helvetica',
                    style='italic' if tier==0 else 'normal',
                    path_effects=[pe.withStroke(linewidth=2.0, foreground=BG)])

# ── Water labels ──────────────────────────────────────────────────────────────
for txt, x, y, rot in [
    ("Sea of Japan",    133.5, 36.6, -18),
    ("Pacific Ocean",   138.8, 33.2,   0),
    ("Seto Inland Sea", 133.3, 33.8,  -3),
]:
    ax.text(x, y, txt, fontsize=7.0, color=WATER_L, alpha=0.75,
            ha='center', va='center', rotation=rot,
            fontfamily='Helvetica', style='italic', zorder=3)

# ─────────────────────────────────────────────────────────────────────────────
# TITLE BLOCK (top of figure)
# ─────────────────────────────────────────────────────────────────────────────
title_y_center = 1 - TOP_M - HEADER_H * 0.38
sub_y_center   = 1 - TOP_M - HEADER_H * 0.72

fig.text(0.50, title_y_center,
         "The Cultural Route Through Japan",
         ha='center', va='center',
         fontsize=22, fontweight='bold',
         color=TXT_H, fontfamily='Georgia')

fig.text(0.50, sub_y_center,
         "18 Day Cultural Grand Journey",
         ha='center', va='center',
         fontsize=10.5, color=TXT_S,
         fontfamily='Helvetica', style='italic')

# Separator rule under title
rule_ax = fig.add_axes([0.12, 1 - TOP_M - HEADER_H + 0.008, 0.76, 0.0015])
rule_ax.set_facecolor(GOLD)
rule_ax.axis('off')

# ─────────────────────────────────────────────────────────────────────────────
# LEGEND (bottom-right, inside footer strip)
# ─────────────────────────────────────────────────────────────────────────────
LX, LY = 138.6, 32.72
dy = 0.26

legend_bg = FancyBboxPatch((LX-0.12, LY-0.12), 2.65, 0.98,
    boxstyle='round,pad=0.05', facecolor=BG, edgecolor=LAND_E,
    linewidth=0.8, alpha=0.90, zorder=10)
ax.add_patch(legend_bg)

legend_items = [
    (DAYT_C, '#EAE4DA', "Day trip",   1.2, 50,  True),
    (GREEN,  GREEN_F,   "Route stop", 1.8, 110,  False),
    (GOLD,   GOLD_F,    "Start / End",2.2, 195,  False),
]
for i, (ec, fc, label, lw, s, is_dayt) in enumerate(legend_items):
    iy = LY + i * dy
    if is_dayt:
        ax.plot([LX+0.06, LX+0.46],[iy,iy],
                linestyle='--', color=ec, lw=1.3, dashes=(3,3), zorder=11)
        ax.scatter(LX+0.26, iy, s=45, facecolors=fc, edgecolors=ec,
                   linewidths=1.2, zorder=12)
    else:
        ax.scatter(LX+0.26, iy, s=s, facecolors=fc, edgecolors=ec,
                   linewidths=lw, zorder=12)
    ax.text(LX+0.55, iy, label, fontsize=6.8, color=TXT_B, va='center',
            zorder=12, fontfamily='Helvetica')

# ── Brand mark ────────────────────────────────────────────────────────────────
fig.text(0.97, 0.022, "HiddenAtlas",
         ha='right', va='center',
         fontsize=7.0, color=TXT_S, alpha=0.55,
         fontfamily='Georgia', style='italic')

# ─────────────────────────────────────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────────────────────────────────────
plt.savefig(OUT, dpi=DPI, bbox_inches='tight',
            facecolor=BG, edgecolor='none',
            metadata={'Title': 'Japan Grand Cultural Journey Route Map — Print'})
plt.close()
print(f"✓  Saved → {OUT}")
print(f"   Size: A4 landscape at {DPI} DPI")
