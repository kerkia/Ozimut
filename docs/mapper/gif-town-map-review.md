# Gif-sur-Yvette's generated sprint map: every remark since the first review, and where each stands

This report covers the town map of Gif-sur-Yvette (ISSprOM 2019-2, 1:4000) made by `tools/virtually/town_map.py` from open
data: IGN's LiDAR HD, BD TOPO and BD ORTHO, the cadastre and OpenStreetMap. The same generator serves Pixel's race « Gif-sur-Yvette »
and Cartographier's « Plan de ville (sprint) », so every rule below reaches both.

It lists, round by round, every remark made on the map by the owner and by the mapper who reviewed it (Alec, a course setter and
mapper), from the first review on 12 November 2026 to the latest on 19 November. For each remark it says what was wrong, what
changed, and where it stands on **v27**, the latest version (19 November 2026).

The test numbers refer to `tools/virtually/test_remarks.py`: one test per remark, run on every new version. Tests 1-31 come from
the remarks of 12-13 November, tests 32-35 check four known places in Gif (the Chemin du Bras Mort's underpass, the station's
tunnel, the town hall lawns, the long stairway), and tests 36-37 from the remarks of
19 November.

## Where the map stands (v27, 19 November 2026)

- **Tests:** 26 pass, 9 fail, 2 cannot be tested from the map's objects (11 and 30).
- **What fails:** mostly what the legibility check used to repair before 18 November and the generator does not yet do itself:
  slivers, enclosed pieces of ground, trees touching, objects inside olive. Details under « What is left ».
- **OpenStreetMap kept:** 99.0 % of the length of OSM's ways in the area (44 km) is drawn with a fitting symbol (91 % on v24).
- **Curves:** every curve now stays within 0.3 m of its own straight segments on man-made features and 1 m on natural ones. On v24
  they strayed up to 5 m on paving, 8 m on olive and 14 m on open land.
- **The legibility check:** it now only reports (since 18 November). Its report on v27 counts 4 133 errors and 164 warnings,
  most of them slivers under 1 m along the photograph's areas.
- **Online:** v24 is the live race. v27 is built and goes online next.

The PDFs of every version reviewed are in the sessions' notes folder (v2-v7, v12, v16, v22, v23, v24, v27).

## Round 1: the owner, 11 November (first race)

The first race was a 600 × 600 m square between the RER station and the church, drawn from LiDAR and OpenStreetMap
(« as realistic as possible »).

| Remark | What changed | v27 |
|---|---|---|
| Show the rugby, football and tennis grounds and the track | Sports grounds read from OSM (else BD TOPO) and drawn: grass pitches open land 401, hard courts paved 501, goals and rugby posts | Kept |
| Courts and track lanes not crossable; the posts shown | Tennis courts fenced; the track first under 709 (reversed in round 3, see below) | Kept as revised |
| A larger area | The race enlarged on 12 November to 1 320 × 1 040 m, the area the owner drew round the sports grounds, Le Clos, the station and l'Abbaye | — |

## Round 2: the mapper's first review, 12 November (v1-v3)

| Remark | What changed | v27 |
|---|---|---|
| A paved area in town nearly always has a definite edge; the strip beside a street is a sidewalk | The public road space (what the cadastre leaves between parcels) drawn as paving to the property line | Test 9 ok |
| Smooth the areas' edges | The areas made one coverage simplified together (no gap, no overlap) | Superseded in round 7: the photograph's classes are now generalised before they become areas |
| No 402 ring round a wood | A wood of 400 m² or more is forest; trees outside it are points 417/418 | Test 10 fails on 24 trees drawn over each other |
| Contours must not end in the open | Contours smoothed, rounded, kept whole or dropped, cut exactly at buildings | Test 16 ok |
| The paved area needs its edge, and through roads heavy traffic | 501.1 edge where paving meets anything but a building, wall, fence or hedge; kerbs along carriageways; BD TOPO's main roads as 501.4 | Test 1 fails on 3 stretches without an edge and 11 spikes |
| Paths and stairways from both sources (« what one source has exists ») | BD TOPO's kept wherever OSM has none of the same kind within 4 m | Test 17 ok |
| Stairways at their width | 532.1-532.6 at the width on the ground | Test 19 fails on 2 stairways not on paving |
| Every tennis court fenced | 518 round each court | Test 28 ok |
| Mark the boundary of private ground where no wall or fence is known | Helper 995 « boundary to confirm » | Kept; never printed |
| Keep every OSM way available to the mapper | OSM ways and tagged nodes on hidden helper symbols 990/991 | Kept; never printed |
| Buildings that touch: no line between them | Drawn as one | Test 12 ok |
| Inside ground not to be entered, generalise | No sheds under 20 m², hedges, walls, fences, paths or lone trees inside olive | Test 13 fails on 5 objects |
| Polylines must become curves, as OOM does | Lines and outlines drawn as Bézier curves | Test 14 ok; see round 8 for the curves' distortion |
| A grass pitch's edge | 415 | Test 21 ok |
| Bridges and tunnels need to be shown | Decks from OSM and BD TOPO; 512.1 at mouths, 512.2 along passages; water cut under decks | See round 4 |
| You ignored the wetland | OSM's wetland as 308 marsh; OSM's water areas join BD TOPO's | Test 31 ok |

