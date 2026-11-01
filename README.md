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

<details>
<summary>Run it locally</summary>

The app uses HTML, CSS and JavaScript, with Supabase for accounts and saved preferences. There's no build step.

```sh
python -m http.server 5188 --bind 127.0.0.1
```

Open [localhost:5188](http://127.0.0.1:5188/).

For your own deployment, configure a Supabase project using [account-schema.sql](account-schema.sql), then update [auth-config.js](auth-config.js). That browser key is intentionally public. Keep secret keys and email credentials out of the repository.

Run the checks with Node.js and Python. In PowerShell:

```powershell
Get-ChildItem check*.cjs | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
python check-collector.py
```

The checks cover playback, feed selection, account state, comment paging, sharing, search history and data validation. They don't send emails or create accounts. The live email-confirmation and login flows were separately tested with disposable accounts.

</details>
