import importlib.util
import json
from tempfile import TemporaryDirectory
from pathlib import Path
spec = importlib.util.spec_from_file_location('collector', Path(__file__).parent / 'scripts/collect-comments.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
post = {'id': '6876424179084709126', 'date': '2020-09-25'}

# Keep HTML as literal text so rendering can escape it later
raw = {'aweme_id': post['id'], 'cid': '6876432231939325958', 'create_time': 1601044157,
       'text': '<script>literal text</script>', 'user': {'nickname': 'Viewer'}}
result = module.normalize(raw, post)
assert result['text'] == raw['text'] and result['date'] == '2020-9-25'

# Try wrong identity and invalid dates as well as text that exceeds the size limit
for change in [{'create_time': 1609459200}, {'create_time': 1577836800}, {'aweme_id': 'other'},
               {'cid': '../bad'}, {'text': 'x' * 5001}, {'create_time': True}]:
    assert module.normalize(dict(raw, **change), post) is None

# Missing comments and malformed user fields should be skipped safely
assert module.normalize(None, post) is None
assert module.normalize(dict(raw, user='invalid'), post) is None

# Use a throwaway archive so this test cannot touch the real comments
with TemporaryDirectory(dir=module.ROOT.parent) as temporary:
    module.ROOT = Path(temporary)
    module.STAGE = module.ROOT / 'stage'
    data = module.ROOT / 'data.js'
    data.parent.mkdir(exist_ok=True)
    data.write_text('const COMMENT_COUNTS = {};\nfunction beforeCutoff(){}\nmodule.exports={videoDate,COMMENT_COUNTS};')

    # Plant an old page so the test can prove it survives a failed validation
    stale = module.ROOT / 'comments' / (post['id'] + '-9.json')
    module.write_json(stale, {'old': True})
    checkpoint = module.STAGE / (post['id'] + '.json')
    record = {'videoId': post['id'], 'comments': [dict(result, id='../invalid')],
              'received': 1, 'hasMore': False, 'sourceUrls': [], 'collectedAt': 'test'}
    module.write_json(checkpoint, record)

    # A bad checkpoint must leave the last published archive alone
    try:
        module.assemble([post])
        raise RuntimeError('Invalid checkpoint accepted')
    except AssertionError:
        assert stale.exists(), 'Validation failure must preserve the existing archive'

    # Once the checkpoint is valid the old page can be replaced
    record['comments'] = [result]
    module.write_json(checkpoint, record)
    module.assemble([post])

    # A successful rebuild should remove the stale page and publish page 0
    assert not stale.exists()
    page = json.loads((stale.parent / (post['id'] + '-0.json')).read_text(encoding='utf-8'))
    assert page['comments'] == [result] and not page['hasMore']
    assert 'COMMENT_STATUS' in data.read_text()
print('Direct collector identity, date and text-boundary checks passed.')
