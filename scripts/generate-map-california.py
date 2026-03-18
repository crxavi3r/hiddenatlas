#!/usr/bin/env python3
"""
HiddenAtlas – California & The American West Route Map
Generates route-map.png matching the Japan/Morocco editorial style.
"""

import json, urllib.request, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
import numpy as np

ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_DIR = os.path.join(ROOT, 'content', 'itineraries', 'california-american-west', 'map')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Palette (HiddenAtlas identity) ─────────────────────────────────────────
BG     = '#F5F0E8'   # cream paper
LAND   = '#CFC4B0'   # neutral beige – background states
HILITE = '#C2B69B'   # slightly richer beige – route states
BORDER = '#A89070'   # warm stone border
ROUTE  = '#1B6B65'   # HiddenAtlas teal
GOLD   = '#C9A96E'   # start / end gold
WHITE  = '#FFFFFF'
TEXT   = '#2C2418'   # dark charcoal
MUTED  = '#8C7B6B'   # warm grey for secondary labels

# ── Map bounds ─────────────────────────────────────────────────────────────
X0, X1 = -126.0, -107.5
Y0, Y1 =   31.0,   42.2

# ── Route waypoints ─────────────────────────────────────────────────────────
# Keep only major direction-changes; closely-spaced points cause spline knots.
ROUTE_PTS = [
    (-122.42, 37.77),   # San Francisco
    (-119.54, 37.74),   # Yosemite
    (-119.02, 35.37),   # Bakersfield (transit)
    (-115.14, 36.17),   # Las Vegas
    (-111.54, 36.86),   # Antelope Canyon / Page
    (-112.14, 36.06),   # Grand Canyon
    (-113.90, 35.20),   # Grand Canyon Western Ranch / Kingman area
    (-118.24, 34.05),   # Los Angeles
    (-117.16, 32.72),   # San Diego
]

# ── Labelled markers ────────────────────────────────────────────────────────
MARKERS = [
    {'name': 'San Francisco', 'xy': (-122.42, 37.77), 'type': 'se',
     'dx': -0.45, 'dy':  0.42, 'ha': 'center'},
    {'name': 'Yosemite',      'xy': (-119.54, 37.74), 'type': 'stop',
     'dx':  0.22, 'dy':  0.40, 'ha': 'center'},
    {'name': 'Las Vegas',     'xy': (-115.14, 36.17), 'type': 'stop',
     'dx':  0.35, 'dy': -0.40, 'ha': 'center'},
    {'name': 'Antelope\nCanyon', 'xy': (-111.54, 36.86), 'type': 'stop',
     'dx':  0.52, 'dy':  0.15, 'ha': 'left'},
    {'name': 'Grand Canyon',  'xy': (-112.14, 36.06), 'type': 'stop',
     'dx': -0.10, 'dy': -0.43, 'ha': 'center'},
    {'name': 'Los Angeles',   'xy': (-118.24, 34.05), 'type': 'stop',
     'dx': -0.60, 'dy': -0.35, 'ha': 'center'},
    {'name': 'San Diego',     'xy': (-117.16, 32.72), 'type': 'se',
     'dx':  0.35, 'dy': -0.35, 'ha': 'center'},
]

# ── State geography ─────────────────────────────────────────────────────────
WESTERN = [
    'California','Nevada','Arizona','Oregon','Washington',
    'Idaho','Utah','Montana','Wyoming','Colorado',
    'New Mexico','Texas','Kansas','Nebraska','Oklahoma',
]
ROUTE_STATES = {'California','Nevada','Arizona','Utah'}


def draw_geom(ax, geom, facecolor):
    """Draw a GeoJSON Polygon or MultiPolygon."""
    def draw_ring(ring):
        pts = [(p[0], p[1]) for p in ring
               if X0 - 4 < p[0] < X1 + 4 and Y0 - 4 < p[1] < Y1 + 4]
        if len(pts) > 2:
            poly = Polygon(pts, closed=True, facecolor=facecolor,
                           edgecolor=BORDER, linewidth=0.45, zorder=1)
            ax.add_patch(poly)

    if geom['type'] == 'Polygon':
        for ring in geom['coordinates']:
            draw_ring(ring)
    elif geom['type'] == 'MultiPolygon':
        for polygon in geom['coordinates']:
            for ring in polygon:
                draw_ring(ring)


