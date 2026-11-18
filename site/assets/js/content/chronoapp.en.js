// The documentation of Ozimut Chrono's desktop application, in English (chronoapp.fr.js is the reference: the same
// sections under the same ids). Plain data read by the application's own page (chrono/ui/appdoc.js) and by Orga's
// documentation on the site (content/guide.en.js, chapter « chrono-app »).
export default {
  title: "The Ozimut Chrono application",
  lede: "Ozimut's race timing installed on a computer: no Internet needed, several stations linked, receipts printed without a dialog. This guide is the same in the application (Help › Documentation) and in Orga's documentation on ozimut.com.",
  sections: [
    { id: "what", title: "What the application is for", html: `
      <p>The Ozimut Chrono application shows the same screens as the “Chrono” tab of an Orga event on ozimut.com. It also does what a
        browser tab cannot do:</p>
      <ul>
        <li>it works <b>without the Internet</b>;</li>
        <li>it is a <b>hub</b>: the other computers and the phones of the local network open its address in their browser and work on the
          same race;</li>
        <li>it writes every operation to a <b>log</b>, one file per event in a folder of the computer;</li>
        <li>it prints the receipts <b>without a print dialog</b>;</li>
        <li>it receives the <b>radio punches</b> of relays (SIRAP protocol).</li>
      </ul>
      <p><b>The tab alone is enough</b> when one computer does the timing, or when every station has the Internet: they then keep each
        other up to date through the copy on Ozimut. Plugging in a card reader takes Chrome or Edge.</p>
      <p><b>Being tested.</b> Like Chrono itself, the application has never yet been used with real SPORTident or Emit stations, with a
        receipt printer, or at a real competition. Try it at a training session, or alongside your usual software.</p>` },
    { id: "install", title: "Downloading and installing", html: `
      <p>The files are downloaded from Ozimut: Orga › My events › an event › “Chrono” tab › Prepare › Connections › “Download the
        application”.</p>
      <table>
        <thead><tr><th>System</th><th>File</th><th>What it is</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Setup.exe</code></td><td>The installer, recommended (about 100 MB). It installs the
            application for your own account, with no administrator rights.</td></tr>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Portable.exe</code></td><td>The portable version: one program, nothing installed. Run it
            from wherever you like, a USB stick for instance.</td></tr>
          <tr><td>macOS</td><td><code>Ozimut-Chrono.dmg</code></td><td>One disk image for every Mac, Apple silicon and Intel alike: open it
            and drag the application into Applications.</td></tr>
          <tr><td>Linux</td><td><code>Ozimut-Chrono.AppImage</code></td><td>A single file (64-bit). Make it executable — Properties ›
            Permissions, or <code>chmod +x Ozimut-Chrono.AppImage</code> —, then run it.</td></tr>
        </tbody>
      </table>
      <p><b>While the application is not signed</b>, the system is wary of it at the first launch:</p>
      <ul>
        <li><b>Windows</b> shows “Windows protected your PC”: choose “More info”, then “Run anyway”.</li>
        <li><b>macOS</b> first refuses to open it. On recent versions: System Settings › Privacy &amp; Security, then “Open Anyway”. On
          older versions: right-click the application, “Open”, then confirm.</li>
      </ul>` },
    { id: "first", title: "First launch", html: `
      <p>The window opens on the home screen: the list “Events” and the card “New event” (a name, a date, the country's rules — France,
        Canada or IOF rules —, then “Create”). Once an event is open, everything works as in the tab: the stations Prepare, Desk, Start,
        Finish, Monitor, Speaker, Referee, Units and Close, described in Orga's documentation, chapter “Chrono”.</p>
      <ul>
        <li><b>The events' folder</b> is “Ozimut Chrono”, in your Documents; the application creates it. File › “Open the data folder”
          shows it.</li>
        <li><b>An event file</b> (.ozchrono) opens with a double-click (with the installed version), or through File › “Open an event
          file…”: its operations join that event in the application, doubling nothing, and the event opens.</li>
        <li><b>One application at a time</b>: launching it a second time brings back the window already open.</li>
        <li><b>The firewall</b>: at the first launch Windows may ask whether other computers may reach the application. Allow it on
          private networks if other stations are to connect.</li>
        <li><b>The menu</b>: File (open a file, open the folder, quit), Edit, View (reload, zoom, full screen), Help › “Documentation”
          (<kbd>F1</kbd>) and “About Ozimut Chrono”, which gives the version, the addresses for the other stations, the radio punches' port
          and the data folder.</li>
      </ul>` },
    { id: "hub", title: "Linking other computers and phones", html: `
      <p>The application is a hub: every device on the same local network — a Wi-Fi access point or a plain router is enough, with no
        Internet — can work on the same race.</p>
      <ol>
        <li>On the application's computer, open Help › “About Ozimut Chrono”: the window gives the address to open, of the form
          <code>http://192.168.1.20:8377/?k=…</code>. What follows <code>?k=</code> is the hub's <b>key</b>.</li>
        <li>On the other computer or the phone, open that address in the browser. Without the key, the page asks for it in a field marked
          with a key.</li>
        <li>Choose the event in the list. This station sees the race within moments and writes to it like the others.</li>
      </ol>
      <p>A station that loses the network carries on alone and reconnects by itself when it is back; nothing is lost.</p>
      <h3>One station, one role</h3>
      <p>Add <code>&amp;role=</code> to the address so that a station shows only what concerns it, for example
        <code>http://192.168.1.20:8377/?k=…&amp;role=start</code>:</p>
      <table>
        <thead><tr><th>Role</th><th>Stations shown</th></tr></thead>
        <tbody>
          <tr><td><code>desk</code></td><td>Desk</td></tr>
          <tr><td><code>start</code></td><td>Start</td></tr>
          <tr><td><code>finish</code></td><td>Finish and Monitor</td></tr>
          <tr><td><code>speaker</code></td><td>Speaker and Monitor</td></tr>
          <tr><td><code>referee</code></td><td>Referee and Monitor</td></tr>
          <tr><td>(no role)</td><td>Every station</td></tr>
        </tbody>
      </table>
      <p>Once the event is open, the browser's address names it (<code>&amp;ev=…</code>): keep it as a bookmark, it reopens that event
        directly, in that role.</p>
      <h3>Card readers on the other stations</h3>
      <p>A browser lets a page talk to a card reader, or to a receipt printer on a serial port, only when the page comes from a secure
        site or from the computer itself. So a page opened at the hub's address from another computer cannot read cards: it suits a desk
        without a reader, the start, monitoring, the speaker, the referee. For a second reading station:</p>
      <ul>
        <li>with the Internet: on that computer, open the event's “Chrono” tab on ozimut.com, in Chrome or Edge; it keeps up to date
          through the copy on Ozimut;</li>
        <li>without the Internet: install the application there too, open in it the event file (.ozchrono) saved on the first computer,
          then, in Prepare › Connections, give the first computer's address (<code>192.168.1.20:8377</code>) and the “Hub key”, and
          “Connect”. This has to be done again when the application is restarted.</li>
      </ul>` },
    { id: "tab", title: "Linking Ozimut's tab to the application", html: `
      <p>On the application's computer, also open the event's “Chrono” tab on ozimut.com (Chrome or Edge), then Prepare › Connections ›
        “Look for the app on this computer”. The tab connects to the application, and the top bar shows “Hub”. From then on the tab's event
        is in the application too, with its log in the folder.</p>
      <p>What it is for: the tab is signed in on Ozimut — the copy on Ozimut, the live results, “Publish on Ozimut” —, and the application
        links the arena's stations without the Internet. In the tab, “Give the other stations access” makes a key that travels with the
        race: the application's stations then exchange with Ozimut too when they have the Internet.</p>
      <p>If the tab answers “The Ozimut Chrono app was not found on this computer”: check that it is running and, if the browser asks for
        permission to reach devices on the local network, grant it.</p>` },
    { id: "print", title: "Printing receipts without a dialog", html: `
      <p>In Prepare › Equipment › “Receipt printer”, the application adds a choice to “Print on”: “The printer chosen, without a dialog
        (app)”.</p>
      <ul>
        <li>“Printer” lists the printers installed on the computer; the default one carries a star. So the receipt printer must first be
          installed in the system, with its driver.</li>
        <li>“Paper”: 58 mm or 80 mm. “Test receipt” checks it all.</li>
        <li>“Print the receipt as soon as a card is read” (or “Automatic receipt”, at the Finish station) prints without asking anything.</li>
      </ul>
      <p>The lists (results, start lists, invoices) go through the system's print dialog. Exported files ask where to be saved: the events'
        folder the first time, then the folder last used.</p>` },
    { id: "readers", title: "Card readers", html: `
      <p>The buttons are the tab's: Prepare › Equipment › “SPORTident”, “Emit” or “Emit eScan”, or the Finish station's ribbon. The
        application chooses the port itself: if there is only one serial port, that one; if there are several, the SPORTident station's;
        if several remain, it asks “Which one is the reader's?”.</p>
      <ul>
        <li>“Set the clock” sets the reader to the computer's time: check the computer's time first.</li>
        <li><b>Emit</b>: the 250 reader and the MTR4. From an eScan or an eScan2 only its status and emiTag passings are received, not the
          cards' content.</li>
      </ul>` },
    { id: "radio", title: "Radio punches (SIRAP)", html: `
      <p>The application listens on <b>TCP port 10000</b> for the punches that radio relays send by the SIRAP protocol. Set the relay, or
        its software, to send to this computer's address, port 10000.</p>
      <ul>
        <li>The punches go to the <b>event opened last</b> in the application.</li>
        <li>They appear at the Speaker station (“Radio punches”). Tick “Radio control” on the unit, at the “Units” station.</li>
        <li>The same punch relayed twice counts once. A whole card sent by a relay is taken as a card read.</li>
        <li>If port 10000 is taken by other timing software, the application starts without the radio, and “About” says so. Close the
          other program and restart the application.</li>
      </ul>` },
    { id: "data", title: "Where the data is", html: `
      <ul>
        <li><b>The events</b>: in Documents › “Ozimut Chrono”, one log per event, <code>&lt;event&gt;.ozchrono.jsonl</code>. Every operation
          is added to it and written to the disk the moment it happens; the file is never rewritten. It is read again when the event is
          reopened (a last line cut by a power failure is skipped). The file <code>hub.json</code>, beside them, keeps the hub's identity
          and the event opened last.</li>
        <li><b>Backing up</b> is copying that folder. A log opens on another computer through File › “Open an event file…”.</li>
        <li><b>The settings</b>: <code>settings.json</code>, in the application's settings folder (<code>%APPDATA%\\Ozimut Chrono</code> on
          Windows): the hub's key and the folder last saved to. A <code>"folder"</code> line, added by hand with the application closed,
          puts the events in another folder.</li>
        <li><b>The application itself sends nothing anywhere.</b> An event exchanges with Ozimut only if the copy was set up from Ozimut's
          tab (“Give the other stations access”).</li>
        <li>The log holds names, clubs, licence and card numbers: keep that folder as you keep your results files.</li>
      </ul>` },
    { id: "update", title: "Updating, uninstalling", html: `
      <ul>
        <li><b>The version</b> is in Help › “About Ozimut Chrono”.</li>
        <li><b>Updating</b>: the application does not update itself. Download the new file from the same place and run it; the installer
          replaces the version in place. For the portable version and the AppImage, replace the file. Events and settings are kept.</li>
        <li>An event file from a newer version is refused with a message: update the application to open it.</li>
        <li><b>Uninstalling</b>: on Windows, Settings › Apps › Ozimut Chrono › Uninstall (portable version: delete the file); on macOS,
          move the application to the Trash; on Linux, delete the AppImage. The events' folder and the settings stay: delete them by hand
          if you wish.</li>
      </ul>` },
    { id: "trouble", title: "If something goes wrong", html: `
      <table>
        <thead><tr><th>What happens</th><th>What to do</th></tr></thead>
        <tbody>
          <tr><td>“Ozimut Chrono cannot start”: ports 8377 to 8387 are all taken.</td><td>The application takes port 8377 or, if it is
            taken, the first free one up to 8387. Close the program that holds them. If the port is not 8377, the address to give the other
            stations changes: “About” gives the right one.</td></tr>
          <tr><td>“The data folder cannot be used”.</td><td>The “Ozimut Chrono” folder of Documents cannot be written to (a protected
            folder, or one being synchronised): free it, or name another folder in <code>settings.json</code>.</td></tr>
          <tr><td>Another computer or a phone does not open the address.</td><td>Check that it is on the same network; that the firewall of
            the application's computer lets it be reached (allow “Ozimut Chrono” on private networks); that the Wi-Fi network does not
            isolate devices from each other, as public networks do; that the address is the one “About” gives.</td></tr>
          <tr><td>The page asks for a key.</td><td>Type what follows <code>?k=</code> in the address “About” gives.</td></tr>
          <tr><td>Windows or the antivirus blocks the application.</td><td>It is not signed yet: see “Downloading and installing”.</td></tr>
          <tr><td>The card reader is not seen.</td><td>Check the cable and the reader's USB driver; close any other program holding its port
            (other timing software, the stations' configuration tool, a Chrono tab open in a browser); unplug and plug it again, then
            “Unplug” and plug the reader in again in Chrono.</td></tr>
          <tr><td>The receipt does not come out.</td><td>Print a “Test receipt”; check the printer chosen, the paper, and that the printer
            prints from another program.</td></tr>
          <tr><td>The radio punches do not arrive.</td><td>“About” says whether port 10000 is taken; check the address and port set on the
            relay, and that the right event was opened last.</td></tr>
          <tr><td>The window stays empty or frozen.</td><td>View › “Reload”. Nothing is lost: the race is in the log.</td></tr>
        </tbody>
      </table>` },
  ],
};
