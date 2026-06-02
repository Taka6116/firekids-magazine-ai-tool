# [FIRE_KIDS] 問い合わせ管理パイプライン 設計書

- 作成日: 2026-05-14
- クライアント: FIRE_KIDS
- 用途: firekids.jp 系メール問い合わせの一元管理（受信ログ＋タスク管理＋Slack通知）

---

## 1. 目的と背景

firekids.jp 関連の問い合わせメール（サイトお問い合わせフォーム、EC、SNS連携など）は既存のGmail受信箱で受信している。**新たに作業用アカウントを作成せず**、既存Gmail内で特定条件にマッチしたメール（送信元アドレス／件名キーワード等）が届いたタイミングで、

- スプレッドシートに自動ログ化する
- Slack グループチャットへ通知する
- スプレッドシート上で対応状況（ステータス／担当者／期限／メモ）を管理する

ことで、問い合わせの取りこぼし防止と対応進捗の見える化を実現する。

---

## 2. 全体アーキテクチャ

```
[firekids.jp 系メール送信元（フォーム/EC/SNS等）]
              │
              ▼
[既存のGmail受信箱（運用担当が日常使用しているアカウント）]
              │
              │ Gmailフィルター（特定送信元/件名条件にマッチ）
              │   → ラベル「問い合わせ-未処理」自動付与
              ▼
[Google Apps Script (時限トリガー 5分毎)]
              │
              ├─→ [スプレッドシート：受信ログ＋タスク管理]
              │            │
              │            │ onEdit トリガー
              │            ▼
              │      [完了日時の自動入力 等]
              │
              └─→ [Slack Incoming Webhook]
                           ▼
                  [Slackグループチャット（通知のみ／一方向）]
```

**重要**: 新規Gmailアカウントは作成しない。既存の受信箱の中で「特定条件のメールのみ」を対象化することで、日常メールに通知を出さない。条件のマッチングは Gmailフィルター＋ラベルで実現する。

### 主要コンポーネント

| # | コンポーネント | 役割 |
|---|---|---|
| 1 | Gmailフィルター | 既存受信箱で特定メールにラベル `問い合わせ-未処理` を付与 |
| 2 | GAS `fetchAndSync()` | 未処理ラベル付きメールを取得 → シート追記 → Slack通知 → ラベル更新 |
| 3 | スプレッドシート | 受信ログ＋タスク管理（単一シート構成） |
| 4 | GAS `onEdit()` | ステータス変更時の完了日時自動入力 |
| 5 | Slack Incoming Webhook | 通知配信先 |

---

## 3. 詳細仕様

### 3.1 Gmailフィルター（コンポーネント1）

既存Gmail受信箱に以下のフィルターを設定する。**通知対象を絞るための核となる仕組み**であり、ここで条件にマッチしたメールだけが後続処理へ流れる。

**フィルター条件（OR条件で複数登録可）**:
- 送信元アドレスにマッチ（例：`from:(noreply@firekids.jp OR support@base.in)`）
- 件名キーワードにマッチ（例：`subject:(お問い合わせ OR 新規注文 OR ご注文ありがとう)`）
- 本文キーワードにマッチ（必要に応じて）
- 上記の具体的条件は構築時に運用担当と確定

**フィルターアクション**:
- ラベル `問い合わせ-未処理` を付与
- 受信トレイをスキップしない（既存運用フローを壊さない）
- スター付与は任意

**使用ラベル**:
- `問い合わせ-未処理`：GAS処理待ち
- `問い合わせ-処理済`：GAS処理完了

**条件設計の指針**:
- 過剰検知（無関係メールが通知される）よりも、漏れ（条件未マッチで通知されない）が起きやすい方向に寄せる
- 運用開始後にフィルター条件をチューニングする前提で、初期は広めに設定
- 個人メール・社内メールを誤って拾わないよう、From条件は必ず含める

### 3.3 スプレッドシート構造（コンポーネント3）

**シート名**: `inquiries`

| 列 | 名称 | 型 | 自動/手動 | 説明 |
|---|---|---|---|---|
| A | ID | 数値 | 自動 | 連番（行追加時に採番） |
| B | 受信日時 | 日時 | 自動 | Gmail受信日時 |
| C | 送信元 | 文字列 | 自動 | From アドレス（表示名含む） |
| D | 件名 | 文字列 | 自動 | Subject |
| E | 本文プレビュー | 文字列 | 自動 | 本文の先頭500文字（改行は空白に置換） |
| F | Gmailリンク | URL | 自動 | スレッドURL（`https://mail.google.com/mail/u/0/#inbox/{threadId}`） |
| G | **ステータス** | 列挙 | 手動 | プルダウン：`未対応 / 対応中 / 完了 / 保留` |
| H | **担当者** | 列挙 | 手動 | プルダウン：構築時に確定する候補リスト |
| I | **対応期限** | 日付 | 手動 | 条件付き書式で当日／超過を色分け |
| J | **対応メモ** | 文字列 | 手動 | 自由記述 |
| K | 完了日時 | 日時 | 自動 | ステータスが `完了` に変更されたとき onEdit が記入 |
| L | Slack通知済 | 真偽 | 自動 | Webhook成功時に TRUE。FALSE のままなら次回再送 |
| M | Gmail Message ID | 文字列 | 自動 | 重複処理防止用（隠し列） |

