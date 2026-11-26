# Third-party notices

The Ozimut repository is published under its own licence (see `LICENSE`). The components listed here are not
covered by it: each keeps its own licence and copyright, as stated below. Where the full licence text is already in
the repository, its path is given instead of a copy. Items marked « to check » are those whose licence or copyright
notice could not be found in the repository. Every vendored package's licence files are fetched by
`python tools/vendor.py licences` (from its npm package, else from its own repository at the published commit).

Contents:

1. Libraries served by the site (`site/assets/vendor/`)
2. Code ported or converted from other projects
3. Fonts, icons, textures and photos
4. Geographic data committed in the repository
5. Tools and programs not distributed here
6. Data sources credited by the site

---

## 1. Libraries served by the site

Built from the npm registry by `tools/vendor.py` (which lists every package, its pinned version and the files kept)
into `site/assets/vendor/<name>@<version>/`. Only the files listed there are in the repository.

| Component | Where | Copyright (as stated) | Licence | Upstream | Licence text |
|---|---|---|---|---|---|
| Apache ECharts 5.5.1 | `site/assets/vendor/echarts@5.5.1/` | « Apache ECharts — Copyright 2017-2024 The Apache Software Foundation » (NOTICE) | Apache-2.0 | https://echarts.apache.org/ | `site/assets/vendor/echarts@5.5.1/LICENSE`, `NOTICE` |
| PDF.js (pdfjs-dist) 4.10.38 | `site/assets/vendor/pdfjs-dist@4.10.38/` | « Copyright 2024 Mozilla Foundation » (file header) | Apache-2.0 | https://github.com/mozilla/pdf.js | `site/assets/vendor/pdfjs-dist@4.10.38/LICENSE` |
| pdf-lib 1.17.1 | `site/assets/vendor/pdf-lib@1.17.1/` | « Copyright (c) 2019 Andrew Dillon » | MIT | https://github.com/Hopding/pdf-lib | `site/assets/vendor/pdf-lib@1.17.1/LICENSE` |
| @pdf-lib/fontkit 1.1.1 | `site/assets/vendor/pdf-lib-fontkit@1.1.1/` | « Copyright (c) 2014-present Devon Govett » (fontkit, of which Andrew Dillon's @pdf-lib/fontkit is a fork) | MIT | https://github.com/Hopding/fontkit | `site/assets/vendor/pdf-lib-fontkit@1.1.1/LICENSE` (the fork ships none: fontkit's own, foliojs/fontkit) |
| fflate 0.8.2 | `site/assets/vendor/fflate@0.8.2/` | « Copyright (c) 2023 Arjun Barrett » | MIT | https://github.com/101arrowz/fflate | `site/assets/vendor/fflate@0.8.2/LICENSE` |
| Proj4js 2.12.1 | `site/assets/vendor/proj4@2.12.1/` | « Copyright (c) 2014, Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf » | MIT | https://github.com/proj4js/proj4js | `site/assets/vendor/proj4@2.12.1/LICENSE`, `AUTHORS` |
| DuckDB-WASM 1.32.0 (browser module bundled with Apache Arrow 17.0.0 by esbuild 0.24.0; DuckDB compiled into its WebAssembly) | `site/assets/vendor/duckdb-wasm@1.32.0/` | DuckDB-WASM and DuckDB: « Copyright 2018-2025 Stichting DuckDB Foundation »; Apache Arrow: « Copyright 2016-2024 The Apache Software Foundation » (its NOTICE lists the projects Arrow includes) | DuckDB-WASM, DuckDB: MIT; Apache Arrow: Apache-2.0 | https://github.com/duckdb/duckdb-wasm, https://github.com/duckdb/duckdb, https://github.com/apache/arrow | `site/assets/vendor/duckdb-wasm@1.32.0/LICENSE`, `LICENSE-duckdb`, `LICENSE-apache-arrow`, `NOTICE-apache-arrow` |
| three.js 0.185.1 | `site/assets/vendor/three@0.185.1/` | « Copyright © 2010-2026 three.js authors » | MIT | https://threejs.org/ | `site/assets/vendor/three@0.185.1/LICENSE` |
| qrcode-generator 2.0.4 | `site/assets/vendor/qrcode-generator@2.0.4/` | « Copyright (c) 2009 Kazuhiko Arase » | MIT | https://github.com/kazuhikoarase/qrcode-generator | `site/assets/vendor/qrcode-generator@2.0.4/LICENSE` (also in the head of `dist/qrcode.mjs`) |
| polygon-clipping 0.15.7 | `site/assets/vendor/polygon-clipping@0.15.7/` | « Copyright (c) 2018 Mike Fogel » ; « Copyright (c) 2016 Alexander Milevski » (portions from w8r/martinez) | MIT | https://github.com/mfogel/polygon-clipping | `site/assets/vendor/polygon-clipping@0.15.7/LICENSE` (and `LICENSE.md`, identical) |
| geotiff.js 2.1.3 | `site/assets/vendor/geotiff@2.1.3/` | « Copyright (c) 2015 EOX IT Services GmbH »; the bundle also contains LERC, « Copyright 2015-2021 Esri », Apache-2.0 | MIT (LERC part: Apache-2.0) | https://github.com/geotiffjs/geotiff.js | `site/assets/vendor/geotiff@2.1.3/LICENSE` |

