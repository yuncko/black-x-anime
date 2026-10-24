# APK real-touch regression suite

Run it after every APK build (and after any change to the mobile UI or the player):

```bash
bash tools/apk/touch-test/run.sh                 # all scenarios, ~4 min
ONLY=nav,player bash tools/apk/touch-test/run.sh  # some scenarios
APK=/path/to/other.apk bash tools/apk/touch-test/run.sh
```

`run.sh` works in `$WORK` (default `/tmp/bx-touch`), never in the repository:

1. installs `puppeteer-core` + `@sparticuz/chromium` there (first run only, ~3 s);
2. makes a 24-minute WebM test video (system `ffmpeg`, or the `imageio-ffmpeg` wheel from PyPI);
3. extracts `assets/public/` from the APK, so the files that ship are the files tested;
4. runs `suite.mjs`: one headless browser per scenario, a 412×915 phone viewport, the APK's
   `https://localhost` behaviour (`window.__BLACKX_APK__`) and a recording stub of the native
   `BlackXNativeAuth` bridge.

Every network call is answered by in-memory mocks in `lib.mjs` (website `/api/*` — the APK calls
black-x-anime.ai.studio since v18.1, black-x-anime.me before; both go to the mock —, the Algolia
catalogue, Firestore `settings/*`, AniList), so results never depend on the live site; the test
server answers video `Range` requests with 206 (without that every seek restarts at 0).
Taps and swipes are CDP touch events (`page.touchscreen`), never `element.click()`, because the
v16.0 bug (no tab could be scrolled by finger) passed every mouse/JS-click check.

Scenarios (213 checks): `nav` (dock, finger scroll on pages and rails, directional view
transitions, avatar → profile, menu, long press → quick peek, language switch), `search` (grid,
typing, recent searches, filter sheet), `catalog` ("load more" stops at Algolia's pagination
limit with a note instead of a dead button; the mock caps paging like `paginationLimitedTo`), `genres` (Ecchi,
Harem and Isekai never show up: home rows, latest episodes, search and its total, filter sheet, typed
search, title pages, schedule, manga, AniList query, saved lists and menu counts; hidden titles lead
every mock list), `schedule` (opens on today), `player` (resume, auto-hide,
pause, ±10 s buttons and double tap, intro marks, full screen + native immersive call, settings
sheet over the player, ±10 min, speed, lock, next episode, saved position, back order sheet →
full screen → player → details → home), `manga` (chapters, reader pages, immersive, finger
scroll), `community` (guest), `logged` (one like per account, posting, the API host is
black-x-anime.ai.studio and never black-x-anime.me, account deletion: the button waits for the typed
user name, the user name + password go to `/api/app/account/delete`, then the app signs out), `bundle` (APK v18: the
air-time reminders handed to `BlackXNativeAuth.scheduleEpisodeAlarms` — one per followed title with a
real air time, never an empty list —, the alerts sheet saying so, the menu's «على الموقع بس» page and
no website pages, «على الداتا», the sleep-timer chip and its cancel, a watch-party room by code
without the website's invite link, no preview card / quick search), `profile` (guest sign-in
hero, grouped rows, sub-pages pushed with a back button and popped by the phone back button, my
list grid + empty state, watch history with episode / time left / day groups and Latin titles
aligned in RTL, reading history chapter + cover, settings switches and segments saved, splash
choice, incognito + PIN lock, guest VIP → sign-in page, username sign-in that closes itself,
member header stats, locked / unlocked titles, profile edit saved to the account, request to the
developer, sign-out confirmation closed by back, menu shortcuts, a pre-v16 account without a
session can still open the sign-in page) and `motion` (reduced motion,
rapid taps, taps during a running transition).

A pass here is necessary, not sufficient: it does not replace a test on a real phone.

## The website (every device = the app interface; the classic pages by choice)

```bash
bash tools/apk/touch-test/run-web.sh                    # builds the website into /tmp, ~5 min
ONLY=links,back bash tools/apk/touch-test/run-web.sh    # some scenarios
DIST=/path/to/website/build bash tools/apk/touch-test/run-web.sh
```

