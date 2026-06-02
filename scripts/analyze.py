"""
FIRE KIDS SEO記事作成 - データ分析スクリプト
ブランド別の商品データを集計します

使い方:
  python3 scripts/analyze.py
  ※ MCPforSEO フォルダをカレントディレクトリにして実行してください
"""
import openpyxl
import re
from collections import Counter
from pathlib import Path

# スクリプトの場所から相対パスでデータファイルを参照
BASE_DIR = Path(__file__).parent.parent
DATA_FILE = BASE_DIR / "data" / "FK記事作成用.xlsx"

if not DATA_FILE.exists():
    print(f"エラー: データファイルが見つかりません: {DATA_FILE}")
    print("data/ フォルダに FK記事作成用.xlsx を配置してください")
    exit(1)

wb = openpyxl.load_workbook(DATA_FILE)
ws = wb.active

def parse_body(body):
    if not body:
        return {}
    fields = {}
    patterns = {
        'model': r'【モデル名】\s*(.+)',
        'year': r'【製造年代】\s*(.+)',
        'movement': r'【ムーヴメント】\s*(.+)',
        'ref': r'【リファレンス】\s*(.+)',
        'case_size': r'【ケースサイズ】\s*(.+)',
    }
    for key, pat in patterns.items():
        m = re.search(pat, body)
        if m:
            fields[key] = m.group(1).strip().split('\n')[0].strip()
    return fields

brands = {'SEIKO': [], 'OMEGA': [], 'ROLEX': []}

for row in ws.iter_rows(min_row=2, values_only=True):
    fk, name, maker, body = row[0], row[1], row[2], row[3]
    if maker in brands:
        parsed = parse_body(body)
        parsed['fk'] = fk
        parsed['name'] = name
        brands[maker].append(parsed)

for brand, items in brands.items():
    print(f'=== {brand}: {len(items)}件 ===')
    models = Counter()
    for item in items:
        m = item.get('model', '').split('/')[0].strip()
        if m:
            models[m] += 1
    print('  [モデル TOP15]')
    for m, c in models.most_common(15):
        print(f'    {m}: {c}件')
    years = Counter()
    for item in items:
        y = item.get('year', '')
        m2 = re.search(r'(19[4-9]\d|20[0-2]\d)年代?', y)
        if m2:
            decade = str(int(m2.group(1)) // 10 * 10) + '年代'
            years[decade] += 1
    print('  [年代]')
    for y, c in sorted(years.items()):
        print(f'    {y}: {c}件')
    print()

print(f'合計: {sum(len(v) for v in brands.values())}件')
