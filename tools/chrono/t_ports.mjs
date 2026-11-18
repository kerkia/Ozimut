// node tools/chrono/t_ports.mjs — which serial port the desktop app gives the page (chrono-app/ports.mjs): the finish desk's
// usual mixes of a SPORTident station, an Emit reader, a radio dongle and a receipt printer on a USB-serial cable.
import { choosePort, keyOf } from "../../chrono-app/ports.mjs";

let fails = 0, n = 0;
const eq = (a, b, what) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log(`FAIL ${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); } };
// Electron writes the USB ids as text: decimal on some systems, hexadecimal on others
const port = (portId, vendorId, productId, serialNumber = "") => ({ portId, portName: portId, vendorId, productId, serialNumber });
const SI = port("COM3", "4292", "32778", "SI1");                 // 10C4:800A in decimal
const SI2 = port("COM4", "10c4", "800a", "SI2");                 // a second station (or an SRR dongle), in hexadecimal
const CP = port("COM5", "10c4", "ea60");                         // another CP210x cable: a printer, a GPS…
const EMIT = port("COM6", "0403", "6001", "FT1");                // an Emit 250 / MTR4 on FTDI
const PRN_FTDI = port("COM7", "0403", "6001", "FT2");            // a printer on an FTDI cable too
const PRN = port("COM8", "1a86", "7523");                        // a printer on a CH340 cable
const ESCAN = port("COM9", "2047", "0300");                      // the first eScan
const pick = (ports, role, kept) => choosePort(ports, role, kept);
const asked = (r) => r.ask?.map((p) => p.portId);

// one port only: no question
eq(pick([PRN], "si"), { pick: "COM8" }, "the only port, whatever it is");
eq(pick([], "si"), { pick: "" }, "no port");
// a station and a printer: each gets its own
eq(pick([SI, PRN], "si"), { pick: "COM3" }, "station + printer: the SPORTident reader");
eq(asked(pick([SI, PRN], "printer")), ["COM8", "COM3"], "station + printer: the printer is asked for, the station last");
eq(asked(pick([SI, PRN], "emit")), ["COM8", "COM3"], "station + printer: an Emit reader asked for is not given the station");
eq(asked(pick([SI, EMIT], "emit")), ["COM6", "COM3"], "station + Emit: Emit asked, its FTDI port first (FTDI is not sure)");
eq(pick([SI, ESCAN], "emit"), { pick: "COM9" }, "station + eScan: the eScan, known by its ids");
eq(pick([SI, EMIT], "si"), { pick: "COM3" }, "station + Emit: the station for SPORTident");
// two stations: always asked, SPORTident's first
eq(asked(pick([SI, SI2, PRN], "si")), ["COM3", "COM4", "COM8"], "two stations: asked");
// a CP210x printer beside the station: the station is still sure
eq(pick([SI, CP], "si"), { pick: "COM3" }, "station + CP210x printer: the station");
eq(asked(pick([SI, CP], "printer")), ["COM5", "COM3"], "station + CP210x printer: the printer asked, its port first");
// a CP210x cable alone among others, no station: the SPORTident reader may be on it
eq(pick([CP, PRN], "si"), { pick: "COM5" }, "no station but one CP210x: taken for SPORTident");
// the choice remembered for that use
const kept = { printer: keyOf(PRN_FTDI), emit: keyOf(EMIT) };
eq(pick([SI, EMIT, PRN_FTDI], "printer", kept), { pick: "COM7" }, "the printer's port remembered, though FTDI as Emit's");
eq(pick([SI, EMIT, PRN_FTDI], "emit", kept), { pick: "COM6" }, "the Emit port remembered by its serial number");
eq(asked(pick([SI, EMIT, PRN_FTDI], "emit")), ["COM6", "COM7", "COM3"], "two FTDI ports, nothing remembered: asked");
eq(pick([SI, SI2], "si", { si: keyOf(SI2) }), { pick: "COM4" }, "two stations: the one chosen last time");
eq(asked(pick([SI, PRN], "si", { si: keyOf(PRN) })), undefined, "a port remembered for SPORTident that is no station is not taken over the station");
// the page did not say (an older page): always asked
eq(asked(pick([SI, PRN], "")), ["COM3", "COM8"], "role unknown: asked");

console.log(fails ? `ports: ${fails} of ${n} checks FAILED` : `ports: ${n} checks passed`);
process.exit(fails ? 1 : 0);
