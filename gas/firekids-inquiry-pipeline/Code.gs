/**
 * [FIRE_KIDS] 問い合わせ管理パイプライン
 *
 * セットアップ手順:
 *   1. Apps Script プロジェクトにこのファイルを貼り付け
 *   2. スクリプトプロパティを設定:
 *        SHEET_ID            = 対象スプレッドシートのID
 *        SLACK_WEBHOOK_URL   = Slack Incoming Webhook URL
 *        ADMIN_EMAIL         = エラー通知先（任意）
 *   3. Gmail で以下のラベルを作成（無ければ setup() が作成）:
 *        問い合わせ-未処理
 *        問い合わせ-処理済
 *   4. Gmail フィルターで通知対象メールに「問い合わせ-未処理」ラベルを付与
 *   5. このスクリプトエディタで setup() を一度実行（権限承認＋シート初期化＋トリガー登録）
 */

// ===== 定数 =====
const SHEET_NAME = 'inquiries';
const CONFIG_SHEET_NAME = '_config';
const LABEL_UNPROCESSED = '問い合わせ-未処理';
const LABEL_PROCESSED  = '問い合わせ-処理済';

const COL = {
  ID: 1, RECEIVED: 2, FROM: 3, SUBJECT: 4, PREVIEW: 5, GMAIL_URL: 6,
  STATUS: 7, ASSIGNEE: 8, DEADLINE: 9, MEMO: 10, COMPLETED: 11,
  NOTIFIED: 12, MSG_ID: 13
};
const HEADERS = [
  'ID', '受信日時', '送信元', '件名', '本文プレビュー', 'Gmailリンク',
  'ステータス', '担当者', '対応期限', '対応メモ', '完了日時',
  'Slack通知済', 'Gmail Message ID'
];

const STATUS = {
  UNHANDLED:   '未対応',
  IN_PROGRESS: '対応中',
  COMPLETED:   '完了',
  ON_HOLD:     '保留'
};
const STATUS_VALUES = [STATUS.UNHANDLED, STATUS.IN_PROGRESS, STATUS.COMPLETED, STATUS.ON_HOLD];

const PREVIEW_SHEET_LEN = 500;
const PREVIEW_SLACK_LEN = 150;

// ===== エントリポイント: 時限トリガー（5分毎） =====
function fetchAndSync() {
  const props = PropertiesService.getScriptProperties();
  const sheetId    = props.getProperty('SHEET_ID');
  const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL');
  if (!sheetId || !webhookUrl) {
    throw new Error('SHEET_ID または SLACK_WEBHOOK_URL が未設定です');
  }

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`シート ${SHEET_NAME} が見つかりません`);
  const gid = sheet.getSheetId();

  const labelFrom = GmailApp.getUserLabelByName(LABEL_UNPROCESSED);
  const labelTo   = GmailApp.getUserLabelByName(LABEL_PROCESSED);
  if (!labelFrom || !labelTo) {
    throw new Error(`Gmail ラベル「${LABEL_UNPROCESSED}」「${LABEL_PROCESSED}」を先に作成してください`);
  }

  const knownIds = getExistingMessageIds_(sheet);
  const threads = labelFrom.getThreads(0, 50);

  threads.forEach(thread => {
    try {
      const messages = thread.getMessages();
      const latest = messages[messages.length - 1];
      const msgId = latest.getId();

      if (!knownIds.has(msgId)) {
        const rowIndex = appendInquiryRow_(sheet, latest, thread);
        const ok = postToSlack_(webhookUrl, latest, thread, rowIndex, sheetId, gid);
        sheet.getRange(rowIndex, COL.NOTIFIED).setValue(ok);
        knownIds.add(msgId);
      }

      thread.removeLabel(labelFrom);
      thread.addLabel(labelTo);
    } catch (err) {
      logError_(`fetchAndSync (thread=${thread.getId()})`, err);
    }
  });

  retryUnnotified_(sheet, webhookUrl, sheetId, gid);
}

// ===== エントリポイント: シート編集（インストール型トリガー） =====
function onSheetEdit(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    if (range.getColumn() !== COL.STATUS) return;
    if (range.getRow() === 1) return;

    const newValue = range.getValue();
    const completedCell = sheet.getRange(range.getRow(), COL.COMPLETED);
    if (newValue === STATUS.COMPLETED && !completedCell.getValue()) {
      completedCell.setValue(new Date());
    }
  } catch (err) {
    logError_('onSheetEdit', err);
  }
}

// ===== シート追記 =====
function appendInquiryRow_(sheet, msg, thread) {
  const lastRow = sheet.getLastRow();
  const nextId = lastRow; // 行1がヘッダなので、現lastRow番目のIDは lastRow

  const row = new Array(HEADERS.length).fill('');
  row[COL.ID - 1]        = nextId;
  row[COL.RECEIVED - 1]  = msg.getDate();
  row[COL.FROM - 1]      = msg.getFrom();
  row[COL.SUBJECT - 1]   = msg.getSubject();
  row[COL.PREVIEW - 1]   = makePreview_(msg.getPlainBody(), PREVIEW_SHEET_LEN);
  row[COL.GMAIL_URL - 1] = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;
  row[COL.STATUS - 1]    = STATUS.UNHANDLED;
  row[COL.NOTIFIED - 1]  = false;
  row[COL.MSG_ID - 1]    = msg.getId();

  sheet.appendRow(row);
  return sheet.getLastRow();
}

