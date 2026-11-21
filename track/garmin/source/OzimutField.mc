// The data field: pairing by claim code, one fix a second while the timer runs, batches sent through the
// paired phone (Communications.makeWebRequest, allowed in foreground data fields since API 5.0.0), and a
// one-line status. The protocol is docs/track/design.md (« Watches: claim codes », « Sending »).
import Toybox.Activity;
import Toybox.Application;
import Toybox.Communications;
import Toybox.Cryptography;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

const VERSION = "1.0.0";
const CLAIM_EVERY = 10;          // s between two claim requests while unpaired (design.md)
const FIRST_NEXT = 30;           // s before the first batch, until the server says otherwise
const MAX_BATCH = 60;            // fixes a request at most (the server takes 600; the BLE link prefers small)
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CLAIM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

// The server. A debug build (monkeyc without -r) may point at a development server.
(:release)
function baseUrl() as String {
    return "https://ozimut.com";
}

(:debug)
function baseUrl() as String {
    return "https://ozimut.com";
}

class OzimutField extends WatchUi.DataField {

    // Pairing (kept in Application.Storage).
    hidden var key as String = "";
    hidden var claim as String = "";
    hidden var paired as Boolean = false;
    hidden var claimAt as Number = 0;

    // The run.
    hidden var backlog as Backlog;
    hidden var run as String or Null = null;
    hidden var seq as Number = 1;
    hidden var endPending as Boolean = false;   // the activity ended: an "end" batch is owed
    hidden var stopped as Boolean = false;      // the server said stop: nothing more this activity
    hidden var lastFixT as Number = 0;
    hidden var hasAlt as Boolean = false;

    // Sending.
    hidden var busy as Boolean = false;
    // The fixes given to the current batch number. A batch that failed is sent again with exactly these
    // fixes under the same number: the server ignores a number it already holds and answers its ack, so
    // a retry must never carry fixes the first attempt did not. Halving leaves them alone.
    hidden var inflight as Number = 0;
    hidden var inflightSeq as Number = 0;
    hidden var inflightEnd as Boolean = false;
    hidden var interval as Number = FIRST_NEXT;
    hidden var nextAt as Number = 0;
    hidden var batchMax as Number = MAX_BATCH;
    hidden var lastAck as Number = 0;
    hidden var lastErr as Number = 0;
    hidden var lastErrAt as Number = 0;

    // Texts, loaded once.
    hidden var sLive as String;
    hidden var sWaiting as String;
    hidden var sUnpaired as String;
    hidden var sNoPhone as String;
    hidden var sReady as String;
    hidden var sStopped as String;
    hidden var sHalved as String;

    function initialize() {
        DataField.initialize();
        sLive = WatchUi.loadResource(Rez.Strings.Live) as String;
        sWaiting = WatchUi.loadResource(Rez.Strings.Waiting) as String;
        sUnpaired = WatchUi.loadResource(Rez.Strings.Unpaired) as String;
        sNoPhone = WatchUi.loadResource(Rez.Strings.NoPhone) as String;
        sReady = WatchUi.loadResource(Rez.Strings.Ready) as String;
        sStopped = WatchUi.loadResource(Rez.Strings.Stopped) as String;
        sHalved = WatchUi.loadResource(Rez.Strings.Halved) as String;

        var k = Application.Storage.getValue("key");
        var c = Application.Storage.getValue("claim");
        var p = Application.Storage.getValue("paired");
        if (k instanceof String && c instanceof String && (k as String).length() == 32) {
            key = k as String;
            claim = c as String;
            paired = (p instanceof Boolean) ? (p as Boolean) : false;
        } else {
            newIdentity();
        }
        backlog = new Backlog(capacity());
    }

    // How many fixes the backlog holds: a quarter of the memory free once the field is loaded, at
    // 40 bytes a fix (five Numbers in five arrays; Monkey C keeps a Number in an array slot of a few
    // bytes, counted generously), between 2 and 60 minutes of fixes.
    hidden function capacity() as Number {
        var free = System.getSystemStats().freeMemory;
        var n = free / 4 / 40;
        if (n < 120) { n = 120; }
        if (n > 3600) { n = 3600; }
        return n;
    }

    // ---------------------------------------------------------------- identity