Notes on bundled sub-components:

- ECharts' LICENSE names sub-components under BSD-3-Clause (d3.js, « Copyright 2010-2016 Mike Bostock »): their licence is
  `site/assets/vendor/echarts@5.5.1/licenses/LICENSE-d3`.
- pdf-lib's bundle contains tslib (« Copyright (c) Microsoft Corporation », header kept in the minified file).

## 2. Code ported or converted from other projects

### Purple Pen (course setting: the Tracer, the map renderer, map-file reading and writing)

- Copyright: « Copyright (c) 2006-2007, Peter Golde » (licence file); several ported files say « Copyright (c) 2006-2008
  Peter Golde ».
- Licence: BSD-3-Clause.
- Upstream: https://purplepen.golde.org/ — https://github.com/petergolde/PurplePen
- Licence text: `site/assets/tracer/LICENSE-PurplePen.txt`.
- What in this repository comes from it:
  - `site/assets/tracer/symbols.json` and `site/assets/tracer/symbol-texts.json`: the control description symbols and
    their texts in 23 languages, converted from Purple Pen's `symbols.xml` by `docs/tracer/symbols.py`;
  - `site/assets/tracer/crs.json`: the OCAD grid ids from Purple Pen's `MapProjection.cs` (the EPSG part is common
    reference data);
  - ports of Purple Pen's algorithms and file handling in `site/assets/js/tracer/` (`model.js`, `ppen.js`, `layout.js`,
    `draw.js`, `descr.js`, `textify.js`, `relay.js`, `appear.js`, `coursefiles.js`, `exports.js`, `symbols.js`) and
    `site/assets/js/tracer/vmap/` (`ocad.js`, `oom.js`, `map.js`, `symdefs.js`, `sympath.js`, `geom.js`, `ocadwrite.js`,
    `oomwrite.js`);
  - `site/assets/js/mapper/fromomap.js` and `toomap.js`, which build on the ports of Purple Pen's OpenMapperImport and
    OpenMapperExport.
- `site/assets/js/tracer/relay.js` also re-implements .NET's `System.Random` (Knuth's subtractive generator) to draw the
  same relay teams as Purple Pen; its provenance is not stated beyond that comment: to check (the .NET runtime is MIT).

### SPORTident libraries (Chronoz's card reading)

Ported into Chronoz (`site/assets/js/chrono/si/`, a copy of its repository, where the tests are). Licence: MIT. Licence text and
the detail of what was ported from each: `site/assets/js/chrono/si/LICENSE-sportident.txt`.

- sportident.js — « Copyright (c) 2018 Simon Hatt » — https://github.com/allestuetsmerweh/sportident.js
- lool-ing/sportident — « Copyright (c) 2026 Jonas Hagberg and the LooL contributors » — https://github.com/lool-ing/sportident
- GecoSI — « Copyright (c) 2013 Simon Denier » — https://github.com/sdenier/GecoSI

### Chronoz

`site/assets/js/chrono/`: Chronoz, © Yann Le Helloco, Mozilla Public License 2.0, a copy of
https://github.com/kerkia/Chronoz, with its own notices. (The SPORTident ports above are part of it.)

### Project Nayuki's QR Code generator (Folloz's QR codes on the iPhone and the Apple Watch)

- Copyright: « Copyright (c) Project Nayuki. »
- Licence: MIT.
- Upstream: https://www.nayuki.io/page/qr-code-generator-library — https://github.com/nayuki/QR-Code-generator
- Licence text: in the head of `track/ios/Shared/Core/QRCode.swift`.
- What in this repository comes from it: `track/ios/Shared/Core/QRCode.swift`, its encoder ported to Swift and reduced to
  byte mode and error correction level M (watchOS has no QR code generator of its own); the mask penalty is written from
  the standard's rules.

### Ozimut's own ports of Ozimut's code

