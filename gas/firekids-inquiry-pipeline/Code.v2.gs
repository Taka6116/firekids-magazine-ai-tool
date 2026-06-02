/**
 * [FIRE_KIDS] 問い合わせ管理パイプライン v2 (Webhook版・P1〜P5)
 *
 * v1からの差分:
 *   - 列追加: カテゴリ / 優先度 / SLA期限 / 初回応答日時 / 添付 / リマインド履歴
 *   - サブシート: _history / inquiry_bodies（_config は v1継承＋拡張）
 *   - 自動分類: 件名・本文キーワードから カテゴリ・優先度・SLA期限 を自動付与
 *   - 添付ファイル: Driveフォルダへ自動保管しシートに参照リンク
 *   - 本文全文: 別シート inquiry_bodies へ保存
 *   - リマインド: 毎時 remindOverdue（未対応24h / 緊急4h / 期限超過）
 *   - デイリーサマリ: 平日09:00 postDailySummary（メイン＋広告実績Webhookへ同報）
 *
 * セットアップ手順:
 *   1. v1のCode.gsと共存させる（本ファイルを追加するだけ）
 *   2. スクリプトプロパティ追加:
 *        SHEET_ID                 = v1と同じ
 *        SLACK_WEBHOOK_URL        = v1と同じ（メインチャネル）
 *        SLACK_WEBHOOK_URL_ADPERF = 広告実績チャネル用Webhook URL（任意。未設定なら同報スキップ）
 *        ADMIN_EMAIL              = エラー通知先（任意）
 *        DRIVE_ATTACHMENT_FOLDER_ID = 添付保存先Driveフォルダ ID（任意。未設定なら自動作成）
 *   3. スクリプトエディタで setupV2() を一度実行
 *      → 列追加・サブシート作成・トリガー登録（v1のfetchAndSyncトリガーは置換）
 */

// ====================================================================
// 定数
// ====================================================================
const V2_SHEET_NAME       = 'inquiries';
const V2_CONFIG_SHEET     = '_config';
const V2_HISTORY_SHEET    = '_history';
const V2_BODIES_SHEET     = 'inquiry_bodies';
const V2_INGEST_RULES_SHEET = '_ingest_rules';
const V2_INGEST_HEADERS   = ['From条件', 'To条件', '件名条件(正規表現)', '既定カテゴリ', '既定優先度', '有効'];
const V2_INGEST_LOOKBACK  = '30d'; // 各ルールの検索対象期間

// P1.5 追加
const V2_TEMPLATES_SHEET   = '_templates';
const V2_TEMPLATES_HEADERS = ['カテゴリ', '件名テンプレ', '本文テンプレ'];
const V2_STALE_DAYS = 3;        // 「対応中」放置の閾値 (日)
const V2_HEARTBEAT_MAX_HOURS = 12; // ヒートビート: 直近実行が これより古いとアラート
// P1.6-3: 履歴ローテーション
const V2_HISTORY_ARCHIVE_SHEET = '_history_archive';
const V2_HISTORY_RETAIN_DAYS = 90; // メイン履歴に残す日数
const V2_HISTORY_BATCH_LIMIT = 2000; // 1回のローテーションで動かす最大行数

// P1.6-4: PIIマスク
const V2_PII_PATTERNS = [
  // クレジットカード番号 (13-19桁、ハイフン/空白区切り対応)
  { re: /\b(?:\d[ -]?){13,19}\b/g, replace: '[CARD-REDACTED]' },
  // 電話番号 (国内: 0X-XXXX-XXXX / 0X0-XXXX-XXXX 等)
  { re: /\b0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}\b/g, replace: '[PHONE-REDACTED]' },
  // マイナンバー (12桁)
  { re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, replace: '[MYNUM-REDACTED]' }
];

const V2_LABEL_UNPROCESSED_PARENT = '問い合わせ-未処理';
const V2_LABEL_PROCESSED          = '問い合わせ-処理済';

// v1列（番号維持）
const V2_COL = {
  ID: 1, RECEIVED: 2, FROM: 3, SUBJECT: 4, PREVIEW: 5, GMAIL_URL: 6,
  STATUS: 7, ASSIGNEE: 8, DEADLINE: 9, MEMO: 10, COMPLETED: 11,
  NOTIFIED: 12, MSG_ID: 13,
  // v2新規（末尾追加）
  CATEGORY: 14, PRIORITY: 15, SLA_DEADLINE: 16,
  FIRST_REPLY: 17, ATTACHMENTS: 18, REMIND_HIST: 19
};
const V2_HEADERS = [
  'ID', '受信日時', '送信元', '件名', '本文プレビュー', 'Gmailリンク',
  'ステータス', '担当者', '対応期限', '対応メモ', '完了日時',
  'Slack通知済', 'Gmail Message ID',
  'カテゴリ', '優先度', 'SLA期限', '初回応答日時', '添付', 'リマインド履歴'
];

const V2_STATUS = {
  UNHANDLED:   '未対応',
  IN_PROGRESS: '対応中',
  COMPLETED:   '完了',
  ON_HOLD:     '保留'
};
const V2_STATUS_VALUES = [V2_STATUS.UNHANDLED, V2_STATUS.IN_PROGRESS, V2_STATUS.COMPLETED, V2_STATUS.ON_HOLD];

const V2_PRIORITY = { URGENT: '緊急', HIGH: '高', MID: '中', LOW: '低' };
const V2_PRIORITY_VALUES = [V2_PRIORITY.URGENT, V2_PRIORITY.HIGH, V2_PRIORITY.MID, V2_PRIORITY.LOW];

const V2_CATEGORY = {
  ASSESSMENT: '査定・買取',
  REPAIR:     '修理・OH',
  STOCK:      '在庫問い合わせ',
  CLAIM:      'クレーム',
  OTHER:      '一般問い合わせ'
};
const V2_CATEGORY_VALUES = [
  V2_CATEGORY.ASSESSMENT, V2_CATEGORY.REPAIR, V2_CATEGORY.STOCK, V2_CATEGORY.CLAIM, V2_CATEGORY.OTHER
];

// カテゴリ初期辞書（_config 未設定時のフォールバック）
const V2_CATEGORY_RULES = [
  { category: V2_CATEGORY.CLAIM,      priority: V2_PRIORITY.URGENT, slaHours: 4,
    keywords: ['クレーム', '不具合', '返品', '返金', '弁護士', '消費者センター'] },
  { category: V2_CATEGORY.ASSESSMENT, priority: V2_PRIORITY.HIGH,   slaHours: 24,
    keywords: ['査定', '買取', 'いくら', '見積', '見積もり', '売却'] },
  { category: V2_CATEGORY.REPAIR,     priority: V2_PRIORITY.MID,    slaHours: 48,
    keywords: ['修理', 'オーバーホール', 'OH', '止まる', '動かない', '進む', '遅れる', '電池'] },
  { category: V2_CATEGORY.STOCK,      priority: V2_PRIORITY.MID,    slaHours: 24,
    keywords: ['在庫', '取り置き', '入荷', '取り寄せ', '現物', '実物'] }
];
const V2_CATEGORY_DEFAULT = {
  category: V2_CATEGORY.OTHER,
  priority: V2_PRIORITY.LOW,
  slaHours: 72
};

const V2_PREVIEW_SHEET_LEN = 500;
const V2_PREVIEW_SLACK_LEN = 150;

// リマインドしきい値
const V2_REMIND_UNHANDLED_HOURS = 24;
const V2_REMIND_URGENT_HOURS    = 4;

// 添付保存先（プロパティ未指定時に自動作成するフォルダ名）
const V2_DRIVE_ROOT_FOLDER_NAME = 'firekids_inquiry_attachments';