    hidden function newIdentity() as Void {
        var bytes = randomBytes(38);
        var k = "";
        for (var i = 0; i < 32; i += 1) {
            k += B64URL.substring(bytes[i] % 64, bytes[i] % 64 + 1);   // 256 = 4 x 64: uniform
        }
        var c = "";
        for (var i = 32; i < 38; i += 1) {
            c += CLAIM_CHARS.substring(bytes[i] % 32, bytes[i] % 32 + 1);   // 256 = 8 x 32: uniform
        }
        key = k;
        claim = c;
        paired = false;
        claimAt = 0;
        Application.Storage.setValue("key", key);
        Application.Storage.setValue("claim", claim);
        Application.Storage.setValue("paired", false);
    }

    // Cryptographically random bytes where the device offers them (Cryptography.randomBytes, API 3.0.0);
    // else Math.rand seeded with the clock, the system timer and the device's unique identifier — a
    // linear generator, guessable by someone who knows those values, so only a fallback.
    hidden function randomBytes(n as Number) as ByteArray {
        if (Toybox has :Cryptography) {
            if (Cryptography has :randomBytes) {
                return Cryptography.randomBytes(n);
            }
        }
        var seed = Time.now().value() ^ System.getTimer();
        var id = System.getDeviceSettings().uniqueIdentifier;
        if (id != null) {
            var chars = id.toCharArray();
            for (var i = 0; i < chars.size(); i += 1) {
                seed = (seed * 31 + chars[i].toNumber()) & 0x7FFFFFFF;
            }
        }
        Math.srand(seed);
        var out = new [n]b;
        for (var i = 0; i < n; i += 1) {
            out[i] = (Math.rand() >> 8) & 0xFF;
        }
        return out;
    }

    hidden function randomBase36(n as Number) as String {
        var bytes = randomBytes(n);
        var s = "";
        for (var i = 0; i < n; i += 1) {
            s += BASE36.substring(bytes[i] % 36, bytes[i] % 36 + 1);
        }
        return s;
    }

    // ---------------------------------------------------------------- timer callbacks

    function onTimerStart() as Void {
        stopped = false;
        if (paired && run == null) {
            startRun();
        }
    }

    // Stop pressed: the activity may still resume, but send what is held now, before it is saved.
    function onTimerStop() as Void {
        nextAt = 0;
        flush();
    }

    // The activity is over (saved or discarded): the "end" batch, at once.
    function onTimerReset() as Void {
        if (run != null) {
            endPending = true;
            nextAt = 0;
            flush();
        }
        stopped = false;
    }

    // ---------------------------------------------------------------- compute (about once a second)

    function compute(info as Activity.Info) as Void {
        var now = Time.now().value();
        if (!paired) {
            if (!busy && now >= claimAt) {
                claimAt = now + CLAIM_EVERY;
                postClaim();
            }
            return;
        }
        var ts = info.timerState;
        if (!stopped && ts != null && ts == Activity.TIMER_STATE_ON) {
            if (run == null) {
                startRun();
            }
            record(info, now);
        }
        flush();
    }

    hidden function record(info as Activity.Info, now as Number) as Void {
        if (now == lastFixT) {
            return;
        }
        var loc = info.currentLocation;
        var q = info.currentLocationAccuracy;
        if (loc == null || q == null || q < Position.QUALITY_POOR) {
            return;   // no fix, or only the last known one
        }
        var deg = loc.toDegrees();
        var alt = NO_ALT;
        var a = info.altitude;
        if (a != null) {
            alt = round(a.toDouble());
            hasAlt = true;
        } else if (backlog.count > 0) {
            alt = backlog.alt(backlog.count - 1);
        }
        backlog.add(now, round(deg[0] * 1000000.0d), round(deg[1] * 1000000.0d), accuracyOf(q), alt,
            inflight);
        lastFixT = now;
    }

    // Half away from zero.
    hidden function round(v as Double) as Number {
        return (v >= 0 ? v + 0.5d : v - 0.5d).toNumber();
    }

    // Position.Quality has no metres: a plausible accuracy for each grade.
    hidden function accuracyOf(q as Position.Quality) as Number {
        if (q == Position.QUALITY_GOOD) { return 5; }
        if (q == Position.QUALITY_USABLE) { return 10; }
        return 25;   // QUALITY_POOR: a 2-D fix
    }