## Round 3: the mapper's third review, 12 November (v4-v5)

| Remark | What changed | v27 |
|---|---|---|
| 512.1 only at a passage's mouth, two triangles at least | Done | Test 22 ok |
| A bridge one cannot pass beneath: its sides as 515 | Done, and no 515 where a passage comes out | Test 23 ok |
| 512.2 along every passage, 512.3 over what is run on at both levels | Done | Tests 24 and 25; 24 fails on 4 pieces of 512.2 along another black line |
| A passage through a building is no tunnel | Cut out of the building as a canopy 522 | Test 26 ok |
| The railway track by track | The RER's two tracks from OSM | Test 20 ok |
| Paved footways and stairways belong to the paved area | One paving with one edge; no crossed edges at junctions | Test 2 ok |
| Unpaved paths not drawn on paving | Done | Test 17 ok |
| The track is obviously a paved area | Track runnable, 501 with its 501.1 edges, no 709 | Test 28 ok |
| Olive only for houses' gardens | A parcel with a block of flats (3 dwellings or more) or shops is open | Test 5 ok |
| No sliver | Parts of an area under 1 m go to the neighbour sharing the longest edge | Test 4 fails (see « What is left ») |
| A footbridge makes no passage of a way not tagged beneath it | Done | Test 27 ok |

## Round 4: the owner's review of 13 November (v6), from ISSprOM's text