// ====================================================================
// エントリポイント: 時限トリガー (5分毎) — v1 fetchAndSync の置換
// ====================================================================
function fetchAndSyncV2() {
  const props = PropertiesService.getScriptProperties();
  const sheetId    = props.getProperty('SHEET_ID');
  const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL');
  if (!sheetId || !webhookUrl) throw new Error('SHEET_ID または SLACK_WEBHOOK_URL が未設定です');

  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet) throw new Error(`シート ${V2_SHEET_NAME} が見つかりません`);
  const gid = sheet.getSheetId();

  const labelTo = GmailApp.getUserLabelByName(V2_LABEL_PROCESSED) || GmailApp.createLabel(V2_LABEL_PROCESSED);
  const knownIds = getExistingMessageIdsV2_(sheet);
  const categoryRules   = loadCategoryRules_(ss);
  const attachmentsRoot = ensureAttachmentRootFolder_();

  // ===== 方式A: ホワイトリスト（_ingest_rules）取り込み =====
  fetchByIngestRules_(ss, sheet, gid, sheetId, webhookUrl, knownIds, categoryRules, attachmentsRoot, labelTo);

  // ===== 方式B: Gmailラベル取り込み（後方互換） =====
  const targetLabels = listUnprocessedLabels_();
  if (targetLabels.length === 0) {
    // ラベル未整備でもホワイトリストだけで動作可。未通知再送のみ実行して終了。
    retryUnnotifiedV2_(sheet, webhookUrl, sheetId, gid);
    PropertiesService.getScriptProperties().setProperty('LAST_FETCH_TS', String(Date.now()));
    return;
  }

  targetLabels.forEach(label => {
    const subLabel = label.getName().substring(V2_LABEL_UNPROCESSED_PARENT.length + 1); // '' or 'フォーム' 等
    const threads  = label.getThreads(0, 50);

    threads.forEach(thread => {
      try {
        const messages = thread.getMessages();
        const latest   = messages[messages.length - 1];
        const msgId    = latest.getId();

        if (!knownIds.has(msgId)) {
          const classified  = classifyInquiry_(latest, categoryRules);
          const attachLinks = saveAttachmentsToDrive_(latest, attachmentsRoot);
          const rowIndex    = appendInquiryRowV2_(sheet, latest, thread, classified, attachLinks, subLabel);
          saveFullBodyToBodiesSheet_(ss, rowIndex, latest);

          const ok = postNewInquiryToSlack_(webhookUrl, latest, thread, rowIndex, sheetId, gid, classified, attachLinks);
          sheet.getRange(rowIndex, V2_COL.NOTIFIED).setValue(ok);
          knownIds.add(msgId);
          logHistory_(ss, rowIndex, '新規受信', `category=${classified.category} priority=${classified.priority}`);
        }

        thread.removeLabel(label);
        thread.addLabel(labelTo);
      } catch (err) {
        logError_(`fetchAndSyncV2 (thread=${thread.getId()})`, err);
      }
    });
  });

  retryUnnotifiedV2_(sheet, webhookUrl, sheetId, gid);
  PropertiesService.getScriptProperties().setProperty('LAST_FETCH_TS', String(Date.now()));
}


// ====================================================================
// エントリポイント: Gmail返信自動検知 (P1.6-2: 30分毎の独立トリガー)
// ====================================================================
function detectFirstRepliesJob() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) return;
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet) return;
  detectFirstReplies_(ss, sheet);
}


// ====================================================================
// エントリポイント: シート編集
// ====================================================================
function onSheetEditV2(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    if (sheet.getName() !== V2_SHEET_NAME) return;
    const row = range.getRow();
    if (row === 1) return;
    const col = range.getColumn();

    // ステータス変更
    if (col === V2_COL.STATUS) {
      const newValue = range.getValue();
      const ss = sheet.getParent();

      // A1: 完了時の対応メモ必須化
      if (newValue === V2_STATUS.COMPLETED) {
        const memo = sheet.getRange(row, V2_COL.MEMO).getValue();
        if (!memo || String(memo).trim().length === 0) {
          // ステータスを差し戻し（イベントループ防止のため再度書き戻し）
          range.setValue(V2_STATUS.IN_PROGRESS);
          const id = sheet.getRange(row, V2_COL.ID).getValue();
          const webhookUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
          if (webhookUrl) {
            postSlack_(webhookUrl, {
              blocks: [
                { type: 'header', text: { type: 'plain_text', text: ':warning: 完了処理ブロック' } },
                { type: 'section', text: { type: 'mrkdwn', text: `*#${id}* の完了処理を中断しました。\n*対応メモ*が空のため、内容を記入してから再度「完了」にしてください。` } }
              ]
            });
          }
          logHistory_(ss, row, '完了処理ブロック', '対応メモ空');
          return;
        }

        // 完了 → 完了日時 自動付与
        const completedCell = sheet.getRange(row, V2_COL.COMPLETED);
        if (!completedCell.getValue()) completedCell.setValue(new Date());
      }

      // 「対応中」へ遷移したら 初回応答日時 を自動付与（未設定時のみ）
      if (newValue === V2_STATUS.IN_PROGRESS) {
        const firstReplyCell = sheet.getRange(row, V2_COL.FIRST_REPLY);
        if (!firstReplyCell.getValue()) firstReplyCell.setValue(new Date());
      }

      logHistory_(ss, row, 'ステータス変更', `→ ${newValue}`);
    }

    // 担当者変更
    if (col === V2_COL.ASSIGNEE) {
      logHistory_(sheet.getParent(), row, '担当者変更', `→ ${range.getValue() || '(未アサイン)'}`);
    }
  } catch (err) {
    logError_('onSheetEditV2', err);
  }
}


// ====================================================================
// エントリポイント: しきい値リマインド (毎時実行)
// ====================================================================
function remindOverdue() {
  const props = PropertiesService.getScriptProperties();
  const sheetId    = props.getProperty('SHEET_ID');
  const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL');
  if (!sheetId || !webhookUrl) return;

  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet) return;
  const gid = sheet.getSheetId();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, V2_HEADERS.length).getValues();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  values.forEach((row, i) => {
    const rowIndex = i + 2;
    const status   = row[V2_COL.STATUS - 1];
    const received = row[V2_COL.RECEIVED - 1];
    const priority = row[V2_COL.PRIORITY - 1];
    const sla      = row[V2_COL.SLA_DEADLINE - 1];
    const deadline = row[V2_COL.DEADLINE - 1];
    const assignee = row[V2_COL.ASSIGNEE - 1];
    const subject  = row[V2_COL.SUBJECT - 1];
    const historyStr = row[V2_COL.REMIND_HIST - 1] || '';
    const history = parseRemindHistory_(historyStr);

    if (status === V2_STATUS.COMPLETED || status === V2_STATUS.ON_HOLD) return;
    if (!received) return;

    const hoursSinceReceived = (now - new Date(received)) / 3600000;
    const reminders = [];

    // 緊急4h
    if (priority === V2_PRIORITY.URGENT && status === V2_STATUS.UNHANDLED && hoursSinceReceived >= V2_REMIND_URGENT_HOURS) {
      if (!hasRecentReminder_(history, 'urgent_4h', 4)) reminders.push({ key: 'urgent_4h', label: ':rotating_light: 緊急優先度・4時間経過' });
    }
    // 未対応24h
    if (status === V2_STATUS.UNHANDLED && hoursSinceReceived >= V2_REMIND_UNHANDLED_HOURS) {
      if (!hasRecentReminder_(history, 'unhandled_24h', 24)) reminders.push({ key: 'unhandled_24h', label: ':warning: 未対応24時間経過' });
    }
    // SLA超過（SLA期限が過ぎている）
    if (sla && new Date(sla) < now) {
      if (!hasRecentReminder_(history, 'sla_overdue', 24)) reminders.push({ key: 'sla_overdue', label: ':alarm_clock: SLA期限超過' });
    }
    // 対応期限当日／超過
    if (deadline) {
      const dl = new Date(deadline);
      const dlStr = Utilities.formatDate(dl, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (dlStr < todayStr) {
        if (!hasRecentReminder_(history, 'deadline_over', 24)) reminders.push({ key: 'deadline_over', label: ':red_circle: 対応期限超過' });
      } else if (dlStr === todayStr) {
        if (!hasRecentReminder_(history, 'deadline_today', 24)) reminders.push({ key: 'deadline_today', label: ':hourglass: 対応期限当日' });
      }
    }

    if (reminders.length === 0) return;

    const sheetRowUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}&range=A${rowIndex}`;
    const ok = postReminderToSlack_(webhookUrl, {
      id: row[V2_COL.ID - 1],
      subject: subject,
      from: row[V2_COL.FROM - 1],
      assignee: assignee,
      category: row[V2_COL.CATEGORY - 1],
      priority: priority,
      sheetUrl: sheetRowUrl,
      reasons: reminders.map(r => r.label)
    });

    if (ok) {
      reminders.forEach(r => history.push({ key: r.key, at: now.toISOString() }));
      sheet.getRange(rowIndex, V2_COL.REMIND_HIST).setValue(JSON.stringify(history));
      logHistory_(ss, rowIndex, 'リマインド送信', reminders.map(r => r.key).join(','));
    }
  });
}


// ====================================================================
// エントリポイント: デイリーサマリ (平日09:00)
// ====================================================================
function postDailySummary() {
  const props = PropertiesService.getScriptProperties();
  const sheetId       = props.getProperty('SHEET_ID');
  const webhookMain   = props.getProperty('SLACK_WEBHOOK_URL');
  const webhookAdperf = props.getProperty('SLACK_WEBHOOK_URL_ADPERF'); // 任意
  if (!sheetId || !webhookMain) return;

  const tz = Session.getScriptTimeZone();
  const dow = new Date().getDay(); // 0=日 6=土
  if (dow === 0 || dow === 6) return; // 平日のみ

  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet) return;
  const gid = sheet.getSheetId();
  const lastRow = sheet.getLastRow();

  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd');

  const summary = {
    yNew: 0, yCompleted: 0,
    unhandled: 0, unhandledHigh: 0, inProgress: 0, onHold: 0,
    overdue: 0, dueToday: 0,
    byAssignee: {}, unassigned: 0,
    overdueDetails: [], dueTodayDetails: []
  };

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, V2_HEADERS.length).getValues();
    values.forEach(row => {
      const status   = row[V2_COL.STATUS - 1];
      const received = row[V2_COL.RECEIVED - 1];
      const completed = row[V2_COL.COMPLETED - 1];
      const priority = row[V2_COL.PRIORITY - 1];
      const deadline = row[V2_COL.DEADLINE - 1];
      const assignee = row[V2_COL.ASSIGNEE - 1] || '';
      const id = row[V2_COL.ID - 1];
      const subject = row[V2_COL.SUBJECT - 1];

      // 昨日新着
      if (received && Utilities.formatDate(new Date(received), tz, 'yyyy-MM-dd') === yesterdayStr) summary.yNew++;
      // 昨日完了
      if (completed && Utilities.formatDate(new Date(completed), tz, 'yyyy-MM-dd') === yesterdayStr) summary.yCompleted++;

      // 現状ステータス
      if (status === V2_STATUS.UNHANDLED) {
        summary.unhandled++;
        if (priority === V2_PRIORITY.URGENT || priority === V2_PRIORITY.HIGH) summary.unhandledHigh++;
      } else if (status === V2_STATUS.IN_PROGRESS) {
        summary.inProgress++;
      } else if (status === V2_STATUS.ON_HOLD) {
        summary.onHold++;
      }

      // 期限アラート（未完了のみ）
      if (status !== V2_STATUS.COMPLETED && status !== V2_STATUS.ON_HOLD && deadline) {
        const dlStr = Utilities.formatDate(new Date(deadline), tz, 'yyyy-MM-dd');
        if (dlStr < todayStr) {
          summary.overdue++;
          summary.overdueDetails.push(`#${id} ${truncate_(subject, 30)} (${assignee || '未アサイン'})`);
        } else if (dlStr === todayStr) {
          summary.dueToday++;
          summary.dueTodayDetails.push(`#${id} ${truncate_(subject, 30)} (${assignee || '未アサイン'})`);
        }
      }

      // 担当別未完件数
      if (status !== V2_STATUS.COMPLETED) {
        if (assignee) {
          summary.byAssignee[assignee] = (summary.byAssignee[assignee] || 0) + 1;
        } else {
          summary.unassigned++;
        }
      }
    });
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`;
  const text = buildDailySummaryText_(summary, todayStr, sheetUrl);

  const payload = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `:sunny: [FIRE_KIDS] 朝会用 問い合わせサマリ (${todayStr})` } },
      { type: 'section', text: { type: 'mrkdwn', text: text } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<${sheetUrl}|シートを開く>` }] }
    ]
  };

  postSlack_(webhookMain, payload);
  if (webhookAdperf) postSlack_(webhookAdperf, payload);
}