    hidden function startRun() as Void {
        var g = Gregorian.utcInfo(Time.now(), Time.FORMAT_SHORT);
        run = Lang.format("r_$1$$2$$3$T$4$$5$$6$_$7$", [
            g.year, (g.month as Number).format("%02d"), g.day.format("%02d"),
            g.hour.format("%02d"), g.min.format("%02d"), g.sec.format("%02d"), randomBase36(4)]);
        seq = 1;
        endPending = false;
        hasAlt = false;
        backlog.halved = 0;
        lastAck = 0;
    }

    // ---------------------------------------------------------------- sending

    hidden function flush() as Void {
        if (!paired || busy || run == null) {
            return;
        }
        if (backlog.count == 0 && !endPending) {
            return;
        }
        if (Time.now().value() < nextAt) {
            return;
        }
        sendBatch();
    }

    hidden function sendBatch() as Void {
        var n = inflight > 0 ? inflight : (backlog.count < batchMax ? backlog.count : batchMax);
        var isEnd = endPending && n == backlog.count;
        var dt = new Array<Number>[n];
        var la = new Array<Number>[n];
        var lo = new Array<Number>[n];
        var ac = new Array<Number>[n];
        var al = new Array<Number>[n];
        for (var i = 0; i < n; i += 1) {
            if (i == 0) {
                dt[i] = 0;
                la[i] = backlog.lat(0);
                lo[i] = backlog.lon(0);
                al[i] = backlog.alt(0) == NO_ALT ? 0 : backlog.alt(0);
            } else {
                dt[i] = backlog.time(i) - backlog.time(i - 1);
                la[i] = backlog.lat(i) - backlog.lat(i - 1);
                lo[i] = backlog.lon(i) - backlog.lon(i - 1);
                var a0 = backlog.alt(i - 1);
                var a1 = backlog.alt(i);
                al[i] = (a0 == NO_ALT || a1 == NO_ALT) ? 0 : a1 - a0;
            }
            ac[i] = backlog.acc(i);
        }
        var body = {
            "v" => 1,
            "run" => run,
            "seq" => seq,
            "state" => isEnd ? "end" : "run",
            "share" => "watchers",
            "t0" => n > 0 ? backlog.time(0) : Time.now().value(),
            "dt" => dt,
            "la" => la,
            "lo" => lo,
            "ac" => ac,
            "bat" => System.getSystemStats().battery.toNumber(),
            "lp" => false,
            "left" => 0
        } as Dictionary<Object, Object>;
        if (hasAlt) {
            body["al"] = al;
        }
        busy = true;
        inflight = n;
        inflightSeq = seq;
        inflightEnd = isEnd;
        Communications.makeWebRequest(baseUrl() + "/api/track/push", body, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + key
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, method(:onPush));
    }

    function onPush(code as Number, data as Dictionary or String or Null) as Void {
        busy = false;
        var now = Time.now().value();
        var d = (data instanceof Dictionary) ? data as Dictionary : null;
        if (code == 200) {
            lastErr = 0;
            var ack = (d != null && d["ack"] instanceof Number) ? d["ack"] as Number : 0;
            if (ack >= inflightSeq) {
                backlog.drop(inflight);
                inflight = 0;
                seq = inflightSeq + 1;
                lastAck = now;
                if (inflightEnd) {
                    run = null;
                    endPending = false;
                    seq = 1;
                }
            }
            if (d != null && d["next"] instanceof Number) {
                var nx = d["next"] as Number;
                interval = nx < 5 ? 5 : (nx > 600 ? 600 : nx);
            }
            nextAt = now + interval;
            if (d != null && d["stop"] == true) {
                // A parent ended the run, or the device was removed: stop until the next activity.
                stopped = true;
                run = null;
                endPending = false;
                inflight = 0;
                backlog.clear();
                return;
            }
            // A backlog to catch up (the phone came back), or the end owed: the next batch at once.
            if (backlog.count >= batchMax || endPending) {
                nextAt = 0;
                flush();
            }
        } else if (code == 401) {
            // Removed from the account: forget the key, show a new code.
            run = null;
            endPending = false;
            inflight = 0;
            backlog.clear();
            newIdentity();
        } else if (code == 409) {
            // The run is closed on the server (its cap): what is held starts a new run.
            inflight = 0;
            if (inflightEnd || backlog.count == 0) {
                run = null;
                endPending = false;
            } else {
                startRun();
            }
            nextAt = now;
        } else if (code == 413) {
            batchMax = batchMax > 20 ? batchMax / 2 : 10;
            inflight = 0;   // refused whole: split again
            nextAt = now;
        } else if (code == 429) {
            var nx = (d != null && d["next"] instanceof Number) ? d["next"] as Number : 60;
            nextAt = now + (nx < 5 ? 5 : nx);
        } else {
            // No phone (BLE_CONNECTION_UNAVAILABLE), a full queue, a timeout, a server error: keep the
            // fixes and try again.
            lastErr = code;
            lastErrAt = now;
            nextAt = now + (code == Communications.BLE_CONNECTION_UNAVAILABLE ? 30 : 15);
        }
    }

