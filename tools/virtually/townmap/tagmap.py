"""What each OpenStreetMap tag becomes on the map — the one place that says it (the owner, 2026-11-19: « OSM information needs
to be preserved, even if drawn with IOF symbols »; 2026-11-22: « all details from OSM well represented, unless truly irrelevant
for orienteering »).

`kinds(element)` gives the kinds an element is read as; a tag of a feature key that the table does not know is collected by
`unknown()`, written to src/osm_unknown.json and counted by the metrics: a new kind of object in a town is seen, not lost.

A kind → what sources.py makes of it (the symbol comes later, from the ground's class or the line's height):
  way        a path, track, footway, service road…: paved at its width or an unpaved path, by its surface
  street     a street: paved where BD TOPO has no carriageway
  steps      a stairway
  paved      a paved area (square, parking, platform, schoolyard)
  lawn       open land (grass, village green, meadow, park lawns)
  wood       forest; scrub: slow vegetation by the LiDAR's height
  water, wetland, stream, ditch
  wall, fence, hedge; gate: an opening in them
  pitch, track_sport  a sports ground
  building, canopy
  rail
  tree, tree_row, monument, fountain, mast
  private    ground not to be entered (with access=private|no)
  zone       an area that only names a place (a park, a school, a residential block): its parts are mapped by their own objects
"""

IGN = None                                                 # ignored: not an orienteering feature (see the group's reason)

# reasons for ignoring, by group — kept with the table so that a reviewer sees why something is not on the map
WHY = {
    "furniture": "street furniture: too small and too many for a sprint map (a bench, a bin, a lamp, a bollard, a sign)",
    "service": "what a place is used for (a shop, a bank, a restaurant), not a thing on the ground",
    "traffic": "a road's regulation (a crossing, a stop, signals), not a feature",
    "indoor": "inside a building or underground",
    "gone": "no longer there",
}

