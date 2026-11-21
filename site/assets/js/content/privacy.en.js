// The privacy policy and legal notices, in English — a translation for information; the French version (privacy.fr.js)
// prevails. Keep the two in step.
// world: registration open to every orienteer (privacy.fr.js, which prevails).
export const body = (SITE, { world = false } = {}) => `
      <p class="muted"><i>This English version is provided for information; the French version prevails.</i></p>
      <p>${SITE} is an independent site, not affiliated with the French orienteering federation (FFCO). It is published on a
        personal, non-commercial basis by <b>Yann Le Helloco</b>, controller of the personal data described below within the
        meaning of Regulation (EU) 2016/679 (GDPR). Contact: <b>contact@ozimut.com</b>.</p>
      <h2 style="font-size:16px">Terms of use</h2>
      <p>${SITE} runs on free, limited resources shared by all its users. It is meant to be consulted personally by ${world ? "its users" : "licence holders"}, with a web browser. Unless the publisher has agreed beforehand, the following are therefore forbidden: automated
        collection (robots, scripts, scraping of pages or data files), the use of its content to train, fine-tune or feed artificial intelligence models, mass downloads, reuse of the data for other purposes, and any
        use likely to overload the site at the expense of other users. An account that breaks these rules may be suspended.</p>
      <p>For a particular need (a study, the needs of a club or a region, data meant for another tool), you can write to the
        publisher, through the “Contact us” page or at contact@ozimut.com: the request will be considered.</p>
      <h2 style="font-size:16px">Independence and sources</h2>
      <p>${SITE} is independent, unofficial and free, not affiliated with any federation or organiser. Its sources: for France, the results,
        the national ranking (CN) and the calendar published by the French orienteering federation (FFCO) on cn.ffcorientation.fr
        and ffcorientation.fr, which remain the reference; for Spain, the calendar and entries published by the Spanish federation
        (FEDO) on sico.fedo.org, and the results published on O-Replay (oreplay.es); for every race, the results and start times
        the organisers publish (their website, liveresultat, WinSplits, Helga, Orientation Data, O-Replay) or upload to ${SITE}.</p>
      <p>The other countries' calendars come from those their federations publish, each named under the event (“View on …”). An
        event's region and county (or their equivalent) are found from its venue with GeoNames' place names
        (<a href="https://www.geonames.org/" target="_blank" rel="noopener">geonames.org</a>), licensed under
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">Creative Commons Attribution
        4.0</a>.</p>
      <p>For Spain, ${SITE} takes the races' public results (name, club, category, time, split times) and the number of entries per
        category; to recognise the same runner from one race to the next, it also reads the FEDO's public list of licence holders
        (name, club, regional federation, licence and card numbers), of which it shows no number. These results being public, everyone can see them, with or without an account.
        Anyone concerned may ask no longer to be identified in them (see “Your rights”).</p>
      <h2 style="font-size:16px">Access and pictures of the site</h2>
      <p>${SITE} is entirely free. Part of the site can be read without an account; an account opens alerts and track sharing,
        and the ranking's whole history is kept to the federation's licence holders: in France, an account that joined France, its
        FFCO licence number checked against the name. Countries whose results are all public (Spain) are open to everyone.</p>
      <p>The screenshots on the home page are taken on a scrambled copy of the data: names, licences, clubs and times are invented
        or altered and match nobody. The panels marked “Mockup” are illustrations.</p>
      <h2 style="font-size:16px">Results data, including that of licence holders without an account</h2>
      <p>The rankings, results and calculations shown come from the results published by the FFCO on cn.ffcorientation.fr: the
        name, club, class, licence number, time and place of each ranked licence holder, whether or not they have an account on
        ${SITE}, minors included. ${SITE} derives from them recomputed CNs, rankings, comparisons and statistics (clubs, territories,
        age pyramid, runners met in races). The “Results” page also shows, for the races of the last 60 days, the results published
        by the organisers themselves (on their website, liveresultat, WinSplits, Helga, etc.) or uploaded to ${SITE}, matched to
        licences by name and club.</p>
      <p>This processing is based on the publisher's legitimate interest in informing licence holders and analysing the national
        ranking from results already published. On ${SITE} it is open as far as the FFCO publishes it itself: without an
        account${world ? ", or with an account that has not joined France," : ""} one sees the races, results and ranking of the seasons
        the FFCO shows on its website without asking for a login, and the results published by the organisers (name, club, class,
        time), with no CN or score. The older seasons, which the FFCO keeps to its licence holders, and the histories and statistics
        drawn from them are only accessible to logged-in accounts${world ? " that have joined France" : ""}, whose FFCO licence number is
        checked against their name. The one exception: the publisher
        may open, for a limited time, a demo account for an orienteering body (federation, league, club) that wants to see the
        site; it is tied to no licence, can't change or upload anything and stops working on the date set. Anyone concerned may ask for it to be corrected or ask no longer to be identified (see “Your rights”);
        the source remains the FFCO's website.</p>
      <h2 style="font-size:16px">Directory of clubs, committees and regions</h2>
      <p>The “Directory” tab of the Clubs page shows, for each FFCO region (ligue), departmental committee and club, what the FFCO
        publishes on its structure pages and club directory: its number, its website and its contact details — the names and roles
        of its board members (president, secretary, treasurer), its phone number and e-mail address. The postal address is not
        kept. These contact details are shown only to logged-in accounts whose FFCO licence is checked (not to visitors without an
        account, nor to demo accounts), and are read again every week: what the FFCO removes disappears from ${SITE} at the next
        reading. Legal basis: the publisher's legitimate interest in helping licence holders reach the bodies of their sport, from
        information the FFCO publishes itself. Anyone concerned may object or ask for a correction (see “Your rights”); the source
        remains the FFCO's website.</p>
      <h2 style="font-size:16px">Results and start-list uploads</h2>
      <p>When a results file is uploaded, the uploader's account, the race, the file's name and size and the date of the upload are
        recorded. The file is kept for 60 days in the site's storage (Cloudflare), then erased; the results it contains remain on
        display. The administrator sees who made each upload and can remove an upload. The start lists an organiser uploads before
        the race (an event's “Starts” tab, in Orga) follow the same rules; only the names, clubs, classes and start times are published,
        and the race's organisers can remove them. A competition an organiser creates off the federation's calendar (see “Organisers' events”) is
        published in the Calendar with its name, date, place, club, discipline and website, without who created it being published. An organiser can also give the link to their
        competition's GPS tracking on another service (their event's “Live” tab): only that link is published, the account that gave it
        is kept and not published; Ozimut receives no position.</p>
      <h2 style="font-size:16px">Organisers' events (Orga)</h2>
      <p>An account that creates an event — a race or a training session — in Orga forms its team. The site keeps: the event's
        description (name, date, place, club, discipline, format, website) and the account that created it; its link, if any, to a
        competition of the federation's calendar; its team (the member accounts, the date each joined and the member who accepted them);
        the requests to join it (the account asking, an optional message of up to 300 characters, the date, the answer and the member who
        gave it). Nobody is added to a team by their name, licence or e-mail address: people ask to join, and a member accepts or declines;
        the members are told of a request, and the person of the answer, by notification. A team's members see each other's names and
        clubs, and those of the people asking to join; other accounts see of a team only the first name and initial of up to two of its
        members. The site's administrators see the events and confirm the links asked for by accounts that are not members of the
        organising club. Legal basis: the performance of the service requested. When an account is deleted, it leaves its teams and its
        requests are erased; an event whose last member it was stays in the administrators' hands, and what the event published stays. A course setting tied to an event keeps its own team (see “Course setting”): the
        event's team sees only that it exists, the name of whoever started it and how many people are in its setting team.</p>
      <h2 style="font-size:16px">GPS track analyses</h2>
      <p>The “Solo analysis” page reads the map and the GPS track in your browser: no data is sent to the site, and these files are
        kept only for the duration of the visit.</p>
      <p>In the analysis of a training session or a competition, the organiser uploads the maps and the courses, and each participant can
        add their own track. It is then sent to and kept in the site's storage (Cloudflare), with the participant's name and licence
        number, reduced to the positions and times within the map's area (without heart rate, cadence or any route off the map). It
        is visible to the people allowed to open the analysis, as the organiser chooses: all logged-in licence holders, the members
        of their club, or those who hold the password. Each participant can remove their track at any time; it is erased with the
        analysis and with their account. An analysis's maps are kept as long as it exists; if the organiser deletes their account,
        the analysis remains, without their name. The OCAD or Mapper files its circuits come from are kept only if the organiser chooses so (“Make them available to the event's course setting”, ticked by default): only the analysis's organisers have access to them, for the event's course setting, and they are deleted with it. In an event's analysis, your own graphs (pace, heart rate, cadence, etc.) come from
        your file, kept in your browser on this device: it is not sent, and only you have access to it.</p>
      <p>The comment you write on your race is seen by
        the same people as your trace; you change or delete it at any time. If the organiser opens the analysis to visitors without an
        account, your trace and your comment are shown to them only if you agree (a box unticked by default), with your name but
        without your licence number; you withdraw that agreement at any time. In « My maps », the comment you write on a run is kept
        with it and follows the same rules.</p>
      <p>To help the organiser decide (publish, open or close a feature), an analysis counts who opens it and who replays a course
        alone in “Solo analysis” on its map: your account's number, the first and the last day, and the number of days, once a day at
        most; for visitors without an account, a number per day only. The organisers see totals only, never who; they are not counted
        themselves. These records are erased with the analysis, with the course concerned and with your account.</p>
      <h2 style="font-size:16px">My maps</h2>
      <p>“My maps” keeps the maps you save there (from “Solo analysis”) or import (QuickRoute or Ozimut JPEG files), and the routes
        you ran on them, in the site's storage (Cloudflare): the map's image as you gave it, its title, date, place and your notes, and
        for each race the positions on the map and the times, never the GPS file itself. Heart rate, altitude and cadence are kept only
        if you tick the box for it (unticked by default): these are health data, kept with your consent, which you withdraw by deleting
        the race. These maps are visible to you alone. If you create a sharing link (to all your maps or to one), anyone holding the
        link sees them with your name, even without an account, but never your heart rate or other personal data; deleting the link
        ends the sharing. You can delete a race or a map at any time; everything is erased with your account. A request to import from
        DOMA is a message sent to the Ozimut team, like those of “Contact us”.</p>
      <p>If you tick “Save the analysis” beside “View the race” in “Solo analysis” (ticked by default), the map and your race — positions and times only, nothing else from the watch — are kept in your account, apart from “My maps”: you alone see them, in “Analysis”, where you replay or delete the analysis. A map is kept there once and goes with the last analysis showing it.</p>
      <p>A “My maps” library holds 1 GB at most (the original maps and the runs). The site's administrators may see the maps sent to Ozimut — in “My maps”, “Solo analysis”, the organisers' analyses and course setting — and keep a copy of them, except those you mark “Private map” when sending them in “My maps”, “Solo analysis” or course setting; never your runs, your comments or the courses, nor an encrypted event's map. These maps stay when the account is deleted, without your name.</p>
      <h2 style="font-size:16px">GPS tracking and My tracks</h2>
      <p>GPS tracking (on trial, for now open only to the site's administrators and the accounts they invite) records an account's position during a run, one position a second, with the Ozimut app on a phone, an Apple Watch or Garmin watch, or the Traccar Client app. Nothing is recorded outside a run started by the person (or by their parent on their device). Kept: the positions, their time and accuracy, the altitude when the device gives it, the device's battery; for each device, its kind, model, app version, the date it was last seen, and its system's notification token (Google or Apple) to send it the alerts. Positions are sent in batches and kept in the site's storage (Cloudflare, European Union and United States); a run is kept 30 days in « My tracks », longer only if you open it in an analysis or keep it in « My maps ».</p>
      <p>Only the accounts the person, or their parent, has explicitly allowed by an invitation see a run live and receive its alerts (start, finish, call for help, no position, not moving, low battery, leaving the area); that permission can be withdrawn at any time. A run marked private is seen by nobody else. Imported tracks (a file, Apple Health, Polar) stay private. Linking Polar gives Ozimut access to your Polar workouts until you withdraw it; Ozimut keeps only each one's GPS route.</p>
      <h2 style="font-size:16px">Children's accounts</h2>
      <p>Once tracking is open to everyone, nobody under 15 creates an account alone: registration asks for the year of birth, and for a younger child a parent creates and manages the account, with no email address or password. The parent pairs the child's devices, chooses who may follow them and may delete the account at any time; a second parent can be added by an invitation. A child's account keeps only the first name, last name, year of birth, possibly the licence number, and the tracks. A personal account already opened by someone under 15 waits for a parent to be attached: until then its tracks stay private and no alert is sent. From 15 the young person may take the account in hand (their own address and password), their tracks and history remaining theirs, and their parents becoming people who may follow them, which they can change. When a parent deletes their account, the account of a child they were the only parent of is deleted with all its tracks.</p>
      <h2 style="font-size:16px">Race timing (Ozimut Chrono)</h2>
      <p>Ozimut Chrono, the organisers' race-timing tool (on trial, for the site's administrators only for now), works first on the organiser's computer: a race's entries (family and given name, club, class, licence number, card number, start time, fee and payment), the content of the cards read and the corrections made by hand are kept there, in the browser or in the app. When the station is linked to Ozimut, these operations are copied to Ozimut so that the race can be taken over on another computer; only the event's organisers reach them, and nothing is published without their action (live results, the publication of the results). The federation's file of licensees and the card numbers remembered from one race to the next stay on the organiser's computer: they are not sent to Ozimut.</p>
      <h2 style="font-size:16px">Start time booking</h2>
      <p>When a competition's organisers open its start times to booking, an account books a start for itself and for the runners
        it adds to “My runners” (its family, friends, members of a club or not): their first and last names, the club and its
        country, the FFCO licence number if given, and the card number if the organisers ask for it. The account that adds them
        undertakes to do so with their agreement. The grid of start times (each runner's name and club) is public, as a start list
        is; the licence and card numbers are seen only by the account that booked and by the organisers. At the closing, the
        bookings become the competition's published start list. “My runners” and the bookings of competitions still to come are
        deleted with the account; those of past competitions stay in their start list.</p>
      <h2 style="font-size:16px">From your phone</h2>
      <p>“From my phone” takes a photo of the map or a file (a trace) from your phone to your computer: the file waits in the site's storage (Cloudflare) under a one-time link, valid for 15 minutes, and is deleted as soon as the computer has received it or you close the code's window; a file never received is deleted the next day at the latest. Neither the link nor the file carries your name, and no account is needed on the phone.</p>
      <h2 style="font-size:16px">Health: articles and copyright</h2>
      <p>The “Health” page, open to the accounts the publisher allows, publishes articles written by their authors. An article is
        kept in the site's database (Cloudflare) with its author's name, shown with it, and its images in the site's file storage; it
        is erased when its author or the publisher deletes it. If the author deletes their account, their articles stay published
        under their name, unless they ask for them to be withdrawn (contact@ozimut.com). Likes are recorded per account; only their
        number is shown. Each article is translated automatically into English and French (except its own language) by Ozimut's language model, run
        by Cloudflare (Workers AI), which does not keep it; the translation is kept with the article and marked as such.</p>
      <p><b>Copyright.</b> Each author keeps all the copyright in their articles (the texts and images they created), moral rights
        included, and remains free to publish them elsewhere, in the form and on the terms they choose. By publishing an article on
        ${SITE}, they only grant the publisher a free, non-exclusive permission, for as long as it is published, to store it, to show it
        to the readers of the “Health” page, to translate it automatically into the site's languages, to use its title, summary and
        opening lines in lists and alerts, and to adapt its presentation (layout, image sizes) without changing its meaning. This
        permission ends when the article is deleted; alerts already sent cannot be recalled. The author warrants that the texts and
        images they publish are their own or that they have the right to use them.</p>
      <p>Any reproduction, performance or distribution of an article, in whole or in part, by anyone else requires its author's prior
        permission, subject to the exceptions the law provides, in particular short quotations naming the author and the source
        (article L. 122-5 of the French Intellectual Property Code). The automatic translations are adaptations of the article and
        follow the same rules.</p>
      <h2 style="font-size:16px">Carto</h2>
      <p>A map in Carto (the map's document, the OCAD file it came from, its backgrounds, its versions, the team's comments and photos) is kept in the site's storage (Cloudflare) and only its team can open it: its creator and the people who join through an invitation link (nobody is looked up by name or e-mail address); their name and account are recorded with their role. Online backgrounds (IGN's aerial photos and maps, OpenStreetMap) are read at each opening and not kept; for open data (IGN's heights, OpenStreetMap, LiDAR), only the extent of the area is sent to those services. The town plan (sprint) is computed by Ozimut's servers (GitHub), which receive only the area's centre and size; the request, with your account's number, and the map made are kept 30 days. The field mode's GPS position stays in your browser, except a track you choose to save as a background. When the account is deleted, each map it created goes to the first mapper of its team, otherwise it is deleted with everything it holds.</p>
      <h2 style="font-size:16px">Course setting</h2>
      <p>An event of the “Course setting” page (its courses, its map, its versions, the team's comments and the states of the
        controls noted in field mode) is kept in the site's storage (Cloudflare) and is only accessible to its team: its creator and
        the people who join it by an invitation link the team gave them (nobody is looked up by name, licence or email address);
        their name, their account and, for an FFCO licence holder, the licence are recorded with their role.
        Versions, comments and control
        states carry their author's name. In field mode, the state noted on a control also records the phone's position at that
        moment (to compare it with the map), visible to the team, and the team can attach photos of the controls (they may show
        people: avoid it), erased with the event; the position is only read during that mode, with the browser's permission. If the
        team encrypts the event, this data is encrypted in the browser and unreadable by the site. The event is kept until its
        creator deletes it; if the creator deletes their account, it passes to the team's first course setter (failing that,
        controller) who has an account, otherwise it is deleted. The climb calculation sends to IGN's elevation service
        (Géoplateforme, France) only the coordinates of the controls and of the courses' bends, with no name or code.</p>
      <h2 style="font-size:16px">Games leaderboard</h2>
      <p>When you are signed in, each finished game (« Games ») sends its result: it is kept under your
        account's name if it is one of your 20 best for that game, and shown to the other accounts if it is among everyone's 20 best.
        The result, its settings and the date only; nothing is kept of a visitor's games without an account. These results are
        deleted with your account.</p>
      <h2 style="font-size:16px">Pixel</h2>
      <p>Each race you finish in Pixel is kept under your account's name: its time, its split times, the distance run and its
        route in the virtual forest, shown to the other accounts in that course's results, ranking and analysis; you are told apart
        from one race to the next by a fingerprint of your account, never by its number. Nothing is kept of a visitor's races. An
        organiser who makes an event sends their OCAD map (and, if they wish, their courses): it is kept in the site's storage, shown
        only to the event's runners, in the game, once they have published it, and used to build the race on GitHub, where it is not
        kept. These races, and the events with their maps and results, are deleted with your account.</p>
      <h2 style="font-size:16px">Questions to the AI</h2>
      <p>On the “AI” page, your question is sent to the language model that writes the query, with the description of the site's
        tables, today's date, your licence number and the chosen method and discipline: by default Ozimut's model, run by Cloudflare
        (Workers AI); neither the site nor Cloudflare keeps the questions. The query then runs in your browser, on the data the site
        publishes: that data is sent to no model. If you use your own API key (Anthropic, OpenAI, Google or OpenRouter), your browser
        sends these same elements directly to that provider, under your account and its terms (with a free key, Google may use the
        questions to improve its products); the key stays in your browser and is never sent to Ozimut.</p>
      <h2 style="font-size:16px">Your account's data</h2>
      <ul>
        <li><b>Data kept:</b> the email address; the first name and surname entered; the countries joined, each with the club and
          member number given, and for France the licence number, checked against the results published by the FFCO; the password, in an irreversibly encrypted form; the dates of registration and last
          login; the language chosen for the site and the emails; the alert settings (regions chosen) and the list of races already announced by email; for the relay simulator, the
          runners added (name, class, estimated CN) and those marked unavailable, visible to you alone. Only add people who agree to
          it.</li>
        <li><b>Purposes and legal bases:</b> performing the service requested when the account is created (reserving ${world ? "the FFCO's data to its licence holders" : "access to FFCO licence holders"}, confirming the email address, resetting the password); the publisher's legitimate interest in detecting
          several accounts for the same licence; your consent for alerts by email or notification, which you can withdraw at any time in Settings.</li>
        <li><b>Retention period:</b> until the account is deleted, which you can do at any time in Settings. An email waiting to be
          sent is erased as soon as it is sent.</li>
        <li><b>Recipients:</b> the site's administrator and the technical providers listed below. No data is sold or used for
          advertising.</li>
      </ul>
      <p>A message sent through the “Contact us” page reaches the publisher by email, with your address, your name and the browser
        used; it is kept in their mailbox for as long as needed to handle the request.</p>
      <h2 style="font-size:16px">Notifications</h2>
      <p>If you allow Ozimut's notifications on a device, the site keeps, for that device, the sending address given to it by your
        browser's notification service (Google for Chrome and Android, Apple for Safari, Mozilla for Firefox, Microsoft for Edge), the
        keys used to encrypt the messages and the kind of device (for example “Chrome · Android”). The messages (your start time,
        your results going online, the calendar's races, as you chose) are encrypted end to end: the notification service carries
        them without being able to read them. The site also keeps the last start time notified for each race, so that it is sent
        again only if it changes, and the notifications waiting to be sent, for a few days at most. Legal basis: your consent, given
        by allowing notifications and withdrawn at any time in Settings or in your browser's settings. These data are erased when you
        turn notifications off on the device, when you sign out on that device, and with the account.</p>
      <h2 style="font-size:16px">Usage statistics</h2>
      <p>To know how the site is used and to improve it (legitimate interest), the site records, for each account, the number of
        pages viewed per day and per section (Ranking, Runner, Network, etc.) and the number of visits. No other data is recorded for
        this purpose: neither the searches made nor the IP address. These statistics are only accessible to the administrator; they
        are kept for 13 months and deleted with the account. With each page view the site also notes how long the page took
        to show and to react, to follow its speed. These times are counted by day, page and version of the site, with no link
        to the account.</p>
      <h2 style="font-size:16px">Security</h2>
      <p>To limit repeated attempts (login, registration, forgotten password), the site counts the attempts per IP address and per
        email address (legitimate interest); these counters are erased after about a day. The host may also process the IP address to
        deliver the pages and protect the site against attacks.</p>
      <h2 style="font-size:16px">Providers and transfers outside the European Union</h2>
      <p>The following providers process data on the publisher's behalf:</p>
      <ul>
        <li><b>Cloudflare, Inc.</b> (United States) hosts the site, its account database and its file storage, and runs the language
          model of the “AI” page and the one that translates the articles of the “Health” page; at registration and when entering without an account, its Turnstile service checks that the site is used by a person rather
          than a robot, by examining the browser, with no advertising cookie and no tracking from one site to another. Transfers to the United States rely on the EU-US Data Privacy Framework, to which Cloudflare has
          signed up.</li>
        <li><b>Resend</b> (Plus Five Five, Inc., United States) sends the site's emails, which involves the recipient's address and
          the content of the message. Transfers are covered by the European Commission's standard contractual clauses.</li>
        <li><b>Scaleway</b> (Scaleway SAS, France) sends the emails that Resend's free plan cannot take, which involves the same
          data; it stays in the European Union (Paris).</li>
        <li><b>GitHub, Inc.</b> (United States) runs the site's automatic updates; the results and uploaded files are processed there,
          but not the account data. Transfers are covered by the standard contractual clauses.</li>
      </ul>
      <h2 style="font-size:16px">Cookies and local storage</h2>
      <p>The site sets a cookie strictly necessary for it to work: it keeps you logged in, for 30 days at most; a visit without an
        account gets another one, which for 12 hours attests that the anti-robot check was passed and holds nothing else. The browser
        also keeps, on your device, your display preferences (language, theme, chosen discipline and method), what you enter in the MAS
        calculator or the relay simulator and, for course setting, its display settings, the key of an encrypted event, derived from
        its passphrase (for the duration of the tab), the field-mode states waiting for the network and, if you keep an event to work
        offline, its copy (courses and map, encrypted if it is) and the site's files, erased when you log out; if you use your own API
        key on the “AI” page, that key (for the duration of the tab, or on the device if you ask; erased when you log out). The site
        uses no advertising tracker and no third-party audience measurement tool; no consent is therefore required.</p>
      <h2 style="font-size:16px">Your rights</h2>
      <p>Under the GDPR, you have a right of access, rectification, erasure and portability of your data, a right to restrict its
        processing and a right to object to processing based on the publisher's legitimate interest.</p>
      <p>In particular, you can ask no longer to be identified on ${SITE}, unless there are compelling legitimate grounds: your name
        and licence number are then replaced, throughout the site, by an anonymous mention (“Anonymous runner”). Your times and places
        are still taken into account, without your name or licence number, so that the other licence holders' rankings are not
        changed; the measure can be reversed at your request. A request to erase results data is handled in the same way; an
        account, on the other hand, is deleted entirely. The data of a minor licence holder is anonymised, and their account deleted
        if they have one, on simple request by their legal representative, who exercises these rights on their behalf.</p>
      <p>You can delete your account yourself, in Settings. Other requests should be sent to contact@ozimut.com; they are answered within
        one month. If there is reasonable doubt about the requester's identity, proof may be requested. If you consider that your
        rights are not respected, you can lodge a complaint with the CNIL
        (<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr/fr/plaintes</a>), the French data
        protection authority.</p>
      <h2 style="font-size:16px">Legal notices</h2>
      <p><b>Publisher and publication director:</b> Yann Le Helloco, private individual, non-professional publication;
        contact: contact@ozimut.com.<br>
        <b>Host:</b> Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, United States; telephone: +1 888 993 5273.</p>
      <p><b>Intellectual property:</b> the site's texts, illustrations, design and code are protected by copyright; unless stated
        otherwise they belong to the publisher, and reproducing them requires the publisher's permission. The articles of the “Health” page belong
        to their authors (see “Health: articles and copyright”). The results, official rankings and calendars the site takes up remain
        those of their sources (see “Independence and sources”); elements from third parties are credited below.</p>
      <p><b>Credits:</b> the control description symbols and texts (Coach › Control descriptions, the course setting) come from Purple
        Pen, by Peter Golde (<a href="https://github.com/petergolde/PurplePen" target="_blank" rel="noopener">github.com/petergolde/PurplePen</a>),
        under the <a href="assets/tracer/LICENSE-PurplePen.txt" target="_blank" rel="noopener">BSD licence</a>.</p>
      <p class="muted">Last updated: 21 November 2026.</p>
`;