| Remark | What changed | v27 |
|---|---|---|
| Contours run through buildings | Brown is printed over the buildings' black 50 % | Test 16 ok |
| Contours square across the streets, cut at stairways | Done | Test 16 ok |
| Ground enclosed by uncrossable features is 520, or part of the building | Done | Test 6 fails on 5 pieces |
| Ground reached only through 520 is 520 | Done | Test 7 fails on 48 objects inside olive |
| Trees closer than their symbols allow | Two keep the larger; three or more become an area | Test 10 fails (as above) |
| One stream where OSM and BD TOPO draw two | OSM's stretches only where BD TOPO has none within 12 m | Test 18 ok |
| Patterns must not fall on corners | OCAD corner points at every angle of 30° or more | Test 15 ok |
| 505's junctions | Each path's edges left out inside the other's band | Test 3 ok |
| 512.3's stripes | About 45° to the passage's axis, in a white of their own over every colour | Test 25 ok |
| 512.2 too short | Only from 2.8 m, 0.2 mm short of each end | Test 24 (as above) |
| No 709 on any sports ground (it is the setter's overprint) | Done | Test 28 ok |
| A footbridge's two 515 sides made one black bar | A bridge at least 0.8 mm wide, its sides 0.4 mm apart | Test 23 ok |
| OSM's lawns, also inside a paved square | 401 | Tests 8 and 34 ok |
| A pond half curved, half angular | One tangent per point, set by the most natural object through it | Superseded in round 8 (water stays curved, man-made angles kept) |

## Round 5: after playing v6 in the game, 14 November

| Remark | What changed | v27 |
|---|---|---|
| The stream is cut under the bridge (« OpenStreetMap is right here, there is no discontinuity ») | A watercourse runs on under a bridge, cut only along a culvert or tunnel | Kept |
| The tunnel 3-4 is not accessible | The railway's stroke opened at passages' mouths; a passage ending inside a building drawn on until it comes out | Kept (test 33, the station's tunnel, ok) |
| Non-trivial route choices; controls hard to take; controls close only when consecutive | The sprint course setter rewritten (`course_sprint.py`) | Courses set again for each version |
| Ghosts from every runner of the map | Done by the Pixel page session | — |

## Round 6: legibility, 15-17 November (v12-v22)

The owner asked for every ISSprOM rule to be checked, a gate before publishing, and a test for every remark. The check
(`legibility.py`) first reported, then repaired what it found: gaps under 0.4 mm, white slivers, narrow strips, enclosed
ground, short lines.

| Remark | What changed | v27 |
|---|---|---|
| Widen the entrances just enough (a courtyard shut off by a 1.2 m gap) | The widest gap widened to 0.4 mm instead of closed | Repairs no longer run by default (round 7) |
| Fix what the check reports (v16: 148 errors, 194 warnings) | The check repaired every rule it reported; v22 reached 1 error, 3 warnings | Repairs no longer run by default (round 7) |

## Round 7: the owner's review of v22, 17-18 November

« Not seeing much improvement; some things got worse. » Comparing v22 with the generator's map without repairs showed that most of
what got worse came from the check's repairs. The owner also said the checks should be « extensive unit tests » for the developer,
not something users run.

| Remark | Cause | What changed | v27 |
|---|---|---|---|
| Sports grounds as ellipses | Open land had no corners | A sports ground's outline keeps its corners | Test 14 ok |
| The track's edge (« is a straight line that hard? ») | The lanes followed OSM's hand-traced oval | Fitted as a stadium (two straights, two half circles), the infield cut to the lanes | Small kinks remain along the lanes |
| The bridge on the main street | It was the track's west side, not a bridge (found by matching the screenshot) | Same fix as the track | — |
| The island turned olive, its statue gone, and « what is the diamond? » | A repair; and the enclosure rules took water for a fence | Ground water bounds for 60 % is no olive | Island open land again, statue back |
| Junctions still wrong (a fork of two paths) | Both edges dropped where the centre line lay in the other band | Each edge dropped on its own | Test 3 ok |
| Worse on the 4th screenshot (a paved footway meeting a path) | The paving's edge turned round the path's end | The edge stops under an unpaved path's band | Kept |
| Narrow paved areas that are not paths | A repair widened strips into paving (2 450 m², a hedge eaten) | Repairs off | Gone |
| Tunnel edges not dashed | A repair cut 512.2 inside the railway's olive | Repairs off; 512.1-512.3 kept inside olive | Back |
| White in the olive | A repair (the white wedges in the fenced tennis court) | Repairs off | Gone |
| A fence on a building | Two sources drew the same line | A wall or fence along a building's outline is left out | Kept |
| IOF: « the upper railway line should always be cut over underpasses » | — | The tracks are cut over every underpass | Kept |
| The checks are for the developer | — | `town_map.py` reports only; it repairs with `--fix`; Cartographier never runs the report, and offers the repairs as an unticked option | Kept |

The photograph's areas were also generalised over 1.5 m before becoming areas, so they meander less.

## Round 8: pictures 22 and 23, 19 November (v24)

« The track seems cut by water and a wall », « tracks get reduced to a line », and « a lot of information that is clean in OSM
becomes wrongly distorted… at a minimum, OSM information needs to be preserved, even if drawn with IOF symbols. »

Two measures were made and are now tests:
- **Test 36** compares every Bézier segment with the straight line between its two points.
- **Test 37** checks every OSM highway, barrier and watercourse against the map's symbols for its kind.

| Remark | Cause | What changed | v27 |
|---|---|---|---|
| Picture 22: at the Yvette's footbridge, the path cut by water and a wall | The water's curve, cut square at the deck, bulged back onto it; the bridge's sides crossed the track joining it | Points where an area is cut are corners; a bridge's sides stop at the ways joining it | The path crosses unbroken |
| Picture 23: a 3 m compacted track drawn as a thin path | Compacted and fine-gravel surfaces were treated as unpaved | Firm surfaces are paving at their width (ISSprOM 501: « hard gravel »), as are OSM's grade-1 tracks | A 3 m paved band |
| Clean OSM lines distorted | Curves bowed up to 5 m on paving, 8 m on olive and 14 m on open land; a man-made corner shared with a lawn was rounded | A curve keeps within 0.3 m of its segments on man-made features (1 m on natural ones); a man-made angle is a corner in every object through it (water apart) | Test 36 ok |
| OSM information lost | Public paved footways under olive; streets BD TOPO lacks; BD TOPO's intermittent basin over OSM's grassland, cutting a cycle path; two pavings a hairline apart drawing crossed edges | A corridor through olive for every public footway; OSM's streets BD TOPO lacks drawn; intermittent water left out; paving closed by 5 cm | 99.0 % shown (test 37; stairways 94.9 %) |

The analysis of this round is in the sessions' notes, `osm-distortion-2026-11-19.md`.

## What is left on v27

Most of these are the repairs the check used to make, still to be moved into the generator's own steps:

- **Test 1:** 3 stretches of paved edge without 501.1, and 11 spikes (angles under 10°) in the paving.
- **Test 4:** 2 087 slivers under 1 m, along the edges of the photograph's areas.
- **Tests 6 and 7:** 5 pieces of ground no way reaches, and 48 objects inside olive.
- **Test 10:** 24 trees drawn over each other.
- **Test 13:** 5 objects inside olive that generalisation should drop.
- **Test 19:** 2 stairways not standing on paving.
- **Test 24:** 4 pieces of 512.2 along another black line.
- **Test 37:** OSM's stairways 94.9 % shown (target 95 %): garden stairs inside olive, a few under buildings.
- **The track:** small kinks along the lanes' edges.
- **Cartographier:** whether to hide its « Corriger la lisibilité » option until the repairs live in the generator is the owner's
  call.

Not testable from the map's objects: test 11 (bare ground beside sports grounds, a rule on the photograph's classes) and test 30
(helpers never printed, a property of the exports).

## How to check a new version

1. `py town_map.py gif` (generator and the check's report; `--no-check` skips the report).
2. `py test_remarks.py gif`: every remark's test, with the first places of each failure in Lambert 93.
3. `py town_all.py gif --courses --from ocd`, then `node thumb.mjs gif` and `py upload.py gif --remote --accept-violations`
   (`--accept-violations` while the report still has errors).
