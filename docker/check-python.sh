#!/bin/sh
# Exercise the standard-library file edits used by workers under both names.
set -eu
for interpreter in python3 python; do
  "$interpreter" - <<'PY'
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory

assert sys.version_info[:2] == (3, 11), sys.version
with TemporaryDirectory() as directory:
    path = Path(directory) / 'probe.json'
    path.write_text(json.dumps({'message': 'before'}), encoding='utf-8')
    path.write_text(re.sub('before', 'after', path.read_text(encoding='utf-8')), encoding='utf-8')
    assert json.loads(path.read_text(encoding='utf-8')) == {'message': 'after'}
print(sys.version)
PY
done