// ===== Slack 通知 =====
function postToSlack_(webhookUrl, msg, thread, rowIndex, sheetId, gid) {
  const sheetRowUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}&range=A${rowIndex}`;
  const gmailUrl    = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;
  const preview     = makePreview_(msg.getPlainBody(), PREVIEW_SLACK_LEN);

  const payload = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '[FIRE_KIDS] 新規問い合わせ' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*件名*\n${escapeForMrkdwn_(msg.getSubject() || '(no subject)')}` },
          { type: 'mrkdwn', text: `*From*\n${escapeForMrkdwn_(msg.getFrom())}` }
        ]
      },
      { type: 'section', text: { type: 'mrkdwn', text: preview ? `>${preview.replace(/\n/g, '\n>')}` : '_本文なし_' } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Gmailで開く' }, url: gmailUrl },
          { type: 'button', text: { type: 'plain_text', text: 'シートで管理' }, url: sheetRowUrl }
        ]
      }
    ]
  };

  try {
    const res = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return res.getResponseCode() === 200;
  } catch (err) {
    logError_('postToSlack_', err);
    return false;
  }
}

// ===== 未通知行の再送 =====
function retryUnnotified_(sheet, webhookUrl, sheetId, gid) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
  const values = range.getValues();

  values.forEach((row, i) => {
    const rowIndex = i + 2;
    const notified = row[COL.NOTIFIED - 1];
    const msgId    = row[COL.MSG_ID - 1];
    if (notified === true || !msgId) return;

    try {
      const msg = GmailApp.getMessageById(msgId);
      if (!msg) return;
      const thread = msg.getThread();
      const ok = postToSlack_(webhookUrl, msg, thread, rowIndex, sheetId, gid);
      sheet.getRange(rowIndex, COL.NOTIFIED).setValue(ok);
    } catch (err) {
      logError_(`retryUnnotified_ (row=${rowIndex})`, err);
    }
  });
}

// ===== ヘルパー =====
function getExistingMessageIds_(sheet) {
  const lastRow = sheet.getLastRow();
  const set = new Set();
  if (lastRow < 2) return set;
  const values = sheet.getRange(2, COL.MSG_ID, lastRow - 1, 1).getValues();
  values.forEach(r => { if (r[0]) set.add(String(r[0])); });
  return set;
}

function makePreview_(body, maxLen) {
  if (!body) return '';
  const flat = String(body).replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > maxLen ? flat.slice(0, maxLen) + '…' : flat;
}

function escapeForMrkdwn_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logError_(where, err) {
  const msg = `[${where}] ${err && err.stack ? err.stack : err}`;
  console.error(msg);
  const admin = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  if (admin) {
    try {
      MailApp.sendEmail(admin, '[FIRE_KIDS Inquiry] エラー', msg);
    } catch (_) { /* mail送信失敗は握りつぶす */ }
  }
}

// ===== スプレッドシート起動時メニュー =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('問い合わせパイプライン')
    .addItem('今すぐメール取得', 'menuFetchAndSync')
    .addItem('Slack通知テスト', 'menuTestNotification')
    .addItem('ヘルスチェック', 'menuHealthCheck')
    .addSeparator()
    .addItem('セットアップ実行（初回のみ）', 'menuSetup')
    .addToUi();
}

function menuFetchAndSync() {
  try {
    fetchAndSync();
    SpreadsheetApp.getUi().alert('メール取得完了。新規行があれば追加されています。');
  } catch (err) {
    SpreadsheetApp.getUi().alert(`エラー: ${err.message}`);
  }
}

function menuTestNotification() {
  const result = testNotification();
  SpreadsheetApp.getUi().alert(result.ok
    ? 'Slackへテスト通知を送信しました。チャンネルを確認してください。'
    : `失敗: ${result.message}`);
}

function menuHealthCheck() {
  const report = healthCheck();
  SpreadsheetApp.getUi().alert(report);
}

function menuSetup() {
  try {
    setup();
    SpreadsheetApp.getUi().alert('セットアップ完了');
  } catch (err) {
    SpreadsheetApp.getUi().alert(`エラー: ${err.message}`);
  }
}

