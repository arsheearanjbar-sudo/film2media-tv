# film2media-tv

A Samsung Tizen TV app for **Film2Media** (`nilfgaard.top`) — browse and play Persian-dubbed / hardsubbed movies and series with the TV remote. No account needed: the app reads the site's public WordPress REST API and plays the direct file links.

## Download

Prebuilt `.wgt` packages are attached to [GitHub Releases](https://github.com/arsheearanjbar-sudo/film2media-tv/releases) — every release is built automatically by the `Release` workflow (Actions tab → Run workflow → pick a tag like `v1.0.0`). Install it with a Samsung certificate as described below.

## What it does

| Area | Details |
|---|---|
| Home | Latest movies + latest series rows |
| Movies / Series | Paginated poster grids |
| Title page | Poster, synopsis, quality list (movies); season tabs → episode grid → quality picker (series) |
| Player | Samsung AVPlay (`.mkv`/`.mp4` progressive), Left/Right seek ±10s (fast repeats escalate to 30s/60s), Up/Down shows controls, OK pauses, Back exits, 10s next-episode countdown |
| Search | On-screen Persian / English / digit keyboard, live results as you type |
| Favorites | Saved locally on the TV |
| Debug | Red key opens an on-screen log (network + playback steps) — invaluable where there is no console |

Subtitles need no handling: the site's releases are hardsubbed («زیرنویس فارسی چسبیده»).

## Requirements

1. **Samsung Tizen TV** in Developer Mode (see Install).
2. **Tizen Studio CLI** — the installer (`tizen`, `sdb`) is enough; the IDE is not needed.
3. **A Samsung account**, to create the certificate. Any account works; it does not need to be the one on the TV.

## Install

**1. Turn on Developer Mode on the TV.** Open Apps, press `1 2 3 4 5` on the remote, switch Developer Mode on, enter your computer's IP address, then restart the TV.

**2. Connect to it.**

```bash
~/tizen-studio/tools/sdb connect <tv-ip>:26101
~/tizen-studio/tools/sdb -s <tv-ip>:26101 shell 0 getduid    # note this; the certificate needs it
```

**3. Create a Samsung certificate profile** named `film2media`. Open `~/tizen-studio/tools/certificate-manager/Certificate-manager.app`, add a profile, choose **Samsung** then **TV**, create a new author certificate (sign in with your Samsung account when the browser opens), then a new distributor certificate with privilege **Public**. With the TV connected, its DUID is already in the list; if not, add the one from step 2.

**4. Sign and install.**

```bash
./build.sh
~/tizen-studio/tools/ide/bin/tizen package -t wgt -s film2media -- .
mv ./*.wgt film2media-tv.wgt    # the installer rejects the Persian file name it is given
~/tizen-studio/tools/ide/bin/tizen install -n film2media-tv.wgt -s <tv-ip>:26101
```

Or in one step (builds, signs, installs, launches with the web inspector):

```bash
scripts/tv.sh <tv-ip>
```

## Using it

- Arrows move focus; the right-edge rail (فیلم‌ها / سریال‌ها / جستجو / علاقه‌مندی‌ها) opens by pressing Right from content.
- Enter selects; Back goes back (on Home it exits the app).
- In the player: Left/Right seek, Up/Down shows the controls, OK pauses, Back exits.
- Red key (or `r` on desktop) toggles the debug log overlay.

## How it works

- Catalogue: `https://www.nilfgaard.top/wp-json/wp/v2/posts` (movies) and `/wp/v2/series` (series), with `_embed` for posters. Search via `?search=`.
- Download links: each title's page HTML is fetched and parsed (`js/scrape.js`) — only **direct** `.mp4`/`.mkv` links are used; the site's login-gated «پخش آنلاین» links are skipped. Within a quality group, `.mp4` is preferred over `.mkv` for compatibility.
- **Backup source:** if nilfgaard.top is unreachable (8s timeout), the app switches to the CCloud API (`server-hi-speed-iran.info`, with `hostinnegar.com` / `windowsdiba.info` as host fallbacks) and shows a notice. Backup items carry their direct sources already grouped by quality; everything (list, search, detail, playback, favorites) keeps working. The switch is sticky for the session. The backup key is third-party and best-effort — every call is wrapped in try/catch.
- Navigation: vendored `@noriginmedia/norigin-spatial-navigation-core` (MIT) — geometric D-pad focus, each screen a focus boundary, screens below stay mounted so Back restores the exact item.
- Playback: `webapis.avplay` on the TV, HTML5 `<video>` fallback elsewhere.
- UI is a single 1920×1080 RTL page, Tahoma (no webfonts), no CSS transitions — animated focus effects cost 100–250ms per frame on TV hardware.

## Limits

- Only titles with direct file links play; login-gated online-playback links are intentionally skipped.
- The site's CDN hosts change over time (`*.abrtech.top` is whitelisted in `config.xml`); if a host stops resolving, playback fails with a retry prompt.
- Requires Tizen 4.0+ (`required_version` in `config.xml`).

## Troubleshooting

- **Install fails with a certificate error** → the distributor certificate must include your TV's DUID (step 2/3 above); re-create it with the TV connected.
- **App installs but shows nothing** → press the Red key and read the log: the first lines show whether the API and page fetches succeed.
- **Video won't start** → try another quality; `.mp4` is preferred automatically, but some `.mkv` files exceed what the TV's demuxer handles.
- **Focus seems stuck** → the player pauses spatial navigation while open; Back always leaves the player.

## Disclaimer

Unofficial client, not affiliated with Film2Media or Samsung. Built for personal use; respect the site's terms.