`site/assets/js/localparse.js` and `site/assets/js/localstart.js` port the repository's own Python parsers; they are not
third-party.

## 3. Fonts, icons, textures and photos

### Fonts (Fontsource packages, `site/assets/vendor/fontsource/`)

| Font | Where | Copyright (as stated) | Licence | Upstream | Licence text |
|---|---|---|---|---|---|
| Roboto 5.0.8 (@fontsource/roboto) | `site/assets/vendor/fontsource/roboto@5.0.8/` | Roboto: « Copyright 2011 Google Inc. » (the licence file is the Apache-2.0 text alone) | Apache-2.0 | https://fontsource.org/fonts/roboto | `.../roboto@5.0.8/LICENSE` |
| Roboto Condensed 5.0.8 | `site/assets/vendor/fontsource/roboto-condensed@5.0.8/` | as Roboto | Apache-2.0 | https://fontsource.org/fonts/roboto-condensed | `.../roboto-condensed@5.0.8/LICENSE` |
| Noto Sans JP 5.0.19 | `site/assets/vendor/fontsource/noto-sans-jp@5.0.19/` | « (c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. » | OFL-1.1 | https://fontsource.org/fonts/noto-sans-jp | `.../noto-sans-jp@5.0.19/LICENSE` |
| Noto Sans TC 5.0.19 | `site/assets/vendor/fontsource/noto-sans-tc@5.0.19/` | same as above | OFL-1.1 | https://fontsource.org/fonts/noto-sans-tc | `.../noto-sans-tc@5.0.19/LICENSE` |
| Noto Sans HK 5.0.19 | `site/assets/vendor/fontsource/noto-sans-hk@5.0.19/` | same as above | OFL-1.1 | https://fontsource.org/fonts/noto-sans-hk | `.../noto-sans-hk@5.0.19/LICENSE` |

The PDFs of the white paper (`site/assets/ozimut-methode*.pdf`, `ocn-methode-top*.pdf`) are built with LaTeX (MiKTeX)
and embed its fonts; their licences are not recorded in the repository: to check.

### Icons

| Component | Where | Copyright | Licence | Upstream | Licence text |
|---|---|---|---|---|---|
| flag-icons 7.5.0 (the countries' 4:3 flags, 271 SVG files) | `site/assets/vendor/flag-icons@7.5.0/flags/4x3/` | « Copyright (c) 2013 Panayiotis Lipiridis » | MIT | https://github.com/lipis/flag-icons | `site/assets/vendor/flag-icons@7.5.0/LICENSE` |

### Textures (`site/assets/textures/virtually/`)

All from CC0 1.0 sources (public domain dedication), made into WebP by `tools/virtually/textures.py`,
`town_textures.py` and `texsets.py`; the list of each file's source is `site/assets/textures/virtually/CREDITS.txt`.

- Poly Haven (https://polyhaven.com): forest_leaves_02, forest_ground_04, bark_brown_02, lichen_rock, clean_asphalt,
  square_cobblestone, square_concrete_pavers, roof_tiles, roof_slates_02, forrest_sand_01, sand_01, rock_boulder_dry,
  pine_bark — CC0-1.0.
- ambientCG (https://ambientcg.com): LeafSet009, LeafSet010, LeafSet016, PineNeedles001 — CC0-1.0.

### Photos of « Apprendre » (`site/assets/learn/*.webp`)

The credits are in `site/assets/js/games/learnphotos.js` (author, licence, Wikimedia Commons page of each photo) and
are shown under the game. Each photo was reduced to 760 × 600 px at most and saved as WebP.

Freely licensed photos from Wikimedia Commons (each stays under its own licence; the reduced copies are adaptations
under the same licence):

| File | Author | Licence | Source |
|---|---|---|---|
| `roughOpen.webp` | John Ferguson | CC-BY-SA-2.0 | https://commons.wikimedia.org/wiki/File:Small_clearing_in_the_forest_-_geograph.org.uk_-_1822289.jpg |
| `smallDep.webp` | Photobits | CC-BY-4.0 | https://commons.wikimedia.org/wiki/File:NSG_Kalkkuppen_Eschweiler_bei_Pesch_29.jpg |
| `bigTree.webp` | Puusterke | CC-BY-SA-4.0 | https://commons.wikimedia.org/wiki/File:Naturdenkmal_Eiche_im_Misburger_Wald_(ND-H_220).jpg |
| `pit.webp` | Im Fokus | CC-BY-4.0 | https://commons.wikimedia.org/wiki/File:Sprockh%C3%B6vel,_BbWw_Alte-Haase-Weg_Nord_(3),_im_Wald_westl._H%C3%B6lteregge_32,_Pinge.jpg |
| `depression.webp` | Olga Ernst | CC-BY-SA-4.0 | https://commons.wikimedia.org/wiki/File:Doline_%C3%B6stlich_von_Obernheim_2.jpg |
| `fence.webp` | Richard Webb | CC-BY-SA-2.0 | https://commons.wikimedia.org/wiki/File:Fence_in_woodland_-_geograph.org.uk_-_4613926.jpg |
| `vegBoundary.webp` | Steven Brown | CC-BY-SA-2.0 | https://commons.wikimedia.org/wiki/File:Field_and_trees_at_the_edge_of_Brightmony_Wood_-_geograph.org.uk_-_1900103.jpg |
| `ditch.webp` | Panek | CC-BY-SA-4.0 | https://commons.wikimedia.org/wiki/File:Wyschni%C4%99ty_r%C3%B3w_w_d%C4%85br%C3%B3wce_szlacheckiej.jpg |

Photos and map extracts used with their author's permission only — **not licensed to anyone else; they may not be reused, copied or
adapted without their author's own permission**:

- by Emmanuel Roiné (17 photos): `pathBend.webp`, `knoll.webp`, `ruin.webp`, `boulderField.webp`, `cliff.webp`,
  `impFence.webp`, `cairn.webp`, `pathJunction.webp`, `road.webp`, `stump.webp`, `earthWall.webp`, `boulder.webp`,
  `rockFace.webp`, `earthBank.webp`, `pathCross.webp`, and `boulderCluster.webp`, `hill.webp` from his quiz;
- the map extracts `site/assets/learn/map/*.png` (31 files), from Emmanuel Roiné's quiz « définitions carte course
  d'orientation », which he made and asked to have on Ozimut (permission recorded on 2026-11-21).

## 4. Geographic data committed in the repository

| Data | Where | Source and copyright | Licence | Upstream |
|---|---|---|---|---|
| Country outlines and first-level units, world land | `site/assets/geo/<cc>.json`, `site/assets/geo/xw.json` (made by `tools/countrymaps.py`) | Natural Earth (each file's `source` field) | Public domain | https://www.naturalearthdata.com |
| France's régions and départements | `site/assets/geo/regions.json`, `site/assets/geo/departements.json` | IGN ADMIN EXPRESS, through the france-geojson project (as the site's credit `tr.map.hint` says) | not stated in the repository: to check | https://geoservices.ign.fr/adminexpress |
| Place tables (towns, administrative units and their positions) | `countries/places/<cc>.json.gz` (28 countries) and `countries/places/world.json.gz` (made by `tools/gazetteer.py` and `tools/worldplaces.py`) | GeoNames (each file's `source` field); `world.json.gz` also uses Natural Earth's label points | CC-BY-4.0 (GeoNames); public domain (Natural Earth) | https://www.geonames.org |

The control description symbols and map symbol sets drawn by the site (`site/assets/js/isom.js`,
`site/assets/js/mapper/sets/`) are Ozimut's own drawings after the IOF specifications (ISOM 2017-2, ISSprOM 2019-2,
ISCD 2024); the specifications themselves are not in the repository. The symbol names and short descriptions shown in
the site's catalogues are taken or translated from those specifications and from FFCO's and FEDO's translations of them;
their copyright status is not recorded in the repository: to check.

## 5. Tools and programs not distributed here

### karttapullautin

- Version 2.15.4 (`KP_VERSION` in `.github/workflows/lidarmap.yml` and `virtually.yml`), by Jarkko Ryyppö and
  contributors. Licence: GPL-3.0. Upstream: https://github.com/karttapullautin/karttapullautin
- Downloaded from its own release by the GitHub workflows, checked against its checksum and run as a separate program.
  None of its code is in this repository; only its output files are read (`mapgen/`, `tools/virtually/`).

### Python packages (installed at run time, not in the repository)

`requirements.txt`: httpx, lxml, cssselect, numpy, pypdf, pdfplumber, pyarrow, tzdata. The workflows also install
pillow, scipy, pyproj, requests, laspy[lazrs], apsw, rasterio, shapely and scikit-image. Their licences are not recorded
in the repository (no lockfile).

### Node packages (installed at build or test time, not in the repository)

Licences as recorded in the lockfiles:

- `chrono-app/` (desktop app; `package-lock.json`, 284 packages): ws 8.23.0 (MIT), electron 45.3.4 (MIT),
  electron-builder 26.18.0 (MIT) and their dependencies (MIT 214, ISC 35, BSD-3-Clause 9, BlueOak-1.0.0 9,
  Apache-2.0 6, BSD-2-Clause 5, and one each of Python-2.0, 0BSD, WTFPL, WTFPL OR ISC, WTFPL OR MIT, MIT OR CC0-1.0).
  The released installers bundle Electron (and with it Chromium and Node.js), whose own notices ship inside the app.
- `tools/mapper/` (tests): @xmldom/xmldom 0.9.8 (MIT).
- `tools/virtually/` (thumbnails): puppeteer-core 24.43.1 (Apache-2.0) and 80 dependencies (MIT 52, Apache-2.0 13, ISC 8,
  BSD-2-Clause 5, BSD-3-Clause 2, 0BSD 1).
- `tools/vendor.py` uses npm and esbuild 0.24.0 (MIT) to build `site/assets/vendor/`.

### Android libraries (the Folloz apps, `track/android`; fetched by Gradle at build time, not in the repository)

Bundled into the APKs the CI builds, under their own licences:

- Kotlin standard library (JetBrains, Apache-2.0); AndroidX core-ktx and activity-ktx (The Android Open Source Project,
  Apache-2.0).
- ZXing Android Embedded 4.3.0 (JourneyApps, Apache-2.0) and ZXing core (ZXing authors, Apache-2.0): scanning and drawing
  QR codes.
- Firebase Cloud Messaging (Google, Apache-2.0), only in a build made with the owner's `google-services.json`.
- Google Play services' Wearable library (`play-services-wearable`, Google, under the Android Software Development Kit
  License): the Wear OS watch handing its runs to the phone.

The map's tiles are not bundled: each phone reads them from the providers `/api/folloz/config` names — IGN's Plan IGN and aerial
photos in France (© IGN, Licence Ouverte 2.0), swisstopo's national map and SWISSIMAGE in Switzerland and Liechtenstein
(© swisstopo, open data), OpenStreetMap's standard tiles elsewhere (© OpenStreetMap contributors, ODbL); the credits of the layers
shown are drawn on the map. The countries' outlines that choose the layer (`functions/_lib/follozareas.js`) are Natural Earth's
(public domain), simplified.

### Other software read for facts only (none of its code is here)

- MeOS (AGPL-3.0, https://github.com/melinsoftware/meos): its source was read for file-format and protocol facts
  (Chronoz `docs/meos.md`).
- emit-punch-cards-communication (GPL-3.0, https://github.com/mikaello/emit-punch-cards-communication): read for
  protocol facts only, by Chronoz; none of its code or data is here
  (Chronoz `docs/emit.md`).
- QuickRoute (GPL): its JPEG format read from the format's description (`site/assets/js/trace/mapjpeg.js`).
- OpenOrienteering Mapper (GPL): no code; Mapper files are read and written through the Purple Pen ports.

## 6. Data sources credited by the site

Data from these sources is fetched at run time and data derived from it is published by the site (maps, heights,
places, positions). It is not in the repository except as noted in section 4.

| Source | Licence (as the site credits it) |
|---|---|
| IGN (France): LiDAR HD, RGE ALTI, BD TOPO, BD ORTHO, RPG, the Géoplateforme's map layers | Licence Ouverte 2.0 (Etalab) |
| Cadastre (DGFiP, France) | Licence Ouverte 2.0 |
| OpenStreetMap | © OpenStreetMap contributors, ODbL-1.0 |
| Panoramax street photos (façade colours and textures of Pixel's town races) | CC-BY-SA-4.0; the derived façade atlas is itself CC-BY-SA-4.0 (`tools/virtually/town_3d.py`, `town_facadetex.py`) |
| swisstopo: swissSURFACE3D, swissALTI3D, swissTLM3D, SWISSIMAGE, national maps | Open Government Data, « © swisstopo » |
| USGS 3D Elevation Program (3DEP), The National Map (TIGER roads, National Digital Trails, NHD, imagery, US Topo) | Public domain |
| FEMA USA Structures | Public domain |
| NRCan CanElevation, HRDEM (Canada) | Open Government Licence – Canada 2.0 |
| LINZ elevation and aerial imagery (New Zealand), point clouds via OpenTopography | CC-BY-4.0 |
| Terrain Tiles (Mapzen, AWS Open Data: SRTM, GMTED, EU-DEM, USGS 3DEP…) | per its attribution page, https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
| GeoNames | CC-BY-4.0 |
| Natural Earth | Public domain |
| Wikimedia Commons photos read only for their colours (`tools/virtually/biomes.py`; no photo kept) | CC-BY-SA / CC-BY / CC0 |