// ===== ヘルスチェック =====
function healthCheck() {
  const lines = ['=== ヘルスチェック結果 ==='];
  const props = PropertiesService.getScriptProperties();
  const sheetId    = props.getProperty('SHEET_ID');
  const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL');

  lines.push(sheetId ? '✓ SHEET_ID 設定済み' : '✗ SHEET_ID 未設定');
  lines.push(webhookUrl ? '✓ SLACK_WEBHOOK_URL 設定済み' : '✗ SLACK_WEBHOOK_URL 未設定');

  if (sheetId) {
    try {
      const ss = SpreadsheetApp.openById(sheetId);
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (sheet) {
        const headerCount = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].filter(Boolean).length;
        lines.push(headerCount === HEADERS.length ? `✓ シート ${SHEET_NAME} 構造OK` : `✗ シート ${SHEET_NAME} 構造不一致（再setup推奨）`);
      } else {
        lines.push(`✗ シート ${SHEET_NAME} が見つかりません（setup実行が必要）`);
      }
    } catch (err) {
      lines.push(`✗ スプレッドシート読込失敗: ${err.message}`);
    }
  }

  lines.push(GmailApp.getUserLabelByName(LABEL_UNPROCESSED) ? `✓ Gmailラベル「${LABEL_UNPROCESSED}」存在` : `✗ Gmailラベル「${LABEL_UNPROCESSED}」未作成`);
  lines.push(GmailApp.getUserLabelByName(LABEL_PROCESSED)   ? `✓ Gmailラベル「${LABEL_PROCESSED}」存在`   : `✗ Gmailラベル「${LABEL_PROCESSED}」未作成`);

  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  lines.push(triggers.includes('fetchAndSync') ? '✓ fetchAndSync トリガー登録済み' : '✗ fetchAndSync トリガー未登録');
  lines.push(triggers.includes('onSheetEdit')  ? '✓ onSheetEdit トリガー登録済み'  : '✗ onSheetEdit トリガー未登録');

  if (webhookUrl) {
    try {
      const res = UrlFetchApp.fetch(webhookUrl, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: '[ヘルスチェック] Webhook疎通確認' }),
        muteHttpExceptions: true
      });
      lines.push(res.getResponseCode() === 200 ? '✓ Slack Webhook 疎通OK（通知1件送信）' : `✗ Slack Webhook 応答: ${res.getResponseCode()}`);
    } catch (err) {
      lines.push(`✗ Slack Webhook 接続失敗: ${err.message}`);
    }
  }

  return lines.join('\n');
}

// ===== Slack通知テスト =====
function testNotification() {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (!webhookUrl) return { ok: false, message: 'SLACK_WEBHOOK_URL が未設定です' };

  const payload = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '[テスト] 通知動作確認' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'これはテスト送信です。本文プレビューやボタン表示の確認用。' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `送信時刻: ${new Date().toLocaleString('ja-JP')}` }] }
    ]
  };

  try {
    const res = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return { ok: res.getResponseCode() === 200, message: `HTTP ${res.getResponseCode()}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// ===== セットアップ（初回手動実行） =====
function setup() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('先にスクリプトプロパティ SHEET_ID を設定してください');

  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f1f3f4');
    sheet.setFrozenRows(1);
  }

  let config = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!config) {
    config = ss.insertSheet(CONFIG_SHEET_NAME);
    config.appendRow(['担当者候補', 'Webhook URL(参考)']);
    config.hideSheet();
  }

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES, true).setAllowInvalid(false).build();
  sheet.getRange(2, COL.STATUS, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule);

  const assigneeRange = config.getRange('A2:A');
  const assigneeRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(assigneeRange, true).setAllowInvalid(true).build();
  sheet.getRange(2, COL.ASSIGNEE, sheet.getMaxRows() - 1, 1).setDataValidation(assigneeRule);

  applyConditionalFormats_(sheet);

  ensureLabel_(LABEL_UNPROCESSED);
  ensureLabel_(LABEL_PROCESSED);

  registerTriggers_();

  console.log('セットアップ完了');
}

function applyConditionalFormats_(sheet) {
  const maxRow = sheet.getMaxRows();
  const statusRange = sheet.getRange(2, COL.STATUS, maxRow - 1, 1);
  const deadlineRange = sheet.getRange(2, COL.DEADLINE, maxRow - 1, 1);

  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.UNHANDLED)
      .setBackground('#fce8e6').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.IN_PROGRESS)
      .setBackground('#fff7e0').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.COMPLETED)
      .setBackground('#eceff1').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.ON_HOLD)
      .setBackground('#e8eaed').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($I2<>"", $I2<TODAY(), $G2<>"${STATUS.COMPLETED}", $G2<>"${STATUS.ON_HOLD}")`)
      .setBackground('#f4c7c3').setRanges([deadlineRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($I2<>"", $I2=TODAY(), $G2<>"${STATUS.COMPLETED}", $G2<>"${STATUS.ON_HOLD}")`)
      .setBackground('#fff2cc').setRanges([deadlineRange]).build()
  ];
  sheet.setConditionalFormatRules(rules);
}

function ensureLabel_(name) {
  if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
}

function registerTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'fetchAndSync' || fn === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('fetchAndSync').timeBased().everyMinutes(5).create();

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.openById(sheetId))
    .onEdit()
    .create();
}