def catmull_rom(pts, n_per_seg=80):
    """Smooth Catmull-Rom spline through waypoints."""
    pts = np.array(pts, dtype=float)
    xs, ys = [], []
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for t in np.linspace(0, 1, n_per_seg, endpoint=False):
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2*p1[0])
                       + (-p0[0] + p2[0]) * t
                       + (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2
                       + (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3)
            y = 0.5 * ((2*p1[1])
                       + (-p0[1] + p2[1]) * t
                       + (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2
                       + (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3)
            xs.append(x); ys.append(y)
    xs.append(pts[-1][0]); ys.append(pts[-1][1])
    return xs, ys


def axes_to_data(ax, xt, yt):
    xl, xr = ax.get_xlim()
    yb, yt_ = ax.get_ylim()
    return xl + xt * (xr - xl), yb + yt * (yt_ - yb)


# ── Fetch GeoJSON ───────────────────────────────────────────────────────────
geojson = None
URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"
try:
    print(f"Fetching US states GeoJSON…")
    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        geojson = json.loads(r.read().decode())
    print(f"  OK — {len(geojson['features'])} features")
except Exception as e:
    print(f"  Network fetch failed: {e}")
    print("  Using simplified fallback state outlines")

# ── Build figure ────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(14.0, 9.6), facecolor=BG)
ax.set_facecolor(BG)
ax.set_xlim(X0, X1)
ax.set_ylim(Y0, Y1)
ax.set_aspect('equal')
ax.axis('off')

# ── Draw states ─────────────────────────────────────────────────────────────
if geojson and 'features' in geojson:
    # Draw background states first (lighter), then route states on top
    for pass_num in range(2):
        for feat in geojson['features']:
            name = feat['properties'].get('name', '')
            if name not in WESTERN:
                continue
            is_route = name in ROUTE_STATES
            if pass_num == 0 and is_route:
                continue
            if pass_num == 1 and not is_route:
                continue
            clr = HILITE if is_route else LAND
            draw_geom(ax, feat['geometry'], clr)
else:
    # ── Simplified fallback (approximate state shapes) ──────────────────────
    CA_coast = [
        (-124.40, 42.00), (-124.40, 41.00), (-124.10, 40.45),
        (-123.80, 39.70), (-123.00, 38.30), (-122.50, 38.00),
        (-122.42, 37.77), (-121.90, 36.90), (-121.50, 36.30),
        (-120.90, 35.50), (-120.50, 34.40), (-120.00, 34.50),
        (-119.10, 34.10), (-118.50, 34.00), (-117.50, 33.40),
        (-117.10, 32.50), (-116.10, 32.50), (-114.70, 32.70),
    ]
    CA_east = [
        (-114.70, 32.70), (-114.60, 35.10),
        (-119.30, 38.50), (-120.00, 39.00), (-120.00, 42.00), (-124.40, 42.00),
    ]
    CA = CA_coast + CA_east
    NV = [(-120.00, 42.00), (-114.00, 42.00), (-114.00, 37.50),
          (-114.70, 36.00), (-114.60, 35.10), (-119.30, 38.50),
          (-120.00, 39.00), (-120.00, 42.00)]
    AZ = [(-114.60, 37.00), (-109.05, 37.00), (-109.05, 31.30),
          (-111.00, 31.30), (-114.80, 32.50), (-114.60, 35.10), (-114.60, 37.00)]
    UT = [(-114.05, 42.00), (-111.05, 42.00), (-111.05, 37.00),
          (-114.05, 37.00), (-114.05, 42.00)]
    OR = [(-124.50, 42.00), (-124.50, 46.00), (-116.50, 46.00),
          (-116.50, 42.00), (-124.50, 42.00)]
    for coords, name in [(CA,'California'),(NV,'Nevada'),(AZ,'Arizona'),(UT,'Utah')]:
        clr = HILITE
        poly = Polygon(coords, closed=True, facecolor=clr,
                       edgecolor=BORDER, linewidth=0.5, zorder=1)
        ax.add_patch(poly)
    for coords in [OR]:
        poly = Polygon(coords, closed=True, facecolor=LAND,
                       edgecolor=BORDER, linewidth=0.5, zorder=1)
        ax.add_patch(poly)

# ── Subtle grain overlay (very faint noise for paper texture) ───────────────
rng  = np.random.default_rng(42)
grain_x = rng.uniform(X0, X1, 18000)
grain_y = rng.uniform(Y0, Y1, 18000)
ax.scatter(grain_x, grain_y, s=0.04, c='#7A6040', alpha=0.06, linewidths=0, zorder=2)

# ── Route shadow then route line ────────────────────────────────────────────
rx, ry = catmull_rom(ROUTE_PTS, n_per_seg=100)
ax.plot(rx, ry, color='#00000018', linewidth=4.5, zorder=4,
        solid_capstyle='round', solid_joinstyle='round')
ax.plot(rx, ry, color=ROUTE,     linewidth=2.0, zorder=5,
        solid_capstyle='round', solid_joinstyle='round')

# ── Markers ──────────────────────────────────────────────────────────────────
for m in MARKERS:
    x, y = m['xy']
    if m['type'] == 'se':
        ax.scatter(x, y, s=170, c=GOLD,  zorder=8, linewidths=1.6, edgecolors=WHITE)
        ax.scatter(x, y, s=260, c='none', zorder=7, linewidths=1.6, edgecolors=GOLD)
    else:
        ax.scatter(x, y, s=80,  c=WHITE, zorder=8, linewidths=0)
        ax.scatter(x, y, s=50,  c=ROUTE, zorder=9, linewidths=0)
        ax.scatter(x, y, s=120, c='none', zorder=7, linewidths=1.2, edgecolors=ROUTE)

# ── Labels ───────────────────────────────────────────────────────────────────
for m in MARKERS:
    lx = m['xy'][0] + m['dx']
    ly = m['xy'][1] + m['dy']
    bold = m['type'] == 'se'
    ax.text(lx, ly, m['name'],
            fontsize=8.8 if bold else 7.8,
            color=TEXT,
            ha=m.get('ha', 'center'),
            va='center',
            fontweight='bold' if bold else 'normal',
            fontfamily='serif',
            zorder=10,
            multialignment='center')

# ── State name labels ────────────────────────────────────────────────────────
state_labels = [
    ('California', -121.2, 39.5),
    ('Nevada',     -116.8, 38.5),
    ('Arizona',    -111.5, 34.5),
    ('Utah',       -111.2, 39.2),
    ('Oregon',     -122.0, 41.8),
]
for name, lx, ly in state_labels:
    ax.text(lx, ly, name.upper(), fontsize=5.8, color=MUTED,
            ha='center', va='center', fontfamily='serif',
            alpha=0.75, zorder=3,
            fontweight='normal')

# Route 66 label — italic note along the Arizona stretch
ax.text(-116.2, 35.0, 'Route 66', fontsize=6.5, color=MUTED,
        ha='center', va='center', fontfamily='serif', style='italic',
        alpha=0.85, zorder=3)

# ── Ocean label ───────────────────────────────────────────────────────────────
ax.text(-124.5, 37.5, 'Pacific\nOcean', fontsize=8, color=MUTED,
        ha='center', va='center', fontfamily='serif', style='italic',
        multialignment='center', alpha=0.75, zorder=3)

# ── Title block ───────────────────────────────────────────────────────────────
ax.text(0.5, 0.978, 'California & The American West',
        transform=ax.transAxes, fontsize=17, color=TEXT,
        ha='center', va='top', fontfamily='serif', fontweight='bold')
ax.text(0.5, 0.938, '16 Day Road Journey',
        transform=ax.transAxes, fontsize=9.0, color=MUTED,
        ha='center', va='top', fontfamily='serif', style='italic')

# ── Legend ────────────────────────────────────────────────────────────────────
leg_ax_x = 0.045
leg_ax_y = 0.22

items = [
    ('se',    GOLD,  'Start / End'),
    ('stop',  ROUTE, 'Route stop'),
    ('line',  ROUTE, 'Journey route'),
]
for i, (kind, clr, label) in enumerate(items):
    xd, yd = axes_to_data(ax, leg_ax_x, leg_ax_y - i * 0.072)
    if kind == 'se':
        ax.scatter(xd, yd, s=100, c=clr,   zorder=10, linewidths=1.3, edgecolors=WHITE)
        ax.scatter(xd, yd, s=155, c='none', zorder=9,  linewidths=1.3, edgecolors=clr)
    elif kind == 'stop':
        ax.scatter(xd, yd, s=55,  c=clr,   zorder=10, linewidths=1.0, edgecolors=WHITE)
        ax.scatter(xd, yd, s=95,  c='none', zorder=9,  linewidths=1.0, edgecolors=clr)
    else:
        x1d, _ = axes_to_data(ax, leg_ax_x - 0.014, leg_ax_y - i * 0.072)
        x2d, _ = axes_to_data(ax, leg_ax_x + 0.020, leg_ax_y - i * 0.072)
        ax.plot([x1d, x2d], [yd, yd], color=clr, linewidth=1.6, zorder=10)
        xd, yd = axes_to_data(ax, leg_ax_x + 0.038, leg_ax_y - i * 0.072)
        ax.text(xd, yd, label, fontsize=7.0, color=TEXT, va='center', fontfamily='serif')
        continue
    xtxt, ytxt = axes_to_data(ax, leg_ax_x + 0.038, leg_ax_y - i * 0.072)
    ax.text(xtxt, ytxt, label, fontsize=7.0, color=TEXT, va='center', fontfamily='serif')

# ── Watermark ─────────────────────────────────────────────────────────────────
ax.text(0.968, 0.026, 'HiddenAtlas',
        transform=ax.transAxes, fontsize=6.2, color=MUTED,
        ha='right', va='bottom', fontfamily='serif', style='italic')

# ── Save ──────────────────────────────────────────────────────────────────────
plt.tight_layout(pad=0.15)
out_path = os.path.join(OUT_DIR, 'route-map.png')
plt.savefig(out_path, dpi=150, bbox_inches='tight', facecolor=BG, edgecolor='none')
sz = os.path.getsize(out_path) / 1024
print(f"\nSaved:  {out_path}")
print(f"Size:   {sz:.0f} KB")
plt.close()
print("Done.")