// ====================================================================
// シート操作
// ====================================================================
function appendInquiryRowV2_(sheet, msg, thread, classified, attachLinks, subLabel) {
  const nextId = generateNextId_(sheet); // P1.6-1: 永続カウンタで採番

  const row = new Array(V2_HEADERS.length).fill('');
  row[V2_COL.ID - 1]           = nextId;
  row[V2_COL.RECEIVED - 1]     = msg.getDate();
  row[V2_COL.FROM - 1]         = msg.getFrom();
  row[V2_COL.SUBJECT - 1]      = msg.getSubject();
  row[V2_COL.PREVIEW - 1]      = makePreview_(msg.getPlainBody(), V2_PREVIEW_SHEET_LEN);
  row[V2_COL.GMAIL_URL - 1]    = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;
  row[V2_COL.STATUS - 1]       = V2_STATUS.UNHANDLED;
  row[V2_COL.NOTIFIED - 1]     = false;
  row[V2_COL.MSG_ID - 1]       = msg.getId();
  const category = subLabel || classified.category;
  row[V2_COL.CATEGORY - 1]     = category;
  row[V2_COL.PRIORITY - 1]     = classified.priority;
  row[V2_COL.SLA_DEADLINE - 1] = classified.slaDeadline;
  row[V2_COL.ATTACHMENTS - 1]  = (attachLinks && attachLinks.length) ? attachLinks.join(', ') : '';
  row[V2_COL.REMIND_HIST - 1]  = '';

  // B2: 対応期限を SLA期限と同値で自動セット（手動上書き可）
  row[V2_COL.DEADLINE - 1]     = classified.slaDeadline;

  sheet.appendRow(row);
  return sheet.getLastRow();
}

// P1.6-1: 永続連番＋LockServiceでID採番（行削除・並び替えに非依存）
function generateNextId_(sheet) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let next = parseInt(props.getProperty('NEXT_ID'), 10);
    if (!Number.isFinite(next) || next <= 0) {
      // 初回 or 破損時: 既存シートの最大IDから復元
      next = bootstrapNextIdFromSheet_(sheet) + 1;
    }
    props.setProperty('NEXT_ID', String(next + 1));
    return next;
  } finally {
    lock.releaseLock();
  }
}
function bootstrapNextIdFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, V2_COL.ID, lastRow - 1, 1).getValues();
  let max = 0;
  values.forEach(r => {
    const n = Number(r[0]);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max;
}

function getExistingMessageIdsV2_(sheet) {
  const lastRow = sheet.getLastRow();
  const set = new Set();
  if (lastRow < 2) return set;
  const values = sheet.getRange(2, V2_COL.MSG_ID, lastRow - 1, 1).getValues();
  values.forEach(r => { if (r[0]) set.add(String(r[0])); });
  return set;
}

// ====================================================================
// ホワイトリスト取り込み (_ingest_rules)
// ====================================================================
function fetchByIngestRules_(ss, sheet, gid, sheetId, webhookUrl, knownIds, categoryRules, attachmentsRoot, labelTo) {
  const rules = loadIngestRules_(ss);
  if (rules.length === 0) return;

  rules.forEach((rule, ruleIdx) => {
    const query = buildIngestQuery_(rule);
    if (!query) return;

    let threads;
    try { threads = GmailApp.search(query, 0, 50); }
    catch (err) { logError_(`fetchByIngestRules_ (rule#${ruleIdx + 1} query=${query})`, err); return; }

    let subjectRe = null;
    if (rule.subjectRegex) {
      try { subjectRe = new RegExp(rule.subjectRegex); }
      catch (_) { /* invalid regex → 件名フィルタを無視 */ }
    }

    threads.forEach(thread => {
      try {
        const messages = thread.getMessages();
        const latest   = messages[messages.length - 1];
        const msgId    = latest.getId();
        if (knownIds.has(msgId)) { thread.addLabel(labelTo); return; }

        if (subjectRe && !subjectRe.test(latest.getSubject() || '')) return;

        const classified = classifyInquiry_(latest, categoryRules);
        if (rule.defaultCategory) classified.category = rule.defaultCategory;
        if (rule.defaultPriority) classified.priority = rule.defaultPriority;

        const attachLinks = saveAttachmentsToDrive_(latest, attachmentsRoot);
        const rowIndex    = appendInquiryRowV2_(sheet, latest, thread, classified, attachLinks, rule.defaultCategory || '');
        saveFullBodyToBodiesSheet_(ss, rowIndex, latest);

        const ok = postNewInquiryToSlack_(webhookUrl, latest, thread, rowIndex, sheetId, gid, classified, attachLinks);
        sheet.getRange(rowIndex, V2_COL.NOTIFIED).setValue(ok);
        knownIds.add(msgId);

        thread.addLabel(labelTo);
        logHistory_(ss, rowIndex, '新規受信(ルール)', `rule#${ruleIdx + 1} category=${classified.category} priority=${classified.priority}`);
      } catch (err) {
        logError_(`fetchByIngestRules_ (rule#${ruleIdx + 1} thread=${thread.getId()})`, err);
      }
    });
  });
}

function loadIngestRules_(ss) {
  const sh = ss.getSheetByName(V2_INGEST_RULES_SHEET);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = Math.max(sh.getLastColumn(), V2_INGEST_HEADERS.length);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = name => headers.indexOf(name);
  const cFrom = idx('From条件'), cTo = idx('To条件'), cSubj = idx('件名条件(正規表現)');
  const cCat  = idx('既定カテゴリ'), cPri = idx('既定優先度'), cOn = idx('有効');
  if (cFrom < 0 || cTo < 0) return [];

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values
    .map(r => ({
      from:            (r[cFrom] || '').toString().trim(),
      to:              (r[cTo]   || '').toString().trim(),
      subjectRegex:    cSubj >= 0 ? (r[cSubj] || '').toString().trim() : '',
      defaultCategory: cCat  >= 0 ? (r[cCat]  || '').toString().trim() : '',
      defaultPriority: cPri  >= 0 ? (r[cPri]  || '').toString().trim() : '',
      enabled:         cOn   >= 0 ? !(r[cOn] === false || r[cOn] === 'FALSE' || r[cOn] === 'OFF' || r[cOn] === 'off' || r[cOn] === '') : true
    }))
    .filter(r => r.enabled && (r.from || r.to));
}

function buildIngestQuery_(rule) {
  const parts = [];
  if (rule.from) parts.push(`from:(${rule.from})`);
  if (rule.to)   parts.push(`to:(${rule.to})`);
  if (parts.length === 0) return '';
  parts.push(`newer_than:${V2_INGEST_LOOKBACK}`);
  parts.push(`-label:${V2_LABEL_PROCESSED}`);
  return parts.join(' ');
}

function saveFullBodyToBodiesSheet_(ss, mainRowIndex, msg) {
  const bodies = ss.getSheetByName(V2_BODIES_SHEET);
  if (!bodies) return;
  // P1.6-4: PIIマスク (電話番号・カード番号・マイナンバー)
  bodies.appendRow([
    mainRowIndex,
    msg.getId(),
    maskPii_(msg.getPlainBody()),
    maskPii_(msg.getBody()),
    msg.getDate()
  ]);
}
function maskPii_(text) {
  if (!text) return '';
  let out = String(text);
  V2_PII_PATTERNS.forEach(p => { out = out.replace(p.re, p.replace); });
  return out;
}


// ====================================================================
// 自動分類
// ====================================================================
function classifyInquiry_(msg, rules) {
  const haystack = `${msg.getSubject() || ''}\n${msg.getPlainBody() || ''}`;
  const matched = (rules || V2_CATEGORY_RULES).find(r => r.keywords.some(k => haystack.indexOf(k) !== -1));
  const picked = matched || V2_CATEGORY_DEFAULT;
  const slaDeadline = new Date(msg.getDate().getTime() + picked.slaHours * 3600000);
  return {
    category: picked.category,
    priority: picked.priority,
    slaHours: picked.slaHours,
    slaDeadline: slaDeadline
  };
}

function loadCategoryRules_(ss) {
  // _config シートに分類辞書を持たせる場合の読込
  // 列: カテゴリ / 優先度 / SLA(時間) / キーワード(カンマ区切り)
  const config = ss.getSheetByName(V2_CONFIG_SHEET);
  if (!config) return V2_CATEGORY_RULES;
  const lastCol = config.getLastColumn();
  const lastRow = config.getLastRow();
  if (lastRow < 2 || lastCol < 4) return V2_CATEGORY_RULES;

  // ヘッダで「カテゴリ」列を探す
  const headers = config.getRange(1, 1, 1, lastCol).getValues()[0];
  const cIdx = headers.indexOf('カテゴリ');
  const pIdx = headers.indexOf('優先度');
  const sIdx = headers.indexOf('SLA(時間)');
  const kIdx = headers.indexOf('キーワード(カンマ区切り)');
  if (cIdx < 0 || pIdx < 0 || sIdx < 0 || kIdx < 0) return V2_CATEGORY_RULES;

  const values = config.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const rules = values
    .filter(r => r[cIdx] && r[kIdx])
    .map(r => ({
      category: String(r[cIdx]),
      priority: String(r[pIdx]) || V2_PRIORITY.LOW,
      slaHours: Number(r[sIdx]) || 72,
      keywords: String(r[kIdx]).split(/[,，、]/).map(s => s.trim()).filter(Boolean)
    }));
  return rules.length > 0 ? rules : V2_CATEGORY_RULES;
}


// ====================================================================
// 添付ファイル保存
// ====================================================================
function ensureAttachmentRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DRIVE_ATTACHMENT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (_) { /* fallthrough */ }
  }
  // 自動作成（マイドライブ直下）
  const iter = DriveApp.getFoldersByName(V2_DRIVE_ROOT_FOLDER_NAME);
  const folder = iter.hasNext() ? iter.next() : DriveApp.createFolder(V2_DRIVE_ROOT_FOLDER_NAME);
  props.setProperty('DRIVE_ATTACHMENT_FOLDER_ID', folder.getId());
  return folder;
}