    hidden function postClaim() as Void {
        busy = true;
        Communications.makeWebRequest(baseUrl() + "/api/track/claim", {
            "claim" => claim,
            "key" => key,
            "kind" => "garmin",
            "model" => System.getDeviceSettings().partNumber,
            "version" => VERSION
        } as Dictionary<Object, Object>, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, method(:onClaim));
    }

    function onClaim(code as Number, data as Dictionary or String or Null) as Void {
        busy = false;
        if (code == 200 && data instanceof Dictionary && (data as Dictionary)["paired"] == true) {
            paired = true;
            lastErr = 0;
            Application.Storage.setValue("paired", true);
            var s = (data as Dictionary)["settings"];
            if (s instanceof Dictionary && (s as Dictionary)["batch"] instanceof Number) {
                interval = (s as Dictionary)["batch"] as Number;
            }
        } else if (code < 0) {
            lastErr = code;
            lastErrAt = Time.now().value();
        } else {
            lastErr = 0;
        }
    }

    // ---------------------------------------------------------------- display

    hidden function status() as String {
        var now = Time.now().value();
        var n = backlog.count;
        if (!paired) {
            return sUnpaired + " " + claim;
        }
        if (stopped) {
            return sStopped;
        }
        var noPhone = (lastErr == Communications.BLE_CONNECTION_UNAVAILABLE) && (now - lastErrAt < 120);
        var s;
        if (noPhone) {
            s = sNoPhone + (n > 0 ? " (" + n + ")" : "");
        } else if (run == null && n == 0) {
            return sReady;
        } else if (lastAck > 0 && now - lastAck <= 2 * interval + 10) {
            s = sLive;
        } else {
            s = Lang.format(sWaiting, [n]);
        }
        if (backlog.halved > 0) {
            s += " · " + sHalved;
        }
        return s;
    }

    function onLayout(dc as Graphics.Dc) as Void {
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var bg = getBackgroundColor();
        var fg = (bg == Graphics.COLOR_BLACK) ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;
        dc.setColor(fg, bg);
        dc.clear();

        var w = dc.getWidth();
        var h = dc.getHeight();
        // On round screens the edges of a field may be cut by the bezel: keep the text inside.
        var ob = getObscurityFlags();
        var left = (ob & WatchUi.DataField.OBSCURE_LEFT) != 0 ? w * 14 / 100 : 2;
        var right = (ob & WatchUi.DataField.OBSCURE_RIGHT) != 0 ? w * 14 / 100 : 2;
        var top = (ob & WatchUi.DataField.OBSCURE_TOP) != 0 ? h * 12 / 100 : 0;
        var bottom = (ob & WatchUi.DataField.OBSCURE_BOTTOM) != 0 ? h * 12 / 100 : 0;
        var bw = w - left - right;
        var bh = h - top - bottom;
        var cx = left + bw / 2;
        var text = status();

        var small = dc.getFontHeight(Graphics.FONT_XTINY);
        if (bh >= small * 2 + 4) {
            // Two lines: the name, then the status as large as it fits.
            var f = fit(dc, text, bw, bh - small);
            var fh = dc.getFontHeight(f);
            var y0 = top + (bh - small - fh) / 2;
            dc.drawText(cx, y0, Graphics.FONT_XTINY, "Ozimut", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(cx, y0 + small, f, text, Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            var line = "Ozimut · " + text;
            var f = fit(dc, line, bw, bh);
            dc.drawText(cx, top + bh / 2, f, line, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // The largest font in which the text fits the box (the smallest otherwise).
    hidden function fit(dc as Graphics.Dc, text as String, bw as Number, bh as Number) as Graphics.FontDefinition {
        var fonts = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        for (var i = 0; i < fonts.size(); i += 1) {
            if (dc.getTextWidthInPixels(text, fonts[i]) <= bw && dc.getFontHeight(fonts[i]) <= bh) {
                return fonts[i];
            }
        }
        return Graphics.FONT_XTINY;
    }
}
