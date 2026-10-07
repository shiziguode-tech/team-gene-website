#!/usr/bin/env python3
"""Build the site's Chinese serif subset (public/redesign/fonts.css "Team Gene Serif").

Headings, names and alumni quotes use Noto Serif SC. Its 101 frequency slices
spread the few hundred characters a page shows across dozens of files, so a
page downloaded 0.5-1.9 MB of font. This script puts every Chinese character
the site's serif text can show into one file (weights 500-600, the only ones
the CSS uses); characters outside it still fall back to the original slices.

Run it after adding a lot of new names or quotes (it is not part of the build):

    python3 -m pip install fonttools brotli          # development only
    python3 scripts/build-serif-subset.py NotoSerifSC[wght].ttf [--database team-gene.sqlite]

The source font is Noto Serif SC 2.003 (OFL), from
https://github.com/google/fonts/tree/main/ofl/notoserifsc . --database reads the
live content (a copy of DATA_DIR/team-gene.sqlite) instead of the preview snapshot.
The preview snapshot is supplied in source exports. In a working checkout without
preview/content-public.json, pass --database with a local content database copy.
The script rewrites the marked block in fonts.css and lib/redesign/font-subset.ts.
"""
import argparse
import glob
import hashlib
import io
import json
import os
import re
import sqlite3
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CJK = re.compile(r'[　-〿㐀-鿿豈-﫿＀-￯]')
# Static UI text: the public templates plus the forum, admin and mail screens.
SOURCES = ['lib/redesign/templates.mjs', 'lib/redesign/config.mjs', 'components/redesign/chrome.tsx',
           'app/forum/*.tsx', 'app/admin/**/*.tsx', 'app/mail/*.tsx', 'app/error.tsx']
# Content fields shown in the serif face: names and titles, labels, alumni quotes.
FIELDS = ('title', 'subtitle', 'tag', 'alumniMessage')
PUNCTUATION = '，。、；：？！“”‘’（）《》〈〉【】「」『』—…·～'
START, END = '/* serif-subset:start */', '/* serif-subset:end */'


def content_entries(database):
    if database:
        with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
            return [json.loads(payload) for (payload,) in db.execute('SELECT payload FROM content WHERE deleted = 0')]
    with open(os.path.join(ROOT, 'preview/content-public.json'), encoding='utf-8') as f:
        return json.load(f)['entries']


def site_characters(database):
    text = PUNCTUATION
    for pattern in SOURCES:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern), recursive=True)):
            with open(path, encoding='utf-8') as f:
                text += f.read()
    for entry in content_entries(database):
        text += ''.join(str(entry.get(field) or '') for field in FIELDS)
    return sorted({ord(c) for c in CJK.findall(text)})


def unicode_range(codepoints):
    ranges, start = [], None
    for i, cp in enumerate(codepoints):
        if start is None:
            start = cp
        if i + 1 == len(codepoints) or codepoints[i + 1] != cp + 1:
            ranges.append(f'U+{start:x}' if start == cp else f'U+{start:x}-{cp:x}')
            start = None
    return ', '.join(ranges)


def build(font_path, codepoints):
    font = TTFont(font_path)
    covered = [cp for cp in codepoints if cp in font.getBestCmap()]
    options = subset.Options()
    options.flavor = 'woff2'
    options.hinting = False
    options.name_IDs = ['*']
    options.layout_features = ['*']
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=covered)
    subsetter.subset(font)
    font = instancer.instantiateVariableFont(font, {'wght': (500, 600)}, updateFontNames=False)
    font.flavor = 'woff2'
    font.recalcTimestamp = False  # keep the source font's dates, so the same characters give the same file name
    out = io.BytesIO()
    font.save(out)
    return out.getvalue(), covered


def replace_block(path, block):
    raw = open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    text = raw.replace('\r\n', '\n')
    if START in text:
        text = text[:text.index(START)] + block + text[text.index(END) + len(END):]
    else:
        text = text.rstrip('\n') + '\n' + block + '\n'
    open(path, 'w', encoding='utf-8', newline='').write(text.replace('\n', nl))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('font', help='Noto Serif SC variable font (NotoSerifSC[wght].ttf)')
    parser.add_argument('--database', help='read content from this SQLite file instead of the preview snapshot')
    args = parser.parse_args()
    data, covered = build(args.font, site_characters(args.database))
    name = hashlib.sha256(data).hexdigest()[:16] + '.woff2'
    fonts_dir = os.path.join(ROOT, 'public/redesign/fonts')
    constant = os.path.join(ROOT, 'lib/redesign/font-subset.ts')
    # Keep previous content-hashed files: browsers may still use an older cached
    # stylesheet after deployment and must be able to fetch its font URL.
    with open(os.path.join(fonts_dir, name), 'wb') as f:
        f.write(data)
    url = f'/redesign/fonts/{name}'
    replace_block(os.path.join(ROOT, 'public/redesign/fonts.css'), '\n'.join([
        START,
        '/* Team Gene Serif: every Chinese character the site shows in its serif type,',
        '   from Noto Serif SC 2.003 (weights 500-600) in one file. Generated by',
        '   scripts/build-serif-subset.py; other characters fall back to the slices. */',
        '@font-face {',
        "  font-family: 'Team Gene Serif';",
        '  font-style: normal;',
        '  font-weight: 500 600;',
        '  font-display: swap;',
        f"  src: url({url}) format('woff2');",
        f'  unicode-range: {unicode_range(covered)};',
        '}',
        END,
    ]))
    with open(constant, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by scripts/build-serif-subset.py: the Chinese serif subset that\n'
                '// public pages preload (declared in public/redesign/fonts.css).\n'
                f"export const SERIF_SUBSET_URL = '{url}';\n")
    print(f'{len(covered)} characters, {len(data)} bytes -> {url}')


if __name__ == '__main__':
    sys.exit(main())