function saveAttachmentsToDrive_(msg, rootFolder) {
  const atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  if (!atts || atts.length === 0) return [];

  const ym = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM');
  const monthFolder = getOrCreateChildFolder_(rootFolder, ym);

  const dateStr = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  const from = (msg.getFrom() || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const fromLocal = from ? from[0].split('@')[0] : 'unknown';

  return atts.map(att => {
    try {
      const safeName = `${dateStr}_${fromLocal}_${att.getName()}`.replace(/[\\/:*?"<>|]/g, '_');
      const file = monthFolder.createFile(att.copyBlob().setName(safeName));
      return file.getUrl();
    } catch (err) {
      logError_('saveAttachmentsToDrive_', err);
      return null;
    }
  }).filter(Boolean);
}

function getOrCreateChildFolder_(parent, name) {
  const iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : parent.createFolder(name);
}


// ====================================================================
// Slack 投稿
// ====================================================================
function postNewInquiryToSlack_(webhookUrl, msg, thread, rowIndex, sheetId, gid, classified, attachLinks) {
  const sheetRowUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}&range=A${rowIndex}`;
  const gmailUrl    = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;
  const preview     = makePreview_(msg.getPlainBody(), V2_PREVIEW_SLACK_LEN);
  const priorityEmoji = priorityToEmoji_(classified.priority);
  const slaStr = Utilities.formatDate(classified.slaDeadline, Session.getScriptTimeZone(), 'MM/dd HH:mm');

  const fields = [
    { type: 'mrkdwn', text: `*件名*\n${escapeForMrkdwn_(msg.getSubject() || '(no subject)')}` },
    { type: 'mrkdwn', text: `*From*\n${escapeForMrkdwn_(msg.getFrom())}` },
    { type: 'mrkdwn', text: `*カテゴリ*\n${classified.category}` },
    { type: 'mrkdwn', text: `*優先度*\n${priorityEmoji}${classified.priority}` },
    { type: 'mrkdwn', text: `*SLA期限*\n${slaStr}` }
  ];
  if (attachLinks && attachLinks.length) {
    fields.push({ type: 'mrkdwn', text: `*添付*\n${attachLinks.length}件 (Drive保存済)` });
  }

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${priorityEmoji}[FIRE_KIDS] 新規問い合わせ` } },
    { type: 'section', fields: fields },
    { type: 'section', text: { type: 'mrkdwn', text: preview ? `>${preview.replace(/\n/g, '\n>')}` : '_本文なし_' } },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Gmailで開く' }, url: gmailUrl },
        { type: 'button', text: { type: 'plain_text', text: 'シートで管理' }, url: sheetRowUrl }
      ]
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: ':memo: 返信下書きは、シートで該当行を選択 →「問い合わせパイプライン v2」→「選択行から返信下書きを作成」で生成できます' }] }
  ];

  return postSlack_(webhookUrl, { blocks: blocks });
}

function postReminderToSlack_(webhookUrl, info) {
  const priorityEmoji = priorityToEmoji_(info.priority);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: ':bell: 問い合わせリマインド' } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: info.reasons.map(r => `• ${r}`).join('\n') }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*ID*\n#${info.id}` },
        { type: 'mrkdwn', text: `*件名*\n${escapeForMrkdwn_(info.subject || '(no subject)')}` },
        { type: 'mrkdwn', text: `*From*\n${escapeForMrkdwn_(info.from || '')}` },
        { type: 'mrkdwn', text: `*担当*\n${info.assignee || '_未アサイン_'}` },
        { type: 'mrkdwn', text: `*カテゴリ*\n${info.category || ''}` },
        { type: 'mrkdwn', text: `*優先度*\n${priorityEmoji}${info.priority || ''}` }
      ]
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'シートで開く' }, url: info.sheetUrl }
      ]
    }
  ];
  return postSlack_(webhookUrl, { blocks: blocks });
}

function postSlack_(webhookUrl, payload) {
  try {
    const res = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return res.getResponseCode() === 200;
  } catch (err) {
    logError_('postSlack_', err);
    return false;
  }
}

function retryUnnotifiedV2_(sheet, webhookUrl, sheetId, gid) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const range = sheet.getRange(2, 1, lastRow - 1, V2_HEADERS.length);
  const values = range.getValues();

  values.forEach((row, i) => {
    const rowIndex = i + 2;
    const notified = row[V2_COL.NOTIFIED - 1];
    const msgId    = row[V2_COL.MSG_ID - 1];
    if (notified === true || !msgId) return;

    try {
      const msg = GmailApp.getMessageById(msgId);
      if (!msg) return;
      const thread = msg.getThread();
      const classified = {
        category: row[V2_COL.CATEGORY - 1] || '',
        priority: row[V2_COL.PRIORITY - 1] || '',
        slaDeadline: row[V2_COL.SLA_DEADLINE - 1] ? new Date(row[V2_COL.SLA_DEADLINE - 1]) : new Date()
      };
      const attachLinks = (row[V2_COL.ATTACHMENTS - 1] || '').split(',').map(s => s.trim()).filter(Boolean);
      const ok = postNewInquiryToSlack_(webhookUrl, msg, thread, rowIndex, sheetId, gid, classified, attachLinks);
      sheet.getRange(rowIndex, V2_COL.NOTIFIED).setValue(ok);
    } catch (err) {
      logError_(`retryUnnotifiedV2_ (row=${rowIndex})`, err);
    }
  });
}


