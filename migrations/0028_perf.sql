-- How fast the site is (2026-11-17; admin › « Vitesse », functions/_lib/perf.js). With each page view of a signed-in
-- account the browser sends how long the page took to show, the slowest reaction to a click, a tick or a key on the page
-- before, and the texts that had to be loaded late; kept here as counts by day, page and build of the code — no account,
-- nothing personal. kind: 'first' (the first page of a visit, from the moment its address was opened), 'nav' (a later page,
-- from the click), 'tap' (the slowest reaction on a page), 'late' (a text loaded late: `page` holds its key).
-- b0…b5: how many were under 300 ms, 600 ms, 1.2 s, 2.5 s, 5 s, and beyond.
CREATE TABLE IF NOT EXISTS perf_daily (
  day    TEXT NOT NULL,
  page   TEXT NOT NULL,
  kind   TEXT NOT NULL,
  build  TEXT NOT NULL DEFAULT '',
  n      INTEGER NOT NULL DEFAULT 0,
  sum_ms INTEGER NOT NULL DEFAULT 0,
  b0 INTEGER NOT NULL DEFAULT 0, b1 INTEGER NOT NULL DEFAULT 0, b2 INTEGER NOT NULL DEFAULT 0,
  b3 INTEGER NOT NULL DEFAULT 0, b4 INTEGER NOT NULL DEFAULT 0, b5 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, kind, build)
);
