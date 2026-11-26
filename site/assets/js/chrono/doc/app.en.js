// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The documentation of Chronoz's desktop application, in English (app.fr.js is the reference: the same
// sections under the same ids). Plain data read by the application's own page (src/ui/appdoc.js) and by Orga's
// documentation on the site (content/guide.en.js, chapter « chrono-app »).
export default {
  title: "The Chronoz application",
  lede: "Ozimut's race timing installed on a computer: no Internet needed, the arena's computers linked together, receipts printed without a dialog. This guide is the same in the application (Help › Documentation) and in Orga's documentation on ozimut.com.",
  sections: [
    { id: "what", title: "What the application is for", html: `
      <p>The Chronoz application shows the same screens as the “Chrono” tab of an Orga event on ozimut.com. It also does what a
        browser tab cannot do:</p>
      <ul>
        <li>it works <b>without the Internet</b>;</li>
        <li>it <b>links the arena's computers</b> together: each one that has it keeps the whole race and keeps it up to date with the others,
          with no master computer; phones and screens open the address of any of them in their browser;</li>
        <li>it writes every operation to a <b>log</b>, one file per event in a folder of the computer;</li>
        <li>it prints the receipts <b>without a print dialog</b>;</li>
        <li>it receives the <b>radio punches</b> of relays (SIRAP protocol).</li>
      </ul>
      <p><b>The tab alone is enough</b> when one computer does the timing, or when every station has the Internet: they then keep each
        other up to date through the copy on Ozimut. Plugging in a card reader takes Chrome or Edge. <b>Without the Internet</b>, install the
        application on every computer that reads cards or prints receipts (see “Linking the arena's computers”).</p>
      <p><b>Free software.</b> The application is published under the Mozilla Public License 2.0 (MPL 2.0); its source code is at
        <a href="https://github.com/kerkia/Chronoz" target="_blank" rel="noopener">github.com/kerkia/Chronoz</a>. It works without
        ozimut.com: its links with Ozimut — the event's copy on Ozimut, publishing the results, the live results — are optional. “Ozimut” and
        “Chronoz” remain their author's names: a modified version given to others must carry another name.</p>
      <p><b>Being tested.</b> Like Ozimut's “Chrono” tab, the application has never yet been used with real SPORTident or Emit stations, with a
        receipt printer, or at a real competition, and its links have not yet been tried between real computers on an arena's network. Try it
        at a training session, or alongside your usual software.</p>` },
    { id: "install", title: "Downloading, installing, uninstalling", html: `
      <p>The files are downloaded from the project's releases page:
        <a href="https://github.com/kerkia/Chronoz/releases/latest" target="_blank" rel="noopener">github.com/kerkia/Chronoz/releases/latest</a>.
        The “Download the application” button of Ozimut's “Chrono” tab (Prepare › Connections) leads to the same files.</p>
      <table>
        <thead><tr><th>System</th><th>File</th><th>What it is</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Chronoz-Setup.exe</code></td><td>The installer, recommended (about 100 MB). It installs the
            application for your own account, with no administrator rights, and <b>it then keeps itself up to date</b>.</td></tr>
          <tr><td>Windows</td><td><code>Chronoz-Portable.exe</code></td><td>The portable version: one program, nothing installed. Run it
            from wherever you like, a USB stick for instance. It tells you about new versions but does not update itself.</td></tr>
          <tr><td>macOS</td><td><code>Chronoz.dmg</code></td><td>One disk image for every Mac, Apple silicon and Intel alike: open it
            and drag the application into Applications. It tells you about new versions, to be installed by hand.</td></tr>
          <tr><td>Linux</td><td><code>Chronoz.AppImage</code></td><td>A single file (64-bit). Make it executable — Properties ›
            Permissions, or <code>chmod +x Chronoz.AppImage</code> —, then run it. It keeps itself up to date.</td></tr>
        </tbody>
      </table>
      <p><b>While the application is not signed</b>, the system is wary of it at the first launch:</p>
      <ul>
        <li><b>Windows</b> shows “Windows protected your PC”: choose “More info”, then “Run anyway”.</li>
        <li><b>macOS</b> first refuses to open it. On recent versions: System Settings › Privacy &amp; Security, then “Open Anyway”. On
          older versions: right-click the application, “Open”, then confirm.</li>
      </ul>
      <h3>Uninstalling</h3>
      <ul>
        <li><b>Windows</b> (installer): Settings › Apps › Chronoz › Uninstall. <b>Portable version</b>: delete the file.</li>
        <li><b>macOS</b>: move the application to the Bin.</li>
        <li><b>Linux</b>: delete the AppImage file.</li>
      </ul>
      <p>The events stay in their folder (Documents › “Chronoz”, see “Where the data is”), and the settings in the application's
        settings folder, until you delete them by hand.</p>` },
    { id: "first", title: "First launch", html: `
      <p>The window opens on the home screen: the list “Events”, the card “New event” (a name, a date, the country's rules — France,
        Canada or IOF rules —, then “Create”) and the card “On the network”, the events of the arena's other computers, to be joined with
        their code (see “Linking the arena's computers”). Once an event is open, everything works as in the tab: the stations Prepare, Desk,
        Start, Finish, Monitor, Speaker, Referee, Units and Close, described in Orga's documentation, chapter “Chrono”.</p>
      <ul>
        <li><b>The look</b>: the home screen has a “Theme” choice — ozimut.com's five themes, Day, Clearing, Forest, Undergrowth and Night;
          Day for full sun, Night for night races — and a “Language” choice. By default the theme follows the system's light or dark setting
          (Clearing or Undergrowth), and the language the computer's; the window's menus (File, Help…) always follow the
          system's language. Each device keeps its own choice: a phone or a screen may use another
          theme than the computer.</li>
        <li><b>A laptop</b>: the application's screens are laid out for a laptop. Phones and tablets are for the pages the application serves
          them (speaker, results, referee; see “Phones and screens”).</li>
        <li><b>The events' folder</b> is “Chronoz”, in your Documents; the application creates it. File › “Open the data folder”
          shows it.</li>
        <li><b>An event file</b> (.chronoz) opens with a double-click (with the installed version), or through File › “Open an event
          file…”: its operations join that event in the application, doubling nothing, and the event opens.</li>
        <li><b>One application at a time</b>: launching it a second time brings back the window already open.</li>
        <li><b>The firewall</b>: at the first launch Windows asks whether Chronoz may communicate on the network. Allow it on private
          networks: otherwise the arena's other computers do not find it, and phones cannot open it.</li>
        <li><b>The menu</b>: File (open a file, open the folder, quit), Edit, View (reload, zoom, full screen), Help › “Documentation”
          (<kbd>F1</kbd>), “Check for updates…” and “Keep Chronoz up to date” (see “Updating”), and “About Chronoz”, which gives
          the version, the address to open from phones and other computers (with the application's key), the radio punches' port and the
          data folder.</li>
      </ul>` },
    { id: "hub", title: "Linking the arena's computers", html: `
      <p>Every computer the application runs on is equal: no master, no central computer to choose. Each keeps its own full copy of the race
        and its own log. All they need is to be on the same local network — a Wi-Fi access point or a plain router, with no Internet.</p>
      <h3>How they find each other</h3>
      <p>Every few seconds each application announces on the local network who it is, its version and which events it holds (their name and
        day, never their code). Two applications holding the same event link to each other by themselves and keep each other up to date.
        Links go through any of the computers: it is enough for each one to reach at least one other. A computer that leaves or restarts
        catches up by itself, when it is back, with what was done without it.</p>
      <h3>The event code</h3>
      <p>Every event has a six-character code, letters and digits that cannot be mistaken for one another (never O, 0, I, L or 1). It is
        shown large in Prepare › Connections, card “The arena's other computers”, under “Event code”. It is made by itself with the event,
        in the application as in Ozimut's “Chrono” tab. It protects the event: another computer must know it to link, and it is never
        announced on the network — an application proves it knows the code without saying it.</p>
      <h3>Joining the event from another computer</h3>
      <ol>
        <li>Install the application on that computer and open it.</li>
        <li>Its home screen has a card “On the network”: the events of the arena's other computers, each with the computer holding it
          (“on FINISH-PC”). Click the event.</li>
        <li>Type its code, in upper or lower case, then “Join”. The event opens and fills in within moments. A wrong code is refused: “That is
          not this event's code.”</li>
      </ol>
      <p>The code is asked once only: after that this computer links by itself, at every launch, on any network. Nothing has to be done again
        after a restart.</p>
      <p>In Prepare › Connections, the card “The arena's other computers” gives the code, the computers linked (“2 other computers linked:
        FINISH-PC, DESK-PC”, or “No other computer shares this event yet…”) and the other applications seen on the network. The top bar sums
        it up: “1 other computer linked”, “No other computer”.</p>
      <h3>The same version everywhere</h3>
      <p>The computers of one team must run the same version of the application. When computers linked, or seen on the network, run another
        version, Prepare › Connections says so (“Different versions: … (this computer: …). Update every computer before the race.”) and the
        links chip in the top bar turns orange. Do not time a race with mixed versions: update the computers beforehand (see
        “Updating”).</p>
      <h3>A computer does not show up?</h3>
      <p>Some networks (public Wi-Fi, a school's network) stop computers from finding each other. In Prepare › Connections, open “A computer
        does not show up?”, give the address and key of the other computer's application, then “Connect”. Its menu Help › “About Chronoz”
         gives an address of the form <code>http://192.168.1.20:8377/?k=…</code>: the address is <code>192.168.1.20:8377</code>, the
        key what follows <code>?k=</code>. That link too is kept from one launch to the next.</p>
      <h3>Phones and screens</h3>
      <p>A phone, a tablet or a screen (speaker, results, referee, start list) has nothing to install: its browser opens the address of any
        computer the application runs on. Prepare › Connections gives it (“Phones and screens without the application (speaker, results,
        referee): open <code>http://192.168.1.20:8377/?k=…</code>”), and so does Help › “About Chronoz”. What follows <code>?k=</code>
        is that application's <b>key</b>; without it, the page asks for it in a field marked with a key. Choose the event in the list: this
        station sees the race within moments and writes to it like the others. A station that loses the network carries on alone and
        reconnects by itself when it is back; nothing is lost.</p>
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
      <h3>Card readers and receipt printers</h3>
      <p>A browser lets a page talk to a card reader, or to a receipt printer on a serial port, only when the page comes from a secure
        site or from the computer itself. So a page opened at another computer's address cannot read cards: it suits the start, monitoring,
        the speaker, the referee, a desk without a reader. <b>Every computer that reads cards or prints receipts has the application</b>,
        linked to the others as above.</p>
      <h3>What we advise</h3>
      <ul>
        <li><b>A day or two before the race</b>, at home with the Internet: open the application on every one of the computers, so that they
          all have the same version.</li>
        <li><b>No Internet at the arena</b>: install the application on every computer that reads cards or prints receipts; create (or
          import) the event on one of them; on each of the others, home screen › “On the network” › the event › its code. Phones and screens
          open the address given in Prepare › Connections.</li>
        <li><b>With the Internet</b>: Ozimut's “Chrono” tab everywhere, or the application, which adds silent receipt printing — straight to
          the printer chosen, without a print dialog — and a copy of the race on the computer's disk.</li>
      </ul>
      <p><b>Not yet tried at a real arena.</b> The links have only been tried between several applications on one computer, never yet between
        real laptops on an arena's network. Some networks block the announcements: “A computer does not show up?” is then the way.</p>` },
    { id: "tab", title: "Linking Ozimut's tab to the application", html: `
      <p>An event's “Chrono” tab on ozimut.com is for preparing at home, and for timing at an arena that has the Internet: the stations
        open in the tab keep each other up to date through the copy on Ozimut.</p>
      <p>On a computer the application runs on, the tab can also link to it: Prepare › Connections › “Look for the app on this computer”
        (Chrome or Edge). The top bar then shows “Application”, then the number of other computers linked. From then on the tab's event is
        in the application too, with its log in the folder, and the arena's other computers can join it with its code.</p>
      <p><b>The tab links only to the application of its own computer</b>, never to another's: a secure page (https) may not talk to a plain
        local page (http). With the Internet at the arena, everyone can simply use the tab; without it, use the application on every
        computer.</p>
      <p>What linking the tab to the application is for: the tab is signed in on Ozimut — the copy on Ozimut, the live results, “Publish on
        Ozimut” —, and the application links the arena's computers without the Internet. In the tab, “Give the other stations access” makes a
        key that travels with the race: the application's computers then exchange with Ozimut too when they have the Internet.</p>
      <p>If the tab answers “The Chronoz app was not found on this computer.”: check that it is running and, if the browser asks for
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
        <li><b>The events</b>: in Documents › “Chronoz”, one log per event, <code>&lt;event&gt;.chronoz.jsonl</code>. Every operation
          is added to it and written to the disk the moment it happens; the file is never rewritten. It is read again when the event is
          reopened (a last line cut by a power failure is skipped). Every computer of the arena has its own, complete.</li>
        <li><b>The file <code>hub.json</code></b>, beside them, keeps this computer's identity on the network, the event opened last, the
          event codes typed to join an event and the addresses added by hand (“A computer does not show up?”).</li>
        <li><b>Backing up</b> is copying that folder. A log opens on another computer through File › “Open an event file…”.</li>
        <li><b>The settings</b>: <code>settings.json</code>, in the application's settings folder — <code>%APPDATA%\\Chronoz</code> on
          Windows, <code>~/Library/Application Support/Chronoz</code> on macOS, <code>~/.config/Chronoz</code> on Linux: the
          application's key (the one phones and links added by hand ask for), the folder last saved to and, if you unticked it, the choice
          “Keep Chronoz up to date”. A <code>"folder"</code> line, added by hand with the application closed, puts the events in
          another folder.</li>
        <li>The log holds names, clubs, licence and card numbers, and the event code: keep that folder as you keep your results files.</li>
      </ul>
      <h3>What leaves the computer</h3>
      <p>Everything stays on the computer, and on the arena's computers you link. On the local network the application announces the
        computer's name, its version, and the name and day of its events; it exchanges a race only with the computers that know its code, or
        its key. On the Internet it does only two things: ask GitHub whether a new version exists (see “Updating”; nothing about the
        computer, you or your events is sent), and what you ask of it with ozimut.com — an event exchanges with Ozimut only if the copy was
        set up from Ozimut's tab (“Give the other stations access”).</p>` },
    { id: "update", title: "Updating", html: `
      <p>At start, then every six hours, the application asks GitHub whether a newer version exists. Nothing about the computer, you or your
        events is sent; without the Internet nothing happens. What follows depends on how the application was installed:</p>
      <ul>
        <li><b>Windows, installed with <code>Chronoz-Setup.exe</code>, and Linux (AppImage)</b>: the new version is downloaded in the
          background and installed <b>when the application is closed</b>. A chip “Update x ready” then appears in an event's top bar, and the
          Help menu offers “Restart and install version x”. Restarting at once is never forced; do not do it while cards are being read, as
          the application closes for a minute.</li>
        <li><b>macOS and the Windows portable version</b>: the application only says that a new version exists — chip “Version x available”,
          and Help › “Download version x…”, which opens the download page. Download it and install it by hand, as the first time (see
          “Downloading, installing, uninstalling”).</li>
        <li>Help › “Check for updates…” checks at once and gives the answer. Help › “Keep Chronoz up to date” (ticked by default) stops
          or resumes the checks.</li>
        <li><b>The version</b> running is in Help › “About Chronoz”. Events and settings are kept from one version to the next.</li>
        <li>An event file from a newer version is refused with a message: update the application to open it.</li>
      </ul>
      <h3>Before a race</h3>
      <p>A day or two before, open the application at home with the Internet <b>on every one of the computers</b>, and let it update: they
        will all have the same version. At the arena, without the Internet, the computers linked on an event say when their versions differ
        (Prepare › Connections, and the links chip turns orange): a team should not time a race with mixed versions.</p>
      <p>The application is not signed yet: a version downloaded by hand brings the same Windows or macOS warnings as the first time (see
        “Downloading, installing, uninstalling”).</p>` },
    { id: "trouble", title: "If something goes wrong", html: `
      <table>
        <thead><tr><th>What happens</th><th>What to do</th></tr></thead>
        <tbody>
          <tr><td>“Chronoz cannot start”: ports 8377 to 8387 are all taken.</td><td>The application takes port 8377 or, if it is
            taken, the first free one up to 8387. Close the program that holds them. If the port is not 8377, the address to give phones
            changes: Prepare › Connections and “About” give the right one.</td></tr>
          <tr><td>“The data folder cannot be used”.</td><td>The “Chronoz” folder of Documents cannot be written to (a protected
            folder, or one being synchronised): free it, or name another folder in <code>settings.json</code>.</td></tr>
          <tr><td>Another computer does not show up in “On the network”, the bar says “No other computer”, or “The other computer does not
            answer.”</td><td>Check that it is on, that the application is running on it and that it is on the same network. At the first
            launch Windows asks once to allow Chronoz on private networks: accept (otherwise allow it in the Windows firewall). Some
            Wi-Fi networks isolate devices from each other or block the announcements, as public and school networks do: then use “A computer
            does not show up?”. UDP port 8379 (the announcements) and TCP port 8377 (the links and the pages) must pass between the
            computers.</td></tr>
          <tr><td>“That is not this event's code.”</td><td>Type again the code shown on the other computer, in Prepare › Connections. It never
            contains O, 0, I, L or 1.</td></tr>
          <tr><td>“Different versions: …”, or the links chip is orange.</td><td>The computers linked do not run the same version. Update them
            all with the Internet before the race (see “Updating”); without the Internet at the arena, install on each the same file,
            downloaded beforehand.</td></tr>
          <tr><td>Help › “Check for updates…” answers “The update server could not be reached.”</td><td>The computer has no Internet, or
            GitHub does not answer. No hurry: the application checks again at start and every six hours.</td></tr>
          <tr><td>A phone does not open the address.</td><td>Check that it is on the same network as the computer, that the computer's firewall
            lets “Chronoz” through, that the Wi-Fi does not isolate devices from each other, and that the address is the one in Prepare ›
            Connections or “About”.</td></tr>
          <tr><td>The page asks for a key.</td><td>Type what follows <code>?k=</code> in the address given by Prepare › Connections or
            “About”.</td></tr>
          <tr><td>Windows or the antivirus blocks the application.</td><td>It is not signed yet: see “Downloading, installing,
            uninstalling”.</td></tr>
          <tr><td>The card reader is not seen.</td><td>Check the cable and the reader's USB driver; close any other program holding its port
            (other timing software, the stations' configuration tool, a Chrono tab open in a browser); unplug and plug it again, then
            “Unplug” and plug the reader in again in Chronoz.</td></tr>
          <tr><td>The receipt does not come out.</td><td>Print a “Test receipt”; check the printer chosen, the paper, and that the printer
            prints from another program.</td></tr>
          <tr><td>The radio punches do not arrive.</td><td>“About” says whether port 10000 is taken; check the address and port set on the
            relay, and that the right event was opened last.</td></tr>
          <tr><td>The window stays empty or frozen.</td><td>View › “Reload”. Nothing is lost: the race is in the log.</td></tr>
        </tbody>
      </table>` },
  ],
};
