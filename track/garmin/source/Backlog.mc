// The fixes not yet acknowledged by the server: a ring of compact integer arrays.
//
// Each fix is five Numbers (time in s since 1970 UTC, latitude and longitude in millionths of a degree,
// accuracy in metres, altitude in metres or NO_ALT). The ring's capacity is chosen once from the memory the
// field has (OzimutField.capacity). When it is full, the fixes not in flight are halved (every other one
// kept, the oldest first): the run keeps its whole length at a coarser step, never a hole, and the field
// says so (`halved`).
import Toybox.Lang;

const NO_ALT = -999999;

class Backlog {
    var cap as Number;
    var count as Number = 0;
    var halved as Number = 0;       // how many times the backlog was halved since the run began
    hidden var head as Number = 0;
    hidden var tm as Array<Number>;
    hidden var la as Array<Number>;
    hidden var lo as Array<Number>;
    hidden var ac as Array<Number>;
    hidden var al as Array<Number>;

    function initialize(n as Number) {
        cap = n;
        tm = new Array<Number>[n];
        la = new Array<Number>[n];
        lo = new Array<Number>[n];
        ac = new Array<Number>[n];
        al = new Array<Number>[n];
    }

    // Adds a fix; `keep` = the first fixes, in flight, that halving must not touch.
    function add(t as Number, lat as Number, lon as Number, acc as Number, alt as Number, keep as Number) as Void {
        if (count >= cap) {
            halve(keep);
        }
        var i = (head + count) % cap;
        tm[i] = t;
        la[i] = lat;
        lo[i] = lon;
        ac[i] = acc;
        al[i] = alt;
        count += 1;
    }

    hidden function halve(keep as Number) as Void {
        var w = keep;
        for (var r = keep; r < count; r += 2) {
            var src = (head + r) % cap;
            var dst = (head + w) % cap;
            tm[dst] = tm[src];
            la[dst] = la[src];
            lo[dst] = lo[src];
            ac[dst] = ac[src];
            al[dst] = al[src];
            w += 1;
        }
        count = w;
        halved += 1;
    }

    // Forgets the first k fixes (acknowledged).
    function drop(k as Number) as Void {
        if (k > count) {
            k = count;
        }
        head = (head + k) % cap;
        count -= k;
    }

    function clear() as Void {
        head = 0;
        count = 0;
        halved = 0;
    }

    function time(i as Number) as Number { return tm[(head + i) % cap]; }
    function lat(i as Number) as Number { return la[(head + i) % cap]; }
    function lon(i as Number) as Number { return lo[(head + i) % cap]; }
    function acc(i as Number) as Number { return ac[(head + i) % cap]; }
    function alt(i as Number) as Number { return al[(head + i) % cap]; }
}