**条件付き書式**:
- G列「未対応」: 赤系背景
- G列「対応中」: 黄系背景
- G列「完了」: 灰系背景
- I列：今日 → 黄色、過去日 → 赤、空欄は対象外
- ステータス「完了」または「保留」の行はI列の警告色を解除

**データ検証**:
- G列：上記4値のみ
- H列：別シート `_config` のA列を参照

**`_config` シート（隠しシート）**:
- A列：担当者候補
- B列：Slack Webhook URL（運用上は Script Properties を優先するが、変更時の可視化用にも置く）

### 3.4 GAS スクリプト

#### 3.4.1 `fetchAndSync()` — 時限トリガー（5分毎）

擬似コード：

```
function fetchAndSync() {
  const threads = GmailApp.search('label:問い合わせ-未処理');
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('inquiries');
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  const existingMessageIds = getColumnValues(sheet, 'M'); // 重複防止

  for (const thread of threads) {
    const messages = thread.getMessages();
    const latest = messages[messages.length - 1];
    const msgId = latest.getId();
    if (existingMessageIds.includes(msgId)) continue;

    const row = buildRow(latest, thread); // A〜F, M列を埋める
    sheet.appendRow(row);
    const appendedRowIndex = sheet.getLastRow();

    const ok = postToSlack(webhookUrl, latest, thread, appendedRowIndex);
    sheet.getRange(appendedRowIndex, COL_L).setValue(ok); // 通知済フラグ

    // ラベル付け替え
    const fromLabel = GmailApp.getUserLabelByName('問い合わせ-未処理');
    const toLabel = GmailApp.getUserLabelByName('問い合わせ-処理済');
    thread.removeLabel(fromLabel);
    thread.addLabel(toLabel);
  }

  retryUnnotified(sheet, webhookUrl); // L列FALSEの行を再送
}
```

**処理順序の理由**:
1. シート追記を先に行うことで、Slack通知が失敗してもデータは残る
2. Slack通知の成否を L列に記録し、次回実行時に再送可能とする
3. ラベル付け替えは最後。失敗時は次回も同じスレッドを処理対象に含めるが、M列の重複チェックで二重追記を防止

**エラーハンドリング**:
- 例外は try/catch でキャッチし、`Logger.log` に記録
- 5回連続で実行が完全失敗した場合、管理者メールに通知（しきい値は Script Properties）

#### 3.4.2 `onEdit(e)` — シート編集トリガー

```
function onEdit(e) {
  const range = e.range;
  if (range.getSheet().getName() !== 'inquiries') return;
  if (range.getColumn() !== COL_G) return; // ステータス列のみ

  const newValue = range.getValue();
  const row = range.getRow();
  if (newValue === '完了' && !sheet.getRange(row, COL_K).getValue()) {
    sheet.getRange(row, COL_K).setValue(new Date());
  }
}
```

#### 3.4.3 Slack 通知本体

Block Kit 形式で投稿：

```
{
  "blocks": [
    {"type": "header", "text": {"type": "plain_text", "text": "[FIRE_KIDS] 新規問い合わせ"}},
    {"type": "section", "fields": [
      {"type": "mrkdwn", "text": "*件名*\n{subject}"},
      {"type": "mrkdwn", "text": "*From*\n{from}"}
    ]},
    {"type": "section", "text": {"type": "mrkdwn", "text": "{body_preview_150}"}},
    {"type": "actions", "elements": [
      {"type": "button", "text": {"type": "plain_text", "text": "Gmailで開く"}, "url": "{gmail_url}"},
      {"type": "button", "text": {"type": "plain_text", "text": "シートで管理"}, "url": "{sheet_row_url}"}
      // gmail_url = https://mail.google.com/mail/u/0/#inbox/{threadId}
      // sheet_row_url = https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={GID}&range=A{row}
    ]}
  ]
}
```

**通知本文の制限**:
- 本文プレビューは Slack 側は **150文字**、シート側（E列）は **500文字**
- 個人情報を Slack に過度に出さない方針

### 3.5 トリガー設定

| トリガー | 種類 | 頻度 |
|---|---|---|
| `fetchAndSync` | 時限トリガー | 5分毎 |
| `onEdit` | スプレッドシート編集 | 編集時 |

---

## 4. データフロー

### 4.1 正常系

