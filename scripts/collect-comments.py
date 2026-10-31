"""Collect public comment text without accounts, paid services or media downloads"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]

# Keep collection checkpoints separate from the files the app serves
STAGE = ROOT.parent / 'direct-comments'

# Stop at the start of 2021 in UTC
CUTOFF = 1609459200

# The collector expects the post array on the first line of the catalog
# Keep that layout in mind before moving comments above it
def catalog():
    line = (ROOT / 'data.js').read_text(encoding='utf-8').splitlines()[0]
    return json.loads(line.removeprefix('const POSTS = ').removesuffix(';'))

# Return nothing for a bad record so 1 malformed comment does not stop a whole video
def normalize(comment, post):
    if not isinstance(comment, dict):
        return None

    # The endpoint can return unexpected records so verify the video identity too
    if str(comment.get('aweme_id')) != post['id']:
        return None

    # Keep IDs as strings since these numbers exceed safe browser integer precision
    comment_id = str(comment.get('cid', ''))
    stamp = comment.get('create_time')
    text = comment.get('text')

    # Reject malformed records before they can reach the published files
    if not re.fullmatch(r'\d{19}', comment_id) or type(stamp) is not int:
        return None

    # A comment cannot be older than the video it belongs to
    earliest = int(datetime.fromisoformat(post['date']).replace(tzinfo=timezone.utc).timestamp())
    if not earliest <= stamp < CUTOFF or not isinstance(text, str) or not text.strip() or len(text) > 5000:
        return None

    # A missing user can use the fallback name but a malformed user must be rejected
    user = comment.get('user') or {}
    if not isinstance(user, dict):
        return None
    name = user.get('nickname') or user.get('unique_id') or 'Viewer'
    if not isinstance(name, str):
        return None

    # Store a full UTC timestamp for checks and a shorter date for the interface
    created = datetime.fromtimestamp(stamp, timezone.utc)
    return {'id': comment_id, 'name': name[:100], 'text': text,
            'createdAt': created.isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'date': created.strftime('%Y-%m-%d').replace('-0', '-')}

def fetch_page(video_id, cursor):
    url = 'https://www.tiktok.com/api/comment/list/?' + urlencode({'aweme_id': video_id, 'count': 50, 'cursor': cursor, 'aid': 1988})

    # Shortcut: the guest endpoint can change or refuse access, revisit the source if that happens
    # Stop on challenges rather than trying to get around them
    with urlopen(url, timeout=20) as response:

        # Limit the response size so an unexpected response cannot grow without a bound
        body = response.read(1_000_001)
        if not body or len(body) > 1_000_000 or 'json' not in response.headers.get('Content-Type', ''):
            raise RuntimeError('TikTok did not return a normal JSON response. Collection stopped.')

    # An HTML challenge or malformed JSON should stop collection rather than get saved
    value = json.loads(body)
    if not isinstance(value, dict):
        raise RuntimeError('Unexpected comment response. Collection stopped.')

    # A successful HTTP request can still carry an endpoint error
    if value.get('status_code') != 0:
        raise RuntimeError('TikTok returned status ' + str(value.get('status_code')) + '. Collection stopped.')
    if value.get('comments') is not None and not isinstance(value['comments'], list):
        raise RuntimeError('Unexpected comment response. Collection stopped.')
    return value, url

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)

    # Finish writing before replacing the last good checkpoint
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)

def collect(posts, pages, delay):
    completed = 0
    for post in posts:
        target = STAGE / (post['id'] + '.json')

        # Keep finished videos so rerunning can pick up where it stopped
        if target.exists():
            continue

        # The dictionary deduplicates comment IDs while preserving their first position
        found, cursor, has_more, urls, received = {}, 0, False, [], 0
        for page in range(pages):
            value, url = fetch_page(post['id'], cursor)
            urls.append(url)
            raw = value.get('comments') or []

            # Record all received rows separately from the ones that pass our date filter
            received += len(raw)
            for raw_comment in raw:
                item = normalize(raw_comment, post)
                if item:

                    # The same comment can appear on overlapping endpoint pages
                    found[item['id']] = item

            # Only move forward if the endpoint gives us a newer cursor
            next_cursor = value.get('cursor', cursor)
            has_more = bool(value.get('has_more'))

            # Leave a gap between requests even if this turns out to be the last page
            time.sleep(delay)
            if not has_more or type(next_cursor) is not int or next_cursor <= cursor:
                break
            cursor = next_cursor

        # Keep source URLs and received counts so a partial archive can be audited later
        record = {'videoId': post['id'], 'comments': list(found.values()), 'received': received,
                  'hasMore': has_more, 'sourceUrls': urls, 'collectedAt': datetime.now(timezone.utc).isoformat()}
        write_json(target, record)
        completed += 1
        print(json.dumps({'processedThisRun': completed, 'video': post['id'], 'received': received, 'eligible': len(found)}), flush=True)

def assemble(posts):
    counts, statuses, provenance = {}, {}, {}
    records = []
    for post in posts:
        path = STAGE / (post['id'] + '.json')

        # Only checkpointed videos will be included in the rebuilt archive
        if not path.exists():
            continue
        record = json.loads(path.read_text(encoding='utf-8'))
        assert record['videoId'] == post['id']
        comments = record['comments']

        # Duplicate IDs here would make the visible count disagree with unique comments
        assert len({item['id'] for item in comments}) == len(comments)
        for item in comments:
            assert re.fullmatch(r'\d{19}', item['id'])
            assert isinstance(item['text'], str) and len(item['text']) <= 5000
            assert isinstance(item['name'], str) and len(item['name']) <= 100
            stamp = datetime.fromisoformat(item['createdAt'].replace('Z', '+00:00')).timestamp()
            assert 1577836800 <= stamp < CUTOFF
        records.append((post, record))

    # Check every selected record before removing any existing page
    # This rebuild replaces the whole published set rather than merging checkpoints
    # Make sure staging contains everything we intend to keep before assembling
    for old_page in (ROOT / 'comments').glob('*.json'):
        old_page.unlink()
    for post, record in records:
        comments = record['comments']
        statuses[post['id']] = 'collected' if comments else 'no_eligible_comments_retrieved'
        provenance[post['id']] = {key: record[key] for key in ['received', 'hasMore', 'sourceUrls', 'collectedAt']}

        # Record the empty status but don't publish a page that has nothing to display
        if not comments:
            continue
        counts[post['id']] = len(comments)

        # Split the archive so opening comments only fetches 50 at a time
        for offset in range(0, len(comments), 50):
            write_json(ROOT / 'comments' / f"{post['id']}-{offset // 50}.json",
                       {'comments': comments[offset:offset + 50], 'hasMore': offset + 50 < len(comments)})
    data_file = ROOT / 'data.js'
    source = data_file.read_text(encoding='utf-8')

    # Keep the UI counts in sync with the comments that were actually published
    source = re.sub(r'const COMMENT_COUNTS = .*?;', 'const COMMENT_COUNTS = ' + json.dumps(counts) + ';', source)
    source = re.sub(r'const COMMENT_STATUS = .*?;\n', '', source)
    source = source.replace('function beforeCutoff', 'const COMMENT_STATUS = ' + json.dumps(statuses) + ';\nfunction beforeCutoff')
    source = source.replace('videoDate,COMMENT_COUNTS}', 'videoDate,COMMENT_COUNTS,COMMENT_STATUS}')
    data_file.write_text(source, encoding='utf-8')
    write_json(ROOT / 'sources/direct-comment-provenance.json', provenance)
    print(json.dumps({'checkedVideos': len(statuses), 'videosWithComments': len(counts), 'eligibleComments': sum(counts.values())}), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--pages', type=int, default=1)
    parser.add_argument('--delay', type=float, default=1)
    parser.add_argument('--assemble', action='store_true')
    args = parser.parse_args()
    if args.pages < 1 or args.delay < 0.5 or (args.limit is not None and args.limit < 1):
        parser.error('Use positive limits and at least 0.5 seconds between requests.')
    all_posts = catalog()

    # Skip completed checkpoints on the next run unless they are deliberately removed
    selected = [p for p in all_posts if not (STAGE / (p['id'] + '.json')).exists()]
    try:
        collect(selected[:args.limit] if args.limit else selected, args.pages, args.delay)

    # Keep completed checkpoints if a later request fails so retry doesn't start over
    except (HTTPError, OSError, ValueError, RuntimeError) as error:
        print('Stopped safely: ' + str(error), flush=True)
        raise SystemExit(2)

    # Collection alone only writes checkpoints
    # Publishing them needs the explicit assemble flag
    if args.assemble:
        assemble(all_posts)