T = {
    "highway": {
        **{v: "way" for v in ("footway", "path", "cycleway", "bridleway", "track", "pedestrian", "service", "living_street", "corridor")},
        "steps": "steps",
        **{v: "street" for v in ("motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
                                 "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link", "road", "busway")},
        "platform": "paved", "rest_area": "paved", "services": "zone",
        **{v: ("traffic", IGN) for v in ("crossing", "give_way", "stop", "traffic_signals", "turning_circle", "turning_loop",
                                         "mini_roundabout", "motorway_junction", "speed_camera", "traffic_mirror", "passing_place",
                                         "priority", "milestone")},
        **{v: ("furniture", IGN) for v in ("street_lamp", "bus_stop", "elevator", "emergency_access_point")},
        **{v: ("gone", IGN) for v in ("construction", "proposed", "abandoned", "razed")},
    },
    "area:highway": {"*": "paved"},
    "building": {"roof": "canopy", "carport": "canopy", "no": ("gone", IGN), "*": "building"},
    "building:part": {"*": ("indoor", IGN)},               # a building's parts: the building itself is read
    "barrier": {
        "wall": "wall", "city_wall": "wall", "retaining_wall": "wall",
        "fence": "fence", "guard_rail": "fence", "handrail": "fence",
        "hedge": "hedge",
        **{v: "gate" for v in ("gate", "entrance", "lift_gate", "swing_gate", "sliding_gate", "kissing_gate", "turnstile", "stile",
                               "bollard", "cycle_barrier", "block", "chain", "motorcycle_barrier", "bus_trap", "height_restrictor")},
        "kerb": ("furniture", IGN), "jersey_barrier": "fence", "*": ("furniture", IGN),
    },
    "landuse": {
        "grass": "lawn", "village_green": "lawn", "meadow": "lawn", "recreation_ground": "lawn",
        "forest": "wood",
        **{v: "zone" for v in ("residential", "commercial", "retail", "industrial", "railway", "education", "religious", "cemetery",
                               "allotments", "farmland", "farmyard", "orchard", "construction", "brownfield", "garages",
                               "military", "institutional", "civic_admin", "plant_nursery", "vineyard", "greenhouse_horticulture")},
        "basin": "zone", "reservoir": "water",
    },
    "leisure": {
        "pitch": "pitch", "track": "track_sport",
        "park": "zone", "garden": "zone", "playground": "zone", "sports_centre": "zone", "stadium": "zone", "common": "lawn",
        "swimming_pool": "pool", "schoolyard": "paved",
        "dog_park": "zone", "nature_reserve": "zone", "golf_course": "zone", "fitness_station": "zone", "picnic_table": ("furniture", IGN),
        "outdoor_seating": ("furniture", IGN), "bleachers": "zone", "marina": "zone", "slipway": "paved", "*": "zone",
    },
    "natural": {
        "water": "water", "wetland": "wetland", "wood": "wood", "scrub": "scrub", "heath": "scrub",
        "grassland": "lawn", "tree": "tree", "tree_row": "tree_row",
        "bare_rock": "zone", "sand": "zone", "scree": "zone", "shingle": "zone", "beach": "zone", "cliff": "zone",
        "spring": "fountain", "shrubbery": "scrub", "*": "zone",
    },
    "amenity": {
        "parking": "paved", "marketplace": "paved", "parking_space": "paved", "bicycle_parking": "cover?", "shelter": "canopy",
        "fountain": "fountain", "drinking_water": "fountain",
        "school": "zone", "kindergarten": "zone", "college": "zone", "university": "zone",
        **{v: ("furniture", IGN) for v in ("bench", "waste_basket", "recycling", "post_box", "vending_machine", "clock", "atm",
                                           "charging_station", "public_bookcase", "photo_booth", "motorcycle_parking", "telephone",
                                           "bicycle_repair_station", "waste_disposal", "parking_entrance", "bbq", "lounger",
                                           "letter_box", "parcel_locker", "toilets", "shower", "water_point", "taxi")},
        "*": ("service", IGN),
    },
    "man_made": {
        "cross": "monument", "water_well": "fountain", "water_tap": "fountain",
        "mast": "mast", "tower": "mast", "chimney": "mast", "flagpole": "mast", "communications_tower": "mast",
        "pier": "paved", "bridge": ("indoor", IGN), "tunnel": ("indoor", IGN), "embankment": "zone", "cutline": "zone",
        "*": ("furniture", IGN),
    },
    "waterway": {"river": "stream", "stream": "stream", "canal": "stream", "ditch": "ditch", "drain": "ditch",
                 "weir": ("furniture", IGN), "dam": "wall", "lock_gate": ("furniture", IGN), "*": ("furniture", IGN)},
    "railway": {**{v: "rail" for v in ("rail", "light_rail", "tram", "narrow_gauge", "subway")},
                "platform": "paved", "abandoned": ("gone", IGN), "disused": ("gone", IGN), "razed": ("gone", IGN),
                "*": ("furniture", IGN)},
    "public_transport": {"platform": "paved", "*": ("traffic", IGN)},
    "tourism": {"artwork": "monument", "*": ("service", IGN)},
    "historic": {"memorial": "monument", "monument": "monument", "wayside_cross": "monument", "wayside_shrine": "monument",
                 "*": "zone"},
    "place": {"square": "paved", "*": "zone"},
    "power": {"tower": "mast", "pole": ("furniture", IGN), "*": ("furniture", IGN)},
}
FEATURE_KEYS = tuple(T)
_unknown = {}


def kinds(e):
    """The kinds an OSM element is read as (a set; empty: nothing of it goes on the map)."""
    t = e.get("tags") or {}
    out = set()
    for k in FEATURE_KEYS:
        v = t.get(k)
        if v is None:
            continue
        tab = T[k]
        hit = tab.get(v, tab.get(v.split(";")[0], tab.get("*", "?")))
        if hit == "?":
            _unknown[(k, v)] = _unknown.get((k, v), 0) + 1
        elif isinstance(hit, tuple) or hit is None:
            continue
        else:
            out.add(hit)
    # a node is a point feature only; a way or relation of a point kind (a fountain's basin) keeps it
    if e["type"] == "node":
        out &= {"tree", "monument", "fountain", "mast", "gate"}
    if "cover?" in out:                                    # a bicycle parking is a canopy only when covered
        out.discard("cover?")
        if t.get("covered") == "yes" and e["type"] != "node":
            out.add("canopy")
    if t.get("covered") == "yes" and e["type"] == "way" and t.get("highway") is None and t.get("building") is None \
            and len(e.get("geometry") or []) >= 4 and e["geometry"][0] == e["geometry"][-1]:
        out.add("canopy")
    if t.get("indoor") == "yes" or t.get("location") in ("underground", "indoor"):
        return set()
    return out


def unknown():
    """{"key=value": count} of the feature tags met that the table does not know."""
    return {f"{k}={v}": n for (k, v), n in sorted(_unknown.items(), key=lambda x: -x[1])}
