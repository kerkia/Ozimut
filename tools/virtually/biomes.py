"""Pixel's biomes by place (games/vworld.js's race.json « biome »: ground colours by class, trees, rocks, sky, and the texture set
of games/vforest.js TEXTURE_SETS). lidarrace.py writes the place's biome when the race has no biome.json of its own.

FONTAINEBLEAU (owner, 2026-11-13, Trois Pignons: « photos, like for Sprint, to much improve the scene textures »): the colours
read on freely licensed photographs of the Trois Pignons on Wikimedia Commons (CC BY-SA / CC BY / CC0; only their colours are
used, nothing of them is kept or published — the medians of the forest floor under the pines, the white sand of the paths and
the open sand, the grey sandstone boulders, the Scots pines' bark; the bracken in autumn's browns), a little darker than the sunlit photos (the
game lights them).
"""

TEMPERATE = {"conifer": 0.3, "leaf": ["#56763a", "#61803f", "#4d6c35", "#6a8a46"], "coniferLeaf": ["#34552f", "#3d5f35"],
             "bush": ["#4f6d34", "#5a7a3a"], "low": ["#6f8045", "#7d8a4c", "#8a7a48"], "trunk": "#6b625a", "trunk2": "#5a5048",
             "rock": ["#a29a8c", "#958e82", "#b0a898"], "fog": "#cdd6d8"}

FONTAINEBLEAU = {
    "name": "Fontainebleau: Scots pine, oak and birch on sand and sandstone", "textures": "sandpine",
    "conifer": 0.6, "pineShare": 0.95, "pineMinH": 7,
    "ground": {"forest": [138, 120, 94], "open": [184, 172, 140], "open_t": [176, 164, 132], "rough": [126, 106, 84],
               "rough_t": [132, 114, 90], "slow": [104, 96, 70], "slow_vis": [110, 102, 74], "walk": [90, 88, 62],
               "walk_vis": [96, 94, 66], "fight": [78, 80, 56], "path": [206, 198, 184], "track": [200, 192, 178],
               "small_path": [186, 176, 156], "rock": [144, 142, 138], "cliff": [138, 136, 132], "rockstep": [140, 138, 134],
               "bfield": [150, 146, 140], "stony": [160, 154, 142]},
    "leaf": ["#5d7438", "#66803e", "#576e36", "#7a9148"], "leafDry": 0.12,
    "coniferLeaf": ["#3e5a3a", "#47613e", "#3a5636"],
    "trunk": "#8e8a82", "trunk2": "#6a6058", "trunkPine": "#8a6450",
    "bush": ["#4d6634", "#566e3a"], "low": ["#6f7a44", "#7a7c48", "#86784a", "#8a7448"],
    "rock": ["#9c9b98", "#a8a6a0", "#929089", "#b2aea4"], "fog": "#d6d9d6",
}

# the massif of Fontainebleau and its sandstone neighbours (Trois Pignons, Larchant, the Essonne's rocks)
PLACES = [((48.20, 2.30, 48.52, 2.85), FONTAINEBLEAU)]


def sandstone(lat, lon):
    """Whether a place's rock is a sandstone chaos (Fontainebleau's): lidarrace.py makes its cliffs boulders and outcrops there,
    elsewhere cliff lines (2026-11-14)."""
    return any(s <= lat <= n and w <= lon <= e for (s, w, n, e), b in PLACES if b is FONTAINEBLEAU)


def for_place(lat, lon):
    """The biome of a place: Fontainebleau's sandstone forests, else a temperate European forest."""
    for (s, w, n, e), b in PLACES:
        if s <= lat <= n and w <= lon <= e:
            return dict(b)
    return dict(TEMPERATE)
