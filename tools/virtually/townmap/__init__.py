"""The sprint town map generator (ISSprOM 2019-2, 1:4000) from open data, in stages:

  sources   OpenStreetMap, IGN BD TOPO and the cadastre read into feature lists (tagmap.py says what each OSM tag becomes)
  terrain   the LiDAR's grids and the photograph's vegetation index
  areas     one partition of the ground: every point belongs to exactly one face, each face to one class; generalised on the
            faces' graph (minimum sizes, gaps between uncrossable features, ground no way reaches)
  lines     walls, fences, paths, stairways, bridges and passages, the paved area's edge
  contours  from the ground flattened across the streets
  points    trees, monuments, the hidden OpenStreetMap helpers
  export    map_objects.json: man-made outlines as polylines, natural ones as curves

  py town_map.py <race> [--clip] [--no-check] [--fresh] [--from <stage>]

Each stage's result is kept in DATA/<race>/src/stage/, so a later stage can be run again alone."""