// ====================================================================
// デイリーサマリ整形
// ====================================================================
function buildDailySummaryText_(s, todayStr, sheetUrl) {
  const lines = [];
  lines.push(`*■ 昨日の動き*`);
  lines.push(`  新着: ${s.yNew}件 / 完了: ${s.yCompleted}件`);
  lines.push('');
  lines.push(`*■ 現在のステータス*`);
  lines.push(`  未対応: ${s.unhandled}件 (うち優先度高以上 ${s.unhandledHigh}件)`);
  lines.push(`  対応中: ${s.inProgress}件 / 保留: ${s.onHold}件`);
  lines.push('');
  lines.push(`*■ 期限アラート*`);
  lines.push(`  期限超過: ${s.overdue}件`);
  if (s.overdueDetails.length) {
    s.overdueDetails.slice(0, 10).forEach(d => lines.push(`    - ${d}`));
    if (s.overdueDetails.length > 10) lines.push(`    ...他 ${s.overdueDetails.length - 10}件`);
  }
  lines.push(`  本日期限: ${s.dueToday}件`);
  if (s.dueTodayDetails.length) {
    s.dueTodayDetails.slice(0, 10).forEach(d => lines.push(`    - ${d}`));
    if (s.dueTodayDetails.length > 10) lines.push(`    ...他 ${s.dueTodayDetails.length - 10}件`);
  }
  lines.push('');
  lines.push(`*■ 担当別未完件数*`);
  const sorted = Object.keys(s.byAssignee).sort((a, b) => s.byAssignee[b] - s.byAssignee[a]);
  sorted.forEach(name => lines.push(`  ${name}: ${s.byAssignee[name]}件`));
  if (s.unassigned > 0) lines.push(`  *未アサイン: ${s.unassigned}件*`);
  lines.push('');
  lines.push(`*■ 朝会チェック*`);
  lines.push(`  ・期限超過${s.overdue}件、対応者をその場で確定したか`);
  lines.push(`  ・緊急優先度の有無を確認したか`);
  if (s.unassigned > 0) lines.push(`  ・未アサイン${s.unassigned}件を引き取ったか`);
  lines.push(`  ・前日完了${s.yCompleted}件のうち、再発対応が必要なものはないか`);

  return lines.join('\n');
}