`web-suite.mjs` (278 checks) opens the **website build** with the same mocks (`openWeb()` in `lib.mjs`:
the site's same-origin `/api/*` goes to the mock, Google Fonts are answered with the bundled fonts so
Arabic renders in screenshots). A 412×915 touch phone with a phone browser user agent, or a 1440×900
computer with a mouse; since 2026-10-17 both get the app interface. Scenarios: `boot` (phone and
computer → app interface, the computer's side rail, an old saved «site» choice ignored, `?ui=site` →
classic pages remembered under `bx_web_ui_v2`, footer «واجهة Hearbor الجديدة» back, no APK update card),
`links` (`/show`, `/watch`, `/discover`, `/browse`, `/community`, `/trending?q=`, `/profile/...`,
`/mylist`, manga chapter links, hidden and dead links), `sync` (the address bar follows the page),
`back` (browser back steps back one app level, leaves the site at home, no piled-up history, no entry
before the first tap), `profile` (Android download and «التصميم القديم للموقع» rows, Google opens
Firebase's popup, not the APK window), `player` (+10 s, browser full screen + landscape), `genres`,
`desktop` (the CLASSIC computer pages, opened with `ui: 'site'`: home without invented values — no
«👑 FHD» on the cards, no guessed «يعرض الآن», no «الحلقة ٠», the episode label clear of the alert
bell, a weekly schedule built from real air times; hidden titles «مش متاح», AniList queries with the
exclusions, the player page as VIP Monarch without the fake 4K/CDN/early-access features, the free
visitor's upgrade button, the loader, the VIP plan cards with only real perks at unchanged prices and
no struck-through «old price», the watch-party panel without an invented viewer count), `features`
(the 2026-10-17 app updates on a phone: wide «بيتعرض دلوقتي» cards and today's circles with the real
air time; the schedule tab ordered by real air time with a live countdown, «الأسبوع الجاي», «من غير ميعاد
معروف» and the Japanese-broadcast note; the alerts sheet without the fake «ACTIVE» badge and a test
notification that says «تجربة»; details without empty tabs or «(0)»; one search box + one «خيارات» sheet
for episodes; manga quick searches from AniList (with the exclusions) and one server/type filter sheet,
no fake 68 % bar; community spoiler cover (also for the «فيه حرق» category) and the anime card that opens
the fresh record; composer tying a post to an anime; profile watch stats from seeded positions) and
`wide` (the computer layout: side rail, start-aligned hero with the landscape banner, bigger posters,
rail arrows only after a mouse moves and a click scrolls a screen, a 6+ column search grid, sheets as
centred dialogs, the title page next to the rail, the player capped to the screen height with Space/K,
→, M, F and a mouse click, the classic-website link) and `bundle` (what only the website has: the mouse
preview card and its buttons, middle click / Ctrl+click → new tab, Ctrl+K and «/» quick search,
«?» shortcuts, cinema mode beside / under the video with its button and «T», `/rankings` with
Hearbor votes only where someone voted (shown out of 10: the API's `communityScore` is 0–100, so the mock
sends 85 for an 8.5 average) and a row that opens the title or the search, «ملخصك» from
seeded positions and its image, the empty state, and a watch party between TWO browsers sharing the
Firestore mock: room by code, the invite link in the address bar, the guest following the host's
position and pause, chat, two messages at once, reactions, the people line, the host ending it, only
`json` + `updatedAt` stored; the classic «ملخص 2026» card) and `closeout` (2026-10-17: two browsers posting
and liking the same post at the same moment — both posts and both likes survive, the older post is kept —;
`/privacy` and `/terms` in Arabic with their tab titles, the profile's «عن Hearbor» rows, `/profile/privacy`
still the settings page, the consent line on the sign-in page, the classic `/privacy` page and its footer
links; the developer panel (4 stats, 5 tabs, codes, members' requests, crash reports with their count and
the phase-2 status from `/api/health`) and no developer row for a normal visitor; one anonymous crash report
with the page path only, nothing more for the same error or for network drops; `robots.txt`, `sitemap.xml`
and a title per tab; account deletion from «الخصوصية والأمان»: what goes / what stays, the button off
until the user name is typed, a wrong password refused, then signed out with the device lists
cleared; the policy explaining it with the new address). `openWeb(browser, { route, phone, seed, ctx, ui })`:
`seed` is written to localStorage, which every page of one browser shares, so seed `blackx.vipTier`
explicitly; `ui: 'site'` stores the classic-pages choice; `ctx` patches the mock (`episodeDelayMs` holds
`/api/stream/episode` back, `communityPosts` replaces the seeded feed, `extraSlots` adds AniList air
times, `fs` / `fsTimes` share Firestore documents between pages or browsers, `recordOpen` makes
`window.open` record the address instead of opening a tab, `developer: true` lets a seeded session open
the mocked `/api/app/admin/*` (otherwise 403), `firestoreAuth` is what `/api/health` reports (default
`api_key`), crash reports posted to `/api/telemetry/error` are collected in `ctx.telemetry`, account
deletions in `ctx.accountDeletes` (`deletePassword` makes any other password fail with `bad_password`)); a seeded `blackx_token` signs the classic
computer pages in through the mocked `/api/auth/me`. The Firestore mock gives every write a new
`updateTime` and enforces `currentDocument.exists` / `currentDocument.updateTime` like the real API.
Extra browser contexts crash the single-process test Chromium, so a second person is a second
`launch()`. Because localStorage is shared, a scenario that seeds a session or the classic-pages choice
clears it afterwards (`clearStorage` in `closeout`: open `/__blank`, clear both storages) so the next page
starts as a fresh visitor. An error thrown by code that `page.evaluate` runs reaches `window.onerror` as a
muted «Script error.» (which the crash reporter ignores); to simulate a real crash add a `<script>`
element to the page instead. The test server sends `.txt` / `.xml` without a known type (a browser page
would download them), so the suite reads `robots.txt` and `sitemap.xml` with Node's `fetch`.
Headless Chrome reports no hover/fine pointer (and CDP cannot emulate them), which is why the rail
arrows key off a real mouse movement (`html.bx-has-mouse`, `ScrollRow.jsx`).