1. 顧客がフォーム送信 → firekids.jp 系メール送信元から作業用Gmailに転送
2. Gmailフィルターが `問い合わせ-未処理` ラベルを付与
3. 5分以内に `fetchAndSync` が起動
4. シートに行追記（A〜F, M列）
5. Slack Webhook 投稿成功 → L列 TRUE
6. ラベルを `問い合わせ-処理済` に付け替え
7. 担当者がシートを開き、G〜J列を更新
8. ステータスを `完了` にすると K列に完了日時自動入力

### 4.2 異常系

| 失敗箇所 | 挙動 | 復旧 |
|---|---|---|
| Slack Webhook | 行は追加されるが L列 FALSE | 次回実行で再送ループ |
| Gmail API | 例外ログのみ。シート未追記 | 次回実行で再試行（ラベル付け替え未済のため対象に残る） |
| シート書き込み | 例外ログのみ。ラベル変更前なので次回再試行 | 次回実行で再試行 |
| 重複処理 | M列のメッセージID照合で防止 | — |

---

## 5. セキュリティと権限

- **Webhook URL**: `PropertiesService.getScriptProperties()` に格納。コード内にハードコードしない
- **スプレッドシート閲覧権限**: 社内ドメイン内で必要メンバーのみ
- **Slack通知本文の制限**: 顧客個人情報を Slack に過度に出さないため、本文は150字まで。詳細はシート閲覧で確認する運用
- **Gmail API スコープ**: 読み取り＋ラベル変更のみ。送信権限は付与しない
- **既存Gmailを利用するうえでの注意**:
  - GASは「ラベル `問い合わせ-未処理` 付き」のメールしか参照しない設計とし、フィルター条件にマッチしないメール（個人メール・社内メール）は一切触らない
  - GASのGmailスコープは「ラベル付きメールの読み取り＋ラベル変更」に限定する（送信・削除権限は付与しない）
  - スクリプトオーナーは運用担当本人。スクリプトを共有する場合も実行権限は限定する

---

## 6. 運用ルール

### 6.1 ステータス遷移

```
未対応 → 対応中 → 完了
   ↓        ↓
  保留 ← ─ ─┘
```

- 新規受信時は必ず `未対応`
- 着手したら `対応中`
- 顧客返信待ち等で停止する場合は `保留`
- クローズ時は `完了`

### 6.2 対応期限の運用

- デフォルトは未設定（空欄）
- 急ぎ案件のみ手動で設定
- 「24時間以内対応」をデフォルト運用にする場合は将来の拡張で自動入力化を検討

### 6.3 担当者アサイン

- 受信時は未割当（H列空欄）
- Slack通知を見たメンバーが手挙げ式で H列を更新
- 自動アサインは初期スコープ外

---

## 7. スコープ外（YAGNI）

以下は明示的に**今回のスコープに含めない**：

- Slack側からのステータス変更（双方向連携）
- 自動返信メール
- 顧客のメールスレッド全文の蓄積
- AI による問い合わせ内容の自動分類
- ダッシュボード（対応件数集計など）
- 担当者の自動アサイン
- 期限超過時の自動リマインダー

これらは運用開始後、必要性が確認されてから個別に拡張する。

---

## 8. 構築時の確定事項（実装フェーズで決定）

実装着手時に運用側と確定する項目：

- **対象Gmailアカウント**（既存のいずれを使うか）
- **Gmailフィルター条件**：通知対象とする送信元アドレス／件名キーワード／本文キーワード
  - 例：firekids.jp お問い合わせフォーム送信通知、BASE/カート等ECからの注文通知、特定取引先からのメールなど
- Slack ワークスペース＋通知先チャンネル
- Slack Webhook URL の発行
- 担当者プルダウン候補リスト
- スプレッドシートの保管Drive位置

---

## 9. テスト計画

実装完了後に以下を確認：

1. **正常系**：フィルター条件にマッチするテストメールを対象Gmailに送信 → 5分以内にシート追記＋Slack通知が届く
2. **フィルター除外**：フィルター条件にマッチしないメール（個人メール等）を送信 → ラベルが付かず、シートにもSlackにも反映されない
3. **重複防止**：同一メールに対し `fetchAndSync` を手動連続実行 → 行が重複しない
4. **Slack再送**：Webhook URL を一時的に無効化 → 行は追加されるがL列FALSE → URL復旧後の次回実行で通知される
5. **完了自動入力**：シートでステータスを `完了` に変更 → K列に当日日時が入る
6. **条件付き書式**：期限を昨日の日付に設定 → I列が赤くなる
7. **ラベル運用**：処理済みメールのラベルが `問い合わせ-処理済` に変わっている

---

## 10. 拡張余地（将来検討）

- Slack のメッセージにリアクション（✅）が付いたらシートのステータスを `完了` に同期（双方向化）
- スレッドビューでの対応記録（Slack スレッドへの返信を対応メモに転記）
- 月次の対応件数・対応時間レポートの自動生成
- 問い合わせ種別の自動分類（AI）
