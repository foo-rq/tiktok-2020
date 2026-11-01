# TikTok 2020

## Spend 145 minutes in 2020.

I didn't have TikTok during lockdown. Whenever an old video came up, I wanted to keep scrolling through that year. So I made a feed for it.

**[Open the FYP](https://foo-rq.github.io/tiktok-2020/)**

<p>
  <img src="docs/media/feed.jpg" width="30%" alt="Jalaiah Harmon's Renegade playing in the feed">
  <img src="docs/media/discover.jpg" width="30%" alt="Dance, comedy and food collections in Discover">
  <img src="docs/media/comments.jpg" width="30%" alt="Comments written on the Renegade video in February 2020">
</p>

There are **541 videos** to get through. Jalaiah Harmon's Renegade is here, along with Savage, Say So and Bored in the House. You can search for one you remember or keep scrolling to see what turns up.

The comments are old too: **15,616 of them**, all written before January 1, 2021.

You don't need an account to watch. If you want to keep your likes and follows across devices, you can sign up with email.

<a href="https://foo-rq.github.io/tiktok-2020/docs/media/walkthrough.mp4"><img src="docs/media/walkthrough.gif" width="300" alt="Watch a short walkthrough of playback, comments and Discover"></a>

[Watch the feed and comments](https://foo-rq.github.io/tiktok-2020/docs/media/walkthrough.mp4)

[Watch search and profiles](https://foo-rq.github.io/tiktok-2020/docs/media/search.mp4)

**[I've got 145 minutes](https://foo-rq.github.io/tiktok-2020/)**

<details>
<summary>Where that number comes from</summary>

A [CHI 2024 study](https://homes.cs.washington.edu/~franzi/pdf/zannettou-tiktok-chi24.pdf) of 347 TikTok users reports first-day averages of 107.31 videos and 1,730 seconds of viewing, in section 5.1.

```text
107.31 ÷ (1,730 ÷ 60) ≈ 3.72 videos per minute
541 ÷ 3.72 ≈ 145 minutes
```

The calculation uses a ratio of the study’s group averages and 1 visit per video. It is not a measurement of this app or of TikTok in 2020. Replays, loading and time spent in comments change the total.

</details>

<details>
<summary>A few things to know</summary>

This is an independent reconstruction, not an official TikTok app. The interface follows period references, with some practical additions. The recommendation system is our own. [Design research and known differences](sources/fidelity-audit.md).

The collection is partial. 9 videos currently have no archived comments. Comments are read-only and aren't recreated when missing.

Playback depends on TikTok streams resolved through fxTikTok. Original video quality and availability vary. Videos keep their proportions, with black space where needed. Share includes a link to watch the original on TikTok.

Video creation and messaging are disabled. Videos, sounds and comments belong to their respective creators.

</details>

## For developers

### Stack

| Part | What it uses |
| --- | --- |
| Interface | HTML, CSS and plain JavaScript |
| Playback | Native HTML video with streams resolved by fxTikTok |
| Accounts | Supabase Auth |
| Saved preferences | Supabase Postgres with row-level security |
| Catalog and comments | Static JavaScript and paged JSON files |
| Hosting | GitHub Pages |

There's no frontend framework, package install or build step. Metropolis is bundled as the free font fallback. Third-party asset licences are in [assets/](assets/).

### Run locally

You'll need Python 3. Run these commands in a terminal:

```sh
git clone https://github.com/foo-rq/tiktok-2020.git
cd tiktok-2020
python -m http.server 5188 --bind 127.0.0.1
```

Open [localhost:5188](http://127.0.0.1:5188/). Serve the folder over HTTP rather than opening the HTML file directly, since comment pages load with fetch.

### Set up your own accounts

1. Create a Supabase project and run [account-schema.sql](account-schema.sql) against the fresh database. It creates the profile table, ownership policies and username reservation rules.
2. Enable email signup with email confirmation. Configure your sender's SMTP details in the Supabase dashboard. The templates in [email-templates/](email-templates/) are available if you want the same email copy.
3. Set the Auth site URL to your deployed app and allow its return URL. Add your localhost return URL too if you'll test signup locally.
4. Update [auth-config.js](auth-config.js) with your project URL and publishable key.

The publishable key belongs in the browser. Secret keys and SMTP credentials don't. Profile access is restricted to the signed-in owner by the database policies, with a 128 KB preference limit per account.

### How the data works

Guest preferences and search history stay in browser storage. Signed-in likes, follows and feed preferences save to that user's profile. Importing device preferences is an explicit action.

Videos stream from an external host. The video collection isn't bundled with the app. Comments load from [comments/](comments/) when opened, in pages of up to 50. Each filename contains the video ID and page number, such as `6876424179084709126-0.json`.

### Find your way around

| File or folder | What's there |
| --- | --- |
| [app.js](app.js) | Playback, feed selection, gestures and comment paging |
| [panels.js](panels.js) | Discover, profiles, sharing and navigation |
| [accounts.js](accounts.js) | Account forms, sessions and preference saves |
| [data.js](data.js) | Video catalog, dates and archived comment counts |
| [styles/](styles/) and [panels.css](panels.css) | Layout, themes and screen styles |
| [scripts/](scripts/) | Comment collection tools |
| [sources/](sources/) | Collection records and interface research |
| [docs/media/](docs/media/) | README screenshots and demo clips |

### Checks

You'll need Node.js as well as Python. In PowerShell:

```powershell
Get-ChildItem check*.cjs | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
python check-collector.py
```

These checks cover playback, feed selection, account state, comment paging, sharing, search history and data validation. They use local fixtures and mocked account responses, so they don't send emails or create users. Live signup, confirmation, login and account isolation were also tested separately with disposable accounts.

### Deploy

GitHub Pages serves this repository as static files. Publish the root of your chosen branch and keep [.nojekyll](.nojekyll) in place. There's no build command. Update the Supabase return URLs when you change the site's address.