// ====================================================================
// P1.5-A2: 長期放置検知 (毎日12:00)
// ====================================================================
function staleCheck() {
  const props = PropertiesService.getScriptProperties();
  const sheetId    = props.getProperty('SHEET_ID');
  const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL');
  if (!sheetId || !webhookUrl) return;

  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet) return;
  const gid = sheet.getSheetId();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // _history から行ごとの最終更新時刻を集計
  const lastTouchedById = buildLastTouchedMap_(ss);

  const values = sheet.getRange(2, 1, lastRow - 1, V2_HEADERS.length).getValues();
  const cutoffMs = Date.now() - V2_STALE_DAYS * 86400000;
  const stale = [];

  values.forEach(row => {
    const status = row[V2_COL.STATUS - 1];
    if (status !== V2_STATUS.IN_PROGRESS) return;
    const id = row[V2_COL.ID - 1];
    const subject = row[V2_COL.SUBJECT - 1];
    const assignee = row[V2_COL.ASSIGNEE - 1] || '未アサイン';
    const lastTouched = lastTouchedById[id] || row[V2_COL.RECEIVED - 1];
    if (!lastTouched) return;
    if (new Date(lastTouched).getTime() < cutoffMs) {
      stale.push({ id, subject, assignee, lastTouched });
    }
  });

  if (stale.length === 0) return;

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`;
  const tz = Session.getScriptTimeZone();
  const lines = stale.slice(0, 15).map(s =>
    `• #${s.id} ${truncate_(s.subject, 30)} (${s.assignee}) — 最終更新 ${Utilities.formatDate(new Date(s.lastTouched), tz, 'MM/dd HH:mm')}`
  );
  if (stale.length > 15) lines.push(`...他 ${stale.length - 15}件`);

  postSlack_(webhookUrl, {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `:zzz: ${V2_STALE_DAYS}日以上放置の「対応中」案件 ${stale.length}件` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<${sheetUrl}|シートを開いて状況を更新>` }] }
    ]
  });
}

function buildLastTouchedMap_(ss) {
  const map = {};
  const hist = ss.getSheetByName(V2_HISTORY_SHEET);
  if (!hist) return map;
  const lastRow = hist.getLastRow();
  if (lastRow < 2) return map;
  // 列: 日時 / 対象行 / 操作者 / アクション / 詳細
  // 「対象行」は appendRow 時の rowIndex（シート行番号）= ID と一致
  const values = hist.getRange(2, 1, lastRow - 1, 2).getValues();
  values.forEach(r => {
    const ts = r[0], id = r[1];
    if (!ts || !id) return;
    if (!map[id] || new Date(ts) > new Date(map[id])) map[id] = ts;
  });
  return map;
}


// ====================================================================
// P1.6-3: 履歴ローテーション (毎週日曜03時台)
// ====================================================================
function rotateHistoryJob() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) return;
  const ss = SpreadsheetApp.openById(sheetId);
  const hist = ss.getSheetByName(V2_HISTORY_SHEET);
  if (!hist) return;

  const lastRow = hist.getLastRow();
  if (lastRow < 2) return;

  // _history_archive 作成 (なければ)
  let archive = ss.getSheetByName(V2_HISTORY_ARCHIVE_SHEET);
  if (!archive) {
    archive = ss.insertSheet(V2_HISTORY_ARCHIVE_SHEET);
    const headers = hist.getRange(1, 1, 1, hist.getLastColumn()).getValues()[0];
    archive.appendRow(headers);
    archive.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f1f3f4');
    archive.setFrozenRows(1);
    archive.hideSheet();
  }

  const cutoffMs = Date.now() - V2_HISTORY_RETAIN_DAYS * 86400000;
  const cols = hist.getLastColumn();
  // バッチ上限を考慮（古い順に処理）
  const scanLimit = Math.min(lastRow - 1, V2_HISTORY_BATCH_LIMIT);
  const data = hist.getRange(2, 1, scanLimit, cols).getValues();

  const moveRows = [];
  const keepRows = [];
  data.forEach(r => {
    const ts = r[0];
    if (ts && new Date(ts).getTime() < cutoffMs) moveRows.push(r);
    else keepRows.push(r);
  });

  if (moveRows.length === 0) return;

  // アーカイブへ追記
  archive.getRange(archive.getLastRow() + 1, 1, moveRows.length, cols).setValues(moveRows);

  // 残行を上書き再構成。スキャン外（範囲より下）の行はそのまま保持。
  const untouched = lastRow - 1 - scanLimit;
  if (untouched > 0) {
    const tail = hist.getRange(2 + scanLimit, 1, untouched, cols).getValues();
    keepRows.push(...tail);
  }
  // 既存範囲を一旦クリア
  hist.getRange(2, 1, lastRow - 1, cols).clearContent();
  if (keepRows.length > 0) {
    hist.getRange(2, 1, keepRows.length, cols).setValues(keepRows);
  }

  console.log(`rotateHistoryJob: archived ${moveRows.length} rows`);
}


// ====================================================================
// P1.5-A4: ヒートビート (毎朝08:55)
// ====================================================================
function heartbeat() {
  const props = PropertiesService.getScriptProperties();
  const lastTsStr = props.getProperty('LAST_FETCH_TS');
  const admin     = props.getProperty('ADMIN_EMAIL');
  const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL');

  if (!lastTsStr) {
    // 一度も走っていない
    notifyHeartbeatFailure_('LAST_FETCH_TS 未記録（fetchAndSyncV2 が一度も走っていない可能性）', admin, webhookUrl);
    return;
  }
  const ageHours = (Date.now() - Number(lastTsStr)) / 3600000;
  if (ageHours >= V2_HEARTBEAT_MAX_HOURS) {
    notifyHeartbeatFailure_(`最終取得から ${ageHours.toFixed(1)}h 経過。トリガー停止の可能性あり`, admin, webhookUrl);
  }
}
function notifyHeartbeatFailure_(reason, admin, webhookUrl) {
  const msg = `[FIRE_KIDS Inquiry v2] ヒートビート異常: ${reason}`;
  if (admin) {
    try { MailApp.sendEmail(admin, '[FIRE_KIDS Inquiry v2] ヒートビート異常', msg); } catch (_) { /* mute */ }
  }
  if (webhookUrl) {
    postSlack_(webhookUrl, {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: ':bangbang: パイプライン停止の疑い' } },
        { type: 'section', text: { type: 'mrkdwn', text: msg } }
      ]
    });
  }
}


// ====================================================================
// P1.5-A5: Gmail返信自動検知
// ====================================================================
function detectFirstReplies_(ss, sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const orgDomain = PropertiesService.getScriptProperties().getProperty('ORG_DOMAIN');
  if (!orgDomain) return; // 未設定なら何もしない

  // P1.6-2: タイムアウト対策。1回の実行で処理する未完案件は最大MAX_SCAN件
  const MAX_SCAN = 300;
  const startMs = Date.now();
  const BUDGET_MS = 4 * 60 * 1000; // 4分予算（残り2分は安全マージン）

  const values = sheet.getRange(2, 1, lastRow - 1, V2_HEADERS.length).getValues();
  let scanned = 0;

  values.forEach((row, i) => {
    if (scanned >= MAX_SCAN) return;
    if (Date.now() - startMs > BUDGET_MS) return;
    const rowIndex = i + 2;
    const status     = row[V2_COL.STATUS - 1];
    const firstReply = row[V2_COL.FIRST_REPLY - 1];
    const msgId      = row[V2_COL.MSG_ID - 1];

    if (status === V2_STATUS.COMPLETED || status === V2_STATUS.ON_HOLD) return;
    if (firstReply) return; // 既に記録済み
    if (!msgId) return;

    scanned++;
    try {
      const origMsg = GmailApp.getMessageById(msgId);
      if (!origMsg) return;
      const thread = origMsg.getThread();
      const msgs = thread.getMessages();

      // 元メッセージより後で、社内ドメインからの送信を探す
      const orig = origMsg.getDate().getTime();
      let firstOrgSent = null;
      for (let m of msgs) {
        const d = m.getDate().getTime();
        if (d <= orig) continue;
        const from = (m.getFrom() || '').toLowerCase();
        if (from.indexOf('@' + orgDomain.toLowerCase()) !== -1) {
          firstOrgSent = m.getDate();
          break;
        }
      }
      if (!firstOrgSent) return;

      sheet.getRange(rowIndex, V2_COL.FIRST_REPLY).setValue(firstOrgSent);
      if (status === V2_STATUS.UNHANDLED) {
        sheet.getRange(rowIndex, V2_COL.STATUS).setValue(V2_STATUS.IN_PROGRESS);
        logHistory_(ss, rowIndex, 'Gmail返信検知', 'ステータス→対応中 (自動)');
      } else {
        logHistory_(ss, rowIndex, 'Gmail返信検知', '初回応答日時 自動セット');
      }
    } catch (err) {
      logError_(`detectFirstReplies_ (row=${rowIndex})`, err);
    }
  });
}


// ====================================================================
// P1.5-B3: 返信下書き自動生成
// ====================================================================
function createReplyDraftForRow_(rowIndex) {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID 未設定');
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet || rowIndex < 2) throw new Error('対象行が不正です');

  const row = sheet.getRange(rowIndex, 1, 1, V2_HEADERS.length).getValues()[0];
  const msgId = row[V2_COL.MSG_ID - 1];
  if (!msgId) throw new Error('Gmail Message ID がありません');

  const category = row[V2_COL.CATEGORY - 1];
  const tpl = loadTemplate_(ss, category);
  if (!tpl) throw new Error(`カテゴリ「${category}」のテンプレが _templates シートにありません`);

  const id = row[V2_COL.ID - 1];
  const fromHeader = row[V2_COL.FROM - 1] || '';
  const nameMatch = fromHeader.match(/^"?([^"<]+?)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : fromHeader.split('@')[0];

  const subject = renderTemplate_(tpl.subject, { name, id, subject: row[V2_COL.SUBJECT - 1] || '' });
  const body    = renderTemplate_(tpl.body,    { name, id, subject: row[V2_COL.SUBJECT - 1] || '' });

  const origMsg = GmailApp.getMessageById(msgId);
  origMsg.createDraftReply(body, { subject: subject });
  logHistory_(ss, rowIndex, '返信下書き作成', `category=${category}`);
}

function loadTemplate_(ss, category) {
  const sh = ss.getSheetByName(V2_TEMPLATES_SHEET);
  if (!sh) return null;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  const values = sh.getRange(2, 1, lastRow - 1, V2_TEMPLATES_HEADERS.length).getValues();
  const found = values.find(r => String(r[0]).trim() === String(category).trim());
  if (!found) {
    // フォールバック: 「(共通)」カテゴリ
    const fallback = values.find(r => String(r[0]).trim() === '(共通)');
    if (!fallback) return null;
    return { subject: fallback[1], body: fallback[2] };
  }
  return { subject: found[1], body: found[2] };
}
function renderTemplate_(tpl, vars) {
  let out = String(tpl || '');
  Object.keys(vars).forEach(k => { out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k] || ''); });
  return out;
}


// ====================================================================
// 履歴・ヘルパー
// ====================================================================
function logHistory_(ss, rowId, action, detail) {
  const hist = ss.getSheetByName(V2_HISTORY_SHEET);
  if (!hist) return;
  const user = (Session.getActiveUser && Session.getActiveUser().getEmail()) || 'system';
  hist.appendRow([new Date(), rowId, user, action, detail || '']);
}

function parseRemindHistory_(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch (_) { return []; }
}
function hasRecentReminder_(history, key, withinHours) {
  const cutoff = Date.now() - withinHours * 3600000;
  return history.some(h => h.key === key && new Date(h.at).getTime() >= cutoff);
}

function listUnprocessedLabels_() {
  const prefix = V2_LABEL_UNPROCESSED_PARENT;
  return GmailApp.getUserLabels().filter(l => {
    const n = l.getName();
    return n === prefix || n.indexOf(prefix + '/') === 0;
  });
}

function priorityToEmoji_(p) {
  switch (p) {
    case V2_PRIORITY.URGENT: return ':rotating_light:';
    case V2_PRIORITY.HIGH:   return ':red_circle:';
    case V2_PRIORITY.MID:    return ':large_yellow_circle:';
    case V2_PRIORITY.LOW:    return ':white_circle:';
    default: return '';
  }
}

function makePreview_(body, maxLen) {
  if (!body) return '';
  const flat = String(body).replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > maxLen ? flat.slice(0, maxLen) + '…' : flat;
}
function escapeForMrkdwn_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncate_(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function logError_(where, err) {
  const msg = `[${where}] ${err && err.stack ? err.stack : err}`;
  console.error(msg);
  const admin = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  if (admin) {
    try { MailApp.sendEmail(admin, '[FIRE_KIDS Inquiry v2] エラー', msg); } catch (_) { /* mute */ }
  }
}


// ====================================================================
// セットアップ（v2）
// ====================================================================
function setupV2() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('先にスクリプトプロパティ SHEET_ID を設定してください');

  const ss = SpreadsheetApp.openById(sheetId);

  // メインシート: 列を末尾に拡張
  let sheet = ss.getSheetByName(V2_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(V2_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(V2_HEADERS);
  } else {
    // 既存ヘッダの足りない列を追記
    const lastCol = sheet.getLastColumn();
    if (lastCol < V2_HEADERS.length) {
      sheet.getRange(1, lastCol + 1, 1, V2_HEADERS.length - lastCol)
           .setValues([V2_HEADERS.slice(lastCol)]);
    }
  }
  sheet.getRange(1, 1, 1, V2_HEADERS.length).setFontWeight('bold').setBackground('#f1f3f4');
  sheet.setFrozenRows(1);

  // データ検証: ステータス・優先度・カテゴリ
  const maxRow = sheet.getMaxRows();
  applyDataValidation_(sheet, V2_COL.STATUS,   maxRow, V2_STATUS_VALUES);
  applyDataValidation_(sheet, V2_COL.PRIORITY, maxRow, V2_PRIORITY_VALUES);
  applyDataValidation_(sheet, V2_COL.CATEGORY, maxRow, V2_CATEGORY_VALUES);

  // _config シート: 担当者候補＋分類辞書
  let config = ss.getSheetByName(V2_CONFIG_SHEET);
  if (!config) {
    config = ss.insertSheet(V2_CONFIG_SHEET);
  }
  ensureConfigSchema_(config);

  // _history シート
  let hist = ss.getSheetByName(V2_HISTORY_SHEET);
  if (!hist) {
    hist = ss.insertSheet(V2_HISTORY_SHEET);
    hist.appendRow(['日時', '対象行', '操作者', 'アクション', '詳細']);
    hist.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f1f3f4');
    hist.setFrozenRows(1);
  }

  // _ingest_rules シート（ホワイトリスト取り込み）
  let ingest = ss.getSheetByName(V2_INGEST_RULES_SHEET);
  if (!ingest) {
    ingest = ss.insertSheet(V2_INGEST_RULES_SHEET);
    ingest.appendRow(V2_INGEST_HEADERS);
    ingest.getRange(1, 1, 1, V2_INGEST_HEADERS.length).setFontWeight('bold').setBackground('#f1f3f4');
    ingest.setFrozenRows(1);
    // サンプル行（無効状態で配置・運用者が編集して有効化）
    ingest.appendRow(['noreply@form.firekids.jp', '', '', 'フォーム', V2_PRIORITY.MID, false]);
    ingest.appendRow(['', 'info@firekids.jp', '', '', '', false]);
    ingest.appendRow(['', 'support@firekids.jp', '査定|買取|見積', V2_CATEGORY.ASSESSMENT, V2_PRIORITY.HIGH, false]);
    // 有効列にデータ検証
    const onRule = SpreadsheetApp.newDataValidation().requireValueInList([true, false], true).setAllowInvalid(false).build();
    ingest.getRange(2, V2_INGEST_HEADERS.length, ingest.getMaxRows() - 1, 1).setDataValidation(onRule);
    // 既定カテゴリ・既定優先度の検証
    const catRule = SpreadsheetApp.newDataValidation().requireValueInList(V2_CATEGORY_VALUES, true).setAllowInvalid(true).build();
    const priRule = SpreadsheetApp.newDataValidation().requireValueInList(V2_PRIORITY_VALUES, true).setAllowInvalid(true).build();
    ingest.getRange(2, 4, ingest.getMaxRows() - 1, 1).setDataValidation(catRule);
    ingest.getRange(2, 5, ingest.getMaxRows() - 1, 1).setDataValidation(priRule);
  }

  // _templates シート (P1.5-B3)
  let tpl = ss.getSheetByName(V2_TEMPLATES_SHEET);
  if (!tpl) {
    tpl = ss.insertSheet(V2_TEMPLATES_SHEET);
    tpl.appendRow(V2_TEMPLATES_HEADERS);
    tpl.getRange(1, 1, 1, V2_TEMPLATES_HEADERS.length).setFontWeight('bold').setBackground('#f1f3f4');
    tpl.setFrozenRows(1);
    // デフォルトテンプレ（プレースホルダ: {name} {id} {subject}）
    tpl.appendRow([V2_CATEGORY.ASSESSMENT, 'Re: {subject}', '{name} 様\n\nお問い合わせいただきありがとうございます。FIRE KIDS でございます。\n\n査定のご依頼の件、確認のうえ折り返しご連絡差し上げます。\n\n（管理番号: #{id}）\n']);
    tpl.appendRow([V2_CATEGORY.REPAIR,     'Re: {subject}', '{name} 様\n\nお問い合わせいただきありがとうございます。FIRE KIDS でございます。\n\n修理・オーバーホールに関しましては、現品確認のうえお見積りをご案内いたします。\n\n（管理番号: #{id}）\n']);
    tpl.appendRow([V2_CATEGORY.STOCK,      'Re: {subject}', '{name} 様\n\nお問い合わせいただきありがとうございます。FIRE KIDS でございます。\n\n在庫状況を確認のうえご案内いたします。少々お待ちくださいませ。\n\n（管理番号: #{id}）\n']);
    tpl.appendRow([V2_CATEGORY.CLAIM,      'Re: {subject}', '{name} 様\n\nお問い合わせいただきありがとうございます。FIRE KIDS でございます。\n\nご指摘の件、確認させていただきます。誠に恐れ入りますが、状況を把握次第ご連絡差し上げます。\n\n（管理番号: #{id}）\n']);
    tpl.appendRow(['(共通)',               'Re: {subject}', '{name} 様\n\nお問い合わせいただきありがとうございます。FIRE KIDS でございます。\n\n内容を確認のうえ、改めてご連絡差し上げます。\n\n（管理番号: #{id}）\n']);
  }

  // inquiry_bodies シート
  let bodies = ss.getSheetByName(V2_BODIES_SHEET);
  if (!bodies) {
    bodies = ss.insertSheet(V2_BODIES_SHEET);
    bodies.appendRow(['main_row', 'Gmail Message ID', '本文(plain・PIIマスク済)', '本文(HTML・PIIマスク済)', '受信日時']);
    bodies.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f1f3f4');
    bodies.setFrozenRows(1);
    bodies.hideSheet();
  }
  // P1.6-4: シート保護＋編集者制限
  protectBodiesSheet_(bodies);

  // 担当者ドロップダウン
  const assigneeRange = config.getRange('A2:A');
  const assigneeRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(assigneeRange, true).setAllowInvalid(true).build();
  sheet.getRange(2, V2_COL.ASSIGNEE, maxRow - 1, 1).setDataValidation(assigneeRule);

  // 条件付き書式
  applyConditionalFormatsV2_(sheet);

  // Gmailラベル
  ensureLabel_(V2_LABEL_UNPROCESSED_PARENT);
  ensureLabel_(V2_LABEL_PROCESSED);

  // 添付フォルダ
  ensureAttachmentRootFolder_();

  // P1.6-1: NEXT_ID ブートストラップ
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('NEXT_ID')) {
    props.setProperty('NEXT_ID', String(bootstrapNextIdFromSheet_(sheet) + 1));
  }

  // トリガー登録
  registerTriggersV2_();

  console.log('setupV2 完了');
}

function applyDataValidation_(sheet, col, maxRow, values) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true).setAllowInvalid(true).build();
  sheet.getRange(2, col, maxRow - 1, 1).setDataValidation(rule);
}

function ensureConfigSchema_(config) {
  // 1行目: 担当者候補/Webhook参考 | (空) | カテゴリ辞書
  const want = [
    '担当者候補', 'Webhook URL(参考)', '',
    'カテゴリ', '優先度', 'SLA(時間)', 'キーワード(カンマ区切り)'
  ];
  if (config.getLastRow() === 0) {
    config.appendRow(want);
    V2_CATEGORY_RULES.forEach(r => {
      config.appendRow(['', '', '', r.category, r.priority, r.slaHours, r.keywords.join(',')]);
    });
    config.appendRow(['', '', '', V2_CATEGORY_DEFAULT.category, V2_CATEGORY_DEFAULT.priority, V2_CATEGORY_DEFAULT.slaHours, '(その他すべて)']);
    config.hideSheet();
  } else {
    const headers = config.getRange(1, 1, 1, Math.max(want.length, config.getLastColumn())).getValues()[0];
    let changed = false;
    want.forEach((h, i) => {
      if (h && !headers[i]) { headers[i] = h; changed = true; }
    });
    if (changed) config.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function applyConditionalFormatsV2_(sheet) {
  const maxRow = sheet.getMaxRows();
  const statusRange   = sheet.getRange(2, V2_COL.STATUS, maxRow - 1, 1);
  const priorityRange = sheet.getRange(2, V2_COL.PRIORITY, maxRow - 1, 1);
  const deadlineRange = sheet.getRange(2, V2_COL.DEADLINE, maxRow - 1, 1);
  const slaRange      = sheet.getRange(2, V2_COL.SLA_DEADLINE, maxRow - 1, 1);

  const rules = [
    // ステータス色
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_STATUS.UNHANDLED)
      .setBackground('#fce8e6').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_STATUS.IN_PROGRESS)
      .setBackground('#fff7e0').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_STATUS.COMPLETED)
      .setBackground('#eceff1').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_STATUS.ON_HOLD)
      .setBackground('#e8eaed').setRanges([statusRange]).build(),
    // 優先度色
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_PRIORITY.URGENT)
      .setBackground('#fbbcb6').setFontColor('#a30000').setRanges([priorityRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_PRIORITY.HIGH)
      .setBackground('#fce8e6').setRanges([priorityRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(V2_PRIORITY.MID)
      .setBackground('#fff7e0').setRanges([priorityRange]).build(),
    // 対応期限超過・当日
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($I2<>"", $I2<TODAY(), $G2<>"${V2_STATUS.COMPLETED}", $G2<>"${V2_STATUS.ON_HOLD}")`)
      .setBackground('#f4c7c3').setRanges([deadlineRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($I2<>"", $I2=TODAY(), $G2<>"${V2_STATUS.COMPLETED}", $G2<>"${V2_STATUS.ON_HOLD}")`)
      .setBackground('#fff2cc').setRanges([deadlineRange]).build(),
    // SLA期限超過
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($P2<>"", $P2<NOW(), $G2<>"${V2_STATUS.COMPLETED}", $G2<>"${V2_STATUS.ON_HOLD}")`)
      .setBackground('#f4c7c3').setRanges([slaRange]).build()
  ];
  sheet.setConditionalFormatRules(rules);
}

