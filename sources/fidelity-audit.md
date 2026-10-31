# TikTok 2020 fidelity audit — 2026-10-29

The feed and secondary screens now follow the period's structure. This remains a reconstruction rather than a copy of TikTok's original source or assets. Evidence supports individual features; it does not establish identical rendering across every 2020 app build, operating system and region.

## Evidence

- [February 20, 2020 firsthand walkthrough and screenshots](https://www.techadvisor.com/article/734346/how-to-use-tiktok.html): autoplay, tap to pause, navigation, right-hand controls, profiles, sounds and sharing.
- [©2020 Axis guide, PDF page 6](https://media.qsbc.org/wp-content/uploads/2023/08/15100123/TikTok.pdf): guest viewing, account prompts, portrait and shorter-video framing. The file is republished at a later URL; its internal copyright and text date the guide.
- [August 9, 2020 loader observation](https://dev.to/bryce/tiktok-loader-in-css-n4l) and [December 11, 2020 loader observation](https://dev.to/reime005/tiktok-animation-in-react-native-33bl): two crossing colored circles, overlap and changing radii. These are independent developer observations/recreations, not TikTok's source code or a pixel-perfect timing specification.
- [April 2, 2020 loading screenshot](https://commons.wikimedia.org/wiki/File:TikTok_loading.png): grey circular loading indicator. It lacks enough surrounding UI to establish which exact loading context it shows.
- [TikTok's June 18, 2020 recommendation explanation](https://newsroom.tiktok.com/how-tiktok-recommends-videos-for-you?lang=en): interaction signals, popular initial feed, discovery and avoiding previously seen content.
- [TikTok's June 18, 2020 comment reply tutorial](https://newsroom.tiktok.com/product-tutorial-reply-to-comments-with-video?lang=en): comments included interactions and video replies, rather than a read-only archive.
- [Font designer Mark Simonson's account](https://typedrawers.com/discussion/5079/what-kind-of-impact-did-digital-social-media-have-on-fonts): Proxima Nova was TikTok's default from 2020 until 2023. [TikTok's May 17, 2023 announcement](https://newsroom.tiktok.com/introducing-tiktok-sans?lang=en) confirms its replacement with TikTok Sans.

## Screen and behavior review

| Area | Finding | Current treatment |
| --- | --- | --- |
| Home navigation | Period-supported structure | Home, Discover, central creation button, Inbox, Me. No modern Friends or Shop tab. Inbox glyph corrected to the square bubble and single horizontal line shown in the period screenshot. Other paths remain approximations. |
| Following / For You | Period-supported structure | Correct tab names and order. Exact size, top fade and underline geometry are not verified across 2020 builds. |
| Playback | Period-supported behavior | Autoplay, vertical browsing and tap to pause. Pausing keeps the image visible. No modern embedded recommendations or duplicate controls. |
| Looping | Expected period behavior; exact transitions unverified | Native loop retains the image. This audit did not establish frame-exact loop behavior for each historical app version. |
| Video framing | Period-supported examples | Original proportions retained; unused space is black. Does not claim a universal fixed top border or prove every 2020 device used the same fitting rule. |
| Loading | Period-supported design, approximate implementation | Two dots existed in 2020. Motion now includes size changes and dark overlap. Exact timing, colors and use in every feed-loading context remain unverified. A grey ring also appears in a dated screenshot. |
| Typography | Free substitute accepted | Proxima Nova is historically supported. The app falls back to bundled Metropolis when Proxima Nova is absent; this is visibly different. No licensed Proxima Nova webfont is bundled. Current TikTok Sans would also be wrong for 2020. |
| Heart and comment shapes | Approximation | Heart and comment paths were redrawn using the February 2020 control screenshots. These are reconstructed vectors, not recovered original assets; exact pixel identity is not claimed. |
| Creator avatar / follow plus | Partial match | Circular avatar and red plus arrangement match the structure. Initials replace missing historical photos. Follow confirmation animation is not reconstructed. |
| Engagement numbers | Intentional archive difference | Real TikTok displayed numbers. This app uses Like / Comments labels rather than invent historical totals. Partial archived comment count is distinct from the original total. |
| Caption and sound line | Partial match | Bottom placement is period-like. Many curated captions are collection notes; sound metadata is incomplete. The record uses a generic center rather than original cover art. |
| Dates | User-requested archive addition | Full year/date is kept in the feed. The cited feed screenshots do not show that exact presentation. Dates are decoded from video IDs in UTC. |
| Speaker toggle | User-requested modern addition | Kept for browser autoplay constraints and the user's preference; not claimed as the 2020 feed's original control. |
| Desktop layout / theme toggle | User-requested adaptation | Centered phone-like feed, desktop title and sun/moon switch are archive features, not a recreation of TikTok's 2020 desktop site. |
| About / metadata / Watch on TikTok | Archive additions | Kept to explain provenance and offer access to original posts. They were not original 2020 feed controls. |
| Recommendations | Simplified approximation | Watch duration and likes affect tags. It is not TikTok's model. Fixed an avoidable mismatch: watched featured clips no longer displace unseen catalog entries. The original system's full ranking, diversity and safety behavior is not reproduced. |
| Discover | Rebuilt | Full-height page, search header, fixed result tabs, period-style hashtag rows, horizontally scrolling real thumbnails and bottom navigation. Groups and counts describe the available collection, not an invented global 2020 ranking. |
| Search history | User-requested feature; exact historical presentation unverified | Local 10-item history is retained. No claim that its layout or limit matches a particular 2020 build. |
| Profiles | Rebuilt layout; incomplete historical metadata | Full-height header, portrait area, handle, statistics row, Follow button and 3-column real-thumbnail grid. Missing historical photos and totals use a placeholder and dashes; no invented bio or numbers. |
| Sound page | Rebuilt | Full-height cover/title/artist area, collection count, thumbnail grid and fixed bottom Use this sound control. Only known artist metadata is credited. Missing artwork has a neutral music placeholder; creation stays disabled. |
| Comments | Rebuilt presentation; read-only archive | Centered comment count, compact avatar/name/text/date rows, outline heart decoration and a read-only composer. Retrieved text is dated before January 1, 2021. Historical avatars, ranking, like counts and reply structure remain unavailable; no fake replies or likes are added. |
| Sharing | Intentional functional subset | Copy link, browser share where supported, and Watch on TikTok. The original included social targets, in-app recipients and other tools. Save video and Duet remain removed as requested. |
| Signup prompt | Period-based shell, incomplete service | Red phone/email prompt and Facebook/Google/Twitter circles are based on the retained period screenshot. Only email forms are wired; social options are disabled. The combined label does not imply working phone signup. Email delivery remains private-testing infrastructure. |
| Account forms / Me | Rebuilt presentation, archive account service | Full-height Me layout, guest signup presentation and liked-video grid reuse the existing account handlers. Signup closes back to Me or the creator page that opened it. The backend is still this archive's account service, not TikTok's. |
| Inbox, creation, friends | Intentional exclusions | Kept unavailable per the user's choices. Original TikTok had more functionality. |
| Gestures | Implemented | Tap pause, double-tap like, left swipe to profile, touch hold/right-click for Not interested and Share. Guest double taps request signup. Keyboard activation remains immediate. Mouse dragging is separated from touch holding. Physical-phone calibration remains untested. |
| Error presentation | Archive adaptation | Centered retry is designed for this stream resolver. It is not claimed to duplicate the old native error UI. |

## Changes made from this audit

1. Corrected the simplified dot animation to include scale/depth changes and a dark overlap.
2. Corrected the Inbox icon to the period screenshot's single-bar speech bubble structure.
3. Prevented curated repeats while unseen catalog entries remain, consistent with the 2020 recommendation explanation.
4. Cleared the obsolete browser availability cache so previously hidden but freshly verified entries return. Account preferences are unaffected.
5. Removed only entries independently confirmed unavailable by TikTok's own player during the collection audit; resolver errors alone are not proof of deletion.

## Design checks and limits

Static design checks report 0 FAIL and 3 contrast warnings on the historically styled red signup/follow buttons. Those warnings remain recorded; exact visual fidelity and modern contrast requirements are not identical. Browser inspection verifies the changed loader. No claim of pixel-perfect fidelity is made. Physical-phone, regional and OS-specific variants have not all been inspected.

Discover, profile, Me, sound and comment layouts have been rebuilt and checked in the browser. Real thumbnails are lazy-loaded through the existing public media resolver, with a text fallback if an image fails. The exact commercial font was not installed and no license was supplied; the user chose to keep the app free. Typography therefore keeps the bundled substitute. Historical photos, album artwork and unavailable engagement totals remain factual data limits rather than being fabricated.

## Complete collection check

All 1,018 incoming entries were checked. 541 advanced at least 0.4 seconds with nonzero dimensions, 475 produced official-player unavailability (error 1001), and 2 showed a loading shell without playing on manual recheck. The working catalog retains only the 541 successful entries, including all 41 featured picks. The 2 unresolved entries are recorded separately; they are not described as deleted. Their IDs are 6898394169249762562 and 6878676626108992769. The retained catalog has 15,616 archived comments across 532 videos; 9 have no eligible comments retrieved.

This was a startup check, not a complete watch-through of every clip. Availability can change after testing. No MP4 library was saved.

## Follow-up implementation

Rebuilt Discover, creator profiles, Me, sound pages and comments; added real-thumbnail grids with paging; restored search state on profile return; corrected sound artist credits; reconstructed the heart/comment shapes from the dated screenshots; added double-tap, swipe and hold interactions; retained security and stale-request safeguards. All 13 check scripts pass. Browser checks covered guest signup return, comments continuing playback, thumbnail-to-video playback, desktop profile swipe, and a 320 × 568 viewport without overflow. No new users were created and no email was sent during testing.


### Navigation and buffering follow-up

Discover text and category headings are larger. Light and dark themes now apply to secondary pages and bottom navigation. Full pages leave the desktop theme control usable; Inbox pauses playback and its Back button restores the previous search and scroll position. Comment hearts were removed, and archived comments page automatically while scrolling; Retry appears only after a failed request.

While the active video plays, the next video preloads silently. Activation reuses that stream, and distant sources are released. Browser checks confirmed readyState 4 and buffered media on the next card before scrolling, followed by playback on activation. This reduces cold starts but does not guarantee zero delay on slow connections or when the external media resolver is slow. All 14 check scripts pass. Physical-phone and Safari checks remain outstanding.


### Account entry follow-up

Signup, login and recovery now use full-height account pages. Returning from email signup restores the chooser, then its originating Me/profile page. Input focus uses a neutral underline; status text shares the 14 px secondary size. The red primary button and familiar provider icons retain period styling, but the simplified email/password form is an adaptation rather than a claim of an exact 2020 signup flow. The March 2020 Young Westminster guide documents the original birthday and phone/email/code sequence.

Supabase SMTP settings were inspected: custom SMTP remains disabled. No auth policy was weakened and no real signup or email was sent. Public confirmation/reset delivery still needs a connected email sender.


## GitHub Pages migration

The active app is https://foo-rq.github.io/tiktok-2020/. The Pages site is publicly accessible. Confirmation and reset return addresses preserve the project path, with exact allow-listed URLs in Supabase. Backend and frontend password rules now require 8 characters with uppercase, lowercase, a digit and a symbol. Email templates were rewritten and previewed; Inbox placement is not guaranteed. No private user exports or SMTP credentials were uploaded.
