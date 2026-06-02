"""
FIRE KIDS SEO記事作成 - ブランド別データ抽出スクリプト
指定ブランドの商品データを抽出してJSONで出力します

使い方:
  python3 scripts/extract_brand.py SEIKO グランドセイコー
  python3 scripts/extract_brand.py OMEGA コンステレーション
  python3 scripts/extract_brand.py ROLEX デイトジャスト
"""
import openpyxl
import re
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_FILE = BASE_DIR / "data" / "FK記事作成用.xlsx"

if not DATA_FILE.exists():
    print(f"エラー: データファイルが見つかりません: {DATA_FILE}")
    exit(1)

# 引数処理
brand_filter = sys.argv[1].upper() if len(sys.argv) > 1 else "SEIKO"
keyword_filter = sys.argv[2] if len(sys.argv) > 2 else ""

wb = openpyxl.load_workbook(DATA_FILE)
ws = wb.active

def parse_body(body):
    if not body:
        return {}
    fields = {}
    patterns = {
        'model':         r'【モデル名】\s*(.+)',
        'year':          r'【製造年代】\s*(.+)',
        'movement':      r'【ムーヴメント】\s*(.+)',
        'ref':           r'【リファレンス】\s*(.+)',
        'dial':          r'【文字盤】\s*(.+)',
        'case_material': r'【ケース素材】\s*(.+)',
        'case_size':     r'【ケースサイズ】\s*(.+)',
        'lug':           r'【ラグ幅】\s*(.+)',
        'condition':     r'【状態】\s*(.+)',
        'waterproof':    r'【防水機能】\s*(.+)',
    }
    for key, pat in patterns.items():
        m = re.search(pat, body)
        if m:
            fields[key] = m.group(1).strip().split('\n')[0].strip()
    m2 = re.search(r'【特徴・セールスポイント】\s*\n(.*?)(?=\n\s*【)', body, re.DOTALL)
    if m2:
        feature = re.sub(r'\n\s*', ' ', m2.group(1).strip())
        fields['feature'] = feature
    return fields

results = []
for row in ws.iter_rows(min_row=2, values_only=True):
    fk, name, maker, body = row[0], row[1], row[2], row[3]
    if maker == brand_filter:
        if keyword_filter and name and keyword_filter not in str(name):
            continue
        parsed = parse_body(body)
        parsed['fk'] = fk
        parsed['name'] = name
        parsed['maker'] = maker
        results.append(parsed)

print(f"抽出結果: {brand_filter} / キーワード「{keyword_filter}」 → {len(results)}件\n")
for item in results[:20]:
    print(f"[{item.get('fk','')}] {item.get('name','')}")
    print(f"  年代: {item.get('year','')} | ムーブ: {item.get('movement','')}")
    print(f"  Ref: {item.get('ref','')} | ケース: {item.get('case_material','')} {item.get('case_size','')}")
    print(f"  文字盤: {item.get('dial','')} | 状態: {item.get('condition','')}")
    feat = item.get('feature', '')
    if feat:
        print(f"  特徴: {feat[:100]}...")
    print()

# JSONファイルとして保存
out_file = BASE_DIR / "factcheck_logs" / f"extract_{brand_filter}_{keyword_filter or 'all'}.json"
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"JSONを保存しました: {out_file}")