function ensureLabel_(name) {
  if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
}

// P1.6-4: inquiry_bodies のシート保護
function protectBodiesSheet_(sheet) {
  try {
    // 既存の保護があれば一旦除去（再設定のため）
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    existing.forEach(p => {
      try { p.remove(); } catch (_) { /* mute */ }
    });

    const protection = sheet.protect()
      .setDescription('inquiry_bodies (PIIマスク済本文／編集権限を制限)')
      .setWarningOnly(false);

    // 編集権限を「スクリプト所有者＋BODY_VIEWERS」だけに
    const owner = (Session.getEffectiveUser && Session.getEffectiveUser().getEmail()) || '';
    const allowed = new Set();
    if (owner) allowed.add(owner);

    const viewersProp = PropertiesService.getScriptProperties().getProperty('BODY_VIEWERS');
    if (viewersProp) {
      viewersProp.split(',').map(s => s.trim()).filter(Boolean).forEach(e => allowed.add(e));
    }

    protection.removeEditors(protection.getEditors());
    if (allowed.size > 0) {
      protection.addEditors(Array.from(allowed));
    }
    // 一般編集者から除外
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (err) {
    logError_('protectBodiesSheet_', err);
  }
}

function registerTriggersV2_() {
  // v2 側で管理するハンドラ
  const v2Handlers = ['fetchAndSyncV2', 'onSheetEditV2', 'remindOverdue', 'postDailySummary', 'staleCheck', 'heartbeat', 'detectFirstRepliesJob', 'rotateHistoryJob'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (v2Handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  // v1 トリガーは無効化（v2が引き継ぐ）
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'fetchAndSync' || fn === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');

  ScriptApp.newTrigger('fetchAndSyncV2').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('remindOverdue').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('postDailySummary').timeBased().atHour(9).everyDays(1).create();
  // P1.5: 長期放置検知（12:00）/ ヒートビート（08時台）
  ScriptApp.newTrigger('staleCheck').timeBased().atHour(12).everyDays(1).create();
  ScriptApp.newTrigger('heartbeat').timeBased().atHour(8).everyDays(1).create();
  // P1.6-2: Gmail返信検知は別トリガー（30分毎）
  ScriptApp.newTrigger('detectFirstRepliesJob').timeBased().everyMinutes(30).create();
  // P1.6-3: 履歴アーカイブ（毎週日曜03時台）
  ScriptApp.newTrigger('rotateHistoryJob').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();

  ScriptApp.newTrigger('onSheetEditV2')
    .forSpreadsheet(SpreadsheetApp.openById(sheetId))
    .onEdit()
    .create();
}


// ====================================================================
// メニュー（onOpen で v1 メニューに加えて v2 メニューを追加）
// ====================================================================
function onOpenV2() {
  SpreadsheetApp.getUi()
    .createMenu('問い合わせパイプライン v2')
    .addItem('今すぐメール取得 (v2)', 'menuFetchAndSyncV2')
    .addItem('選択行から返信下書きを作成', 'menuCreateReplyDraft')
    .addSeparator()
    .addItem('リマインドを今すぐ実行', 'menuRemindOverdue')
    .addItem('長期放置チェックを今すぐ実行', 'menuStaleCheck')
    .addItem('デイリーサマリを今すぐ送信', 'menuPostDailySummary')
    .addItem('ヒートビートを今すぐ確認', 'menuHeartbeat')
    .addSeparator()
    .addItem('Slack通知テスト (v2)', 'menuTestNotificationV2')
    .addItem('ヘルスチェック (v2)', 'menuHealthCheckV2')
    .addSeparator()
    .addItem('セットアップ実行 (v2)', 'menuSetupV2')
    .addToUi();
}

function menuCreateReplyDraft() {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    if (sheet.getName() !== V2_SHEET_NAME) {
      SpreadsheetApp.getUi().alert(`「${V2_SHEET_NAME}」シートで行を選択してから実行してください`);
      return;
    }
    const row = sheet.getActiveRange().getRow();
    if (row < 2) { SpreadsheetApp.getUi().alert('ヘッダ行は対象外です'); return; }
    createReplyDraftForRow_(row);
    SpreadsheetApp.getUi().alert('Gmail に返信下書きを作成しました。Gmailを開いて内容確認・送信してください。');
  } catch (err) {
    SpreadsheetApp.getUi().alert(`エラー: ${err.message}`);
  }
}
function menuStaleCheck() {
  try { staleCheck(); SpreadsheetApp.getUi().alert('長期放置チェック完了（該当があればSlackへ通知済）'); }
  catch (err) { SpreadsheetApp.getUi().alert(`エラー: ${err.message}`); }
}
function menuHeartbeat() {
  try { heartbeat(); SpreadsheetApp.getUi().alert('ヒートビート確認完了（異常があれば管理者へ通知済）'); }
  catch (err) { SpreadsheetApp.getUi().alert(`エラー: ${err.message}`); }
}

function menuFetchAndSyncV2() {
  try { fetchAndSyncV2(); SpreadsheetApp.getUi().alert('v2: メール取得完了'); }
  catch (err) { SpreadsheetApp.getUi().alert(`エラー: ${err.message}`); }
}
function menuRemindOverdue() {
  try { remindOverdue(); SpreadsheetApp.getUi().alert('リマインド処理完了'); }
  catch (err) { SpreadsheetApp.getUi().alert(`エラー: ${err.message}`); }
}
function menuPostDailySummary() {
  try { postDailySummary(); SpreadsheetApp.getUi().alert('デイリーサマリ送信完了（平日のみ実送信）'); }
  catch (err) { SpreadsheetApp.getUi().alert(`エラー: ${err.message}`); }
}
function menuSetupV2() {
  try { setupV2(); SpreadsheetApp.getUi().alert('v2 セットアップ完了'); }
  catch (err) { SpreadsheetApp.getUi().alert(`エラー: ${err.message}`); }
}
function menuTestNotificationV2() {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (!webhookUrl) { SpreadsheetApp.getUi().alert('SLACK_WEBHOOK_URL 未設定'); return; }
  const ok = postSlack_(webhookUrl, {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '[テスト v2] 通知動作確認' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'v2 のWebhook疎通テストです。' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `送信時刻: ${new Date().toLocaleString('ja-JP')}` }] }
    ]
  });
  SpreadsheetApp.getUi().alert(ok ? 'テスト送信OK' : 'テスト送信失敗');
}
function menuHealthCheckV2() {
  const lines = ['=== ヘルスチェック (v2) ==='];
  const props = PropertiesService.getScriptProperties();
  const sheetId       = props.getProperty('SHEET_ID');
  const webhookMain   = props.getProperty('SLACK_WEBHOOK_URL');
  const webhookAdperf = props.getProperty('SLACK_WEBHOOK_URL_ADPERF');

  lines.push(sheetId ? '✓ SHEET_ID 設定済み' : '✗ SHEET_ID 未設定');
  lines.push(webhookMain ? '✓ SLACK_WEBHOOK_URL 設定済み' : '✗ SLACK_WEBHOOK_URL 未設定');
  lines.push(webhookAdperf ? '✓ SLACK_WEBHOOK_URL_ADPERF 設定済み（広告実績へ同報）' : '○ SLACK_WEBHOOK_URL_ADPERF 未設定（同報なし）');
  lines.push(props.getProperty('ORG_DOMAIN') ? `✓ ORG_DOMAIN 設定済み (${props.getProperty('ORG_DOMAIN')})` : '○ ORG_DOMAIN 未設定（Gmail返信自動検知が無効）');
  const lastTs = props.getProperty('LAST_FETCH_TS');
  if (lastTs) {
    const ageH = ((Date.now() - Number(lastTs)) / 3600000).toFixed(1);
    lines.push(`✓ 最終取得から ${ageH}h 経過`);
  } else {
    lines.push('○ LAST_FETCH_TS 未記録（fetchAndSyncV2 未実行）');
  }

  if (sheetId) {
    const ss = SpreadsheetApp.openById(sheetId);
    [V2_SHEET_NAME, V2_CONFIG_SHEET, V2_HISTORY_SHEET, V2_BODIES_SHEET, V2_INGEST_RULES_SHEET, V2_TEMPLATES_SHEET].forEach(n => {
      lines.push(ss.getSheetByName(n) ? `✓ シート ${n} あり` : `✗ シート ${n} なし`);
    });
    const ingest = ss.getSheetByName(V2_INGEST_RULES_SHEET);
    if (ingest) {
      const activeRules = loadIngestRules_(ss).length;
      lines.push(`  └ 有効ルール数: ${activeRules}件`);
    }
    const main = ss.getSheetByName(V2_SHEET_NAME);
    if (main) {
      lines.push(main.getLastColumn() >= V2_HEADERS.length
        ? `✓ メインシート列数OK (${main.getLastColumn()})`
        : `✗ メインシート列数不足 (${main.getLastColumn()}/${V2_HEADERS.length})`);
    }
  }

  const labels = listUnprocessedLabels_();
  lines.push(labels.length > 0
    ? `✓ Gmailラベル「${V2_LABEL_UNPROCESSED_PARENT}」配下 ${labels.length}件`
    : `✗ Gmailラベル「${V2_LABEL_UNPROCESSED_PARENT}」配下なし`);

  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  ['fetchAndSyncV2', 'onSheetEditV2', 'remindOverdue', 'postDailySummary', 'staleCheck', 'heartbeat', 'detectFirstRepliesJob', 'rotateHistoryJob'].forEach(fn => {
    lines.push(triggers.indexOf(fn) >= 0 ? `✓ トリガー ${fn} 登録済` : `✗ トリガー ${fn} 未登録`);
  });

  // P1.6 チェック
  lines.push(props.getProperty('NEXT_ID') ? `✓ NEXT_ID = ${props.getProperty('NEXT_ID')}` : '✗ NEXT_ID 未初期化（setupV2 実行で初期化されます）');
  lines.push(props.getProperty('BODY_VIEWERS') ? `✓ BODY_VIEWERS 設定済み` : '○ BODY_VIEWERS 未設定（inquiry_bodies は所有者のみ編集可）');

  SpreadsheetApp.getUi().alert(lines.join('\n'));
}
