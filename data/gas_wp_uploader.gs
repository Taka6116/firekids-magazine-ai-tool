/**
 * FIRE KIDS Magazine — WordPress投稿GAS
 *
 * 機能:
 *   1. 記事番号（A列）からDriveのHTMLファイルを自動検索して投稿
 *   2. メタ情報（title, description）をHTMLコメントから自動抽出
 *   3. カテゴリ・タグを自動設定
 *   4. アイキャッチ画像をCDNから取得・設定
 *   5. 人間チェック済みの記事のみ投稿（L列で制御）
 *
 * スプレッドシート列構成:
 *   A=No  B=記事タイトル  C=画像URL（アイキャッチ）
 *   D=カテゴリ  E=タグ  F=予約日時
 *   G=ステータス  H=投稿URL  I=チェック状況（IMPORTRANGE）
 *
 * セットアップ:
 *   1. プロジェクトの設定 → スクリプト プロパティに以下を登録:
 *      - WP_USER: WordPressのユーザー名
 *      - WP_APP_PASSWORD: アプリケーションパスワード
 *   2. 初回実行時「WP投稿 → カテゴリ一覧を取得」「タグ一覧を取得」で
 *      実際のIDを確認し、WP_CATEGORY_MAP / WP_TAG_MAP を更新
 */

// ===== 設定 =====
var WP_API_URL = "https://m.firekids.jp/wp-json/wp/v2";
var MAGAZINE_FOLDER_ID = "1VJTnAfxZ93ozWnf69xlUGAqbl60Cw11B";

// WPカテゴリID対応表
var WP_CATEGORY_MAP = {
  "時計の基礎知識": 2,
  "コラム": 3,
  "トレンド": 4,
};

// WPタグID対応表
var WP_TAG_MAP = {
  "ロレックス": 3,
  "オメガ": 13,
  "セイコー": 14,
  "チューダー": 15,
  "IWC": 16,
  "カルティエ": 17,
  "ブライトリング": 18,
  "ロンジン": 19,
  "シチズン": 20,
  "オリエント": 21,
  "ヴァシュロン・コンスタンタン": 22,
  "グランドセイコー": 23,
  "キングセイコー": 24,
  "ジャガー・ルクルト": 25,
};

// チェック済みと見なす値
var CHECK_OK_VALUES = ["チェック済", "チェック済み", "✓", "✔", "○", "OK", "ok", "済"];

// ===== 列定義 =====
var COL = {
  NO: 1,            // A列: No（記事番号: 139 等）
  TITLE: 2,         // B列: 記事タイトル
  IMAGE1: 3,        // C列: 画像URL（アイキャッチ）
  CATEGORY: 4,      // D列: カテゴリ
  TAG: 5,           // E列: タグ（カンマ区切りで複数可）
  SCHEDULE: 6,      // F列: 予約日時
  STATUS: 7,        // G列: ステータス（自動記入）
  POST_URL: 8,      // H列: 投稿URL（自動記入）
  CHECK: 9,         // I列: チェック状況（IMPORTRANGE）
};

// ===== メニュー =====

function onOpen() {
  SpreadsheetApp.getUi().createMenu("WP投稿")
    .addItem("選択行を投稿（複数行OK）", "postSelectedRow")
    .addItem("チェック済みを一括投稿", "postAllChecked")
    .addSeparator()
    .addItem("選択行をプレビュー（投稿しない）", "previewSelectedRow")
    .addSeparator()
    .addItem("カテゴリ一覧を取得", "fetchCategories")
    .addItem("タグ一覧を取得", "fetchTags")
    .addToUi();
}

// ===== 投稿処理 =====

function postSelectedRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください。"); return; }

  // ファイルインデックスを1回だけ構築
  var fileIndex = buildFileIndex_();

  var count = 0;
  var errors = [];

  for (var row = startRow; row < startRow + numRows; row++) {
    var no = sheet.getRange(row, COL.NO).getValue().toString().trim();
    if (!no) continue;
    try {
      postRow_(sheet, row, fileIndex);
      count++;
    } catch (e) {
      errors.push("行" + row + " (No." + no + "): " + e.message);
    }
  }

  var msg = "完了: " + count + "件投稿しました。";
  if (errors.length > 0) msg += "\n\nエラー:\n" + errors.join("\n");
  SpreadsheetApp.getUi().alert(msg);
}

function postAllChecked() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }

  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert("確認", "チェック済み＆未投稿の全行をWordPressに投稿します。よろしいですか？", ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // ファイルインデックスを1回だけ構築（高速化）
  var fileIndex = buildFileIndex_();

  // シートデータを一括読み込み（高速化）
  var allData = sheet.getRange(2, 1, lastRow - 1, COL.CHECK).getValues();

  var count = 0;
  var skipped = 0;
  var errors = [];

  for (var i = 0; i < allData.length; i++) {
    var row = i + 2;
    var no = allData[i][COL.NO - 1].toString().trim();
    if (!no) continue;

    var status = allData[i][COL.STATUS - 1].toString().trim();
    if (status === "投稿済み" || status === "予約済み" || status === "下書き保存") continue;

    var checkVal = allData[i][COL.CHECK - 1].toString().trim();
    if (!isChecked_(checkVal)) {
      skipped++;
      continue;
    }

    try {
      postRowWithIndex_(sheet, row, allData[i], fileIndex);
      count++;
    } catch (e) {
      errors.push("行" + row + " (No." + no + "): " + e.message);
      sheet.getRange(row, COL.STATUS).setValue("エラー");
    }
  }

  var msg = "完了: " + count + "件投稿 / " + skipped + "件スキップ（未チェック）";
  if (errors.length > 0) msg += "\n\nエラー:\n" + errors.join("\n");
  SpreadsheetApp.getUi().alert(msg);
}


function previewSelectedRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = sheet.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください。"); return; }

  var no = sheet.getRange(row, COL.NO).getValue().toString().trim();
  if (!no) { SpreadsheetApp.getUi().alert("記事番号が空です。"); return; }

  var htmlContent = findHtmlByNo_(no);
  if (!htmlContent) { SpreadsheetApp.getUi().alert("HTMLファイルが見つかりません: No." + no); return; }

  var meta = extractMeta_(htmlContent);
  var checkVal = sheet.getRange(row, COL.CHECK).getValue().toString().trim();

  var msg = "■ プレビュー（No." + no + "）\n\n";
  msg += "タイトル: " + meta.title + "\n";
  msg += "説明文: " + (meta.description || "").substring(0, 80) + "...\n";
  msg += "カテゴリ: " + (sheet.getRange(row, COL.CATEGORY).getValue() || "時計の基礎知識") + "\n";
  msg += "タグ: " + (sheet.getRange(row, COL.TAG).getValue() || "なし") + "\n";
  msg += "予約日時: " + (sheet.getRange(row, COL.SCHEDULE).getValue() || "なし（下書き）") + "\n";
  msg += "画像: " + (sheet.getRange(row, COL.IMAGE1).getValue() ? "あり" : "なし") + "\n";
  msg += "チェック状況: " + (checkVal || "未チェック") + " → " + (isChecked_(checkVal) ? "投稿可" : "投稿不可") + "\n";
  msg += "HTML文字数: " + htmlContent.length + "文字\n";

  SpreadsheetApp.getUi().alert(msg);
}

// ===== 1行を投稿 =====

function postRow_(sheet, row, fileIndex) {
  var no = sheet.getRange(row, COL.NO).getValue().toString().trim();
  if (!no) throw new Error("記事番号が空です");

  // 人間チェック状況の確認
  var checkVal = sheet.getRange(row, COL.CHECK).getValue().toString().trim();
  if (!isChecked_(checkVal)) {
    sheet.getRange(row, COL.STATUS).setValue("未チェック: スキップ");
    return "No." + no + " は未チェックのためスキップしました";
  }

  // インデックスからHTML取得（インデックスがなければ都度検索）
  var numStr = padNumber_(no);
  var htmlContent = null;
  if (fileIndex && fileIndex[numStr]) {
    htmlContent = fileIndex[numStr].getBlob().getDataAsString("UTF-8");
  } else {
    htmlContent = findHtmlByNo_(no);
  }
  if (!htmlContent) throw new Error("HTMLファイルが見つかりません: No." + no);

  var meta = extractMeta_(htmlContent);
  var body = extractBody_(htmlContent);

  // カテゴリ
  var categoryName = sheet.getRange(row, COL.CATEGORY).getValue().toString().trim() || "時計の基礎知識";
  var categoryId = WP_CATEGORY_MAP[categoryName];
  if (!categoryId) throw new Error("カテゴリが不明: " + categoryName);

  // タグ
  var tagName = sheet.getRange(row, COL.TAG).getValue().toString().trim();
  var tagIds = [];
  if (tagName) {
    tagName.split(",").forEach(function(t) {
      t = t.trim();
      if (WP_TAG_MAP[t]) tagIds.push(WP_TAG_MAP[t]);
    });
  }

  // 予約日時
  var scheduleVal = sheet.getRange(row, COL.SCHEDULE).getValue();
  var postStatus = "draft";
  var dateStr = null;

  if (scheduleVal) {
    var scheduleDate = (scheduleVal instanceof Date) ? scheduleVal : new Date(scheduleVal.toString().trim());
    if (!isNaN(scheduleDate.getTime())) {
      dateStr = Utilities.formatDate(scheduleDate, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
      postStatus = (scheduleDate > new Date()) ? "future" : "publish";
    }
  }

  // アイキャッチ画像
  var image1 = sheet.getRange(row, COL.IMAGE1).getValue().toString().trim();
  var featuredMediaId = null;
  if (image1) {
    try {
      featuredMediaId = uploadImageFromUrl_(image1, meta.title || "FIRE KIDS Magazine");
    } catch (e) {
      Logger.log("アイキャッチアップロード失敗（続行）: " + e.message);
    }
  }

  // WP投稿データ
  var postData = {
    title: meta.title || sheet.getRange(row, COL.TITLE).getValue().toString().trim(),
    content: body,
    status: postStatus,
    categories: [categoryId],
    excerpt: meta.description || "",
  };
  if (tagIds.length > 0) postData.tags = tagIds;
  if (dateStr) postData.date = dateStr;
  if (featuredMediaId) postData.featured_media = featuredMediaId;

  // API呼び出し
  var response = wpApiRequest_("POST", "/posts", postData);

  if (response.id) {
    var statusText = (postStatus === "future") ? "予約済み" : (postStatus === "publish") ? "投稿済み" : "下書き保存";
    sheet.getRange(row, COL.STATUS).setValue(statusText);
    sheet.getRange(row, COL.POST_URL).setValue(response.link || "ID=" + response.id);
    return statusText + ": " + (response.link || response.id);
  } else {
    sheet.getRange(row, COL.STATUS).setValue("エラー");
    throw new Error(response.message || JSON.stringify(response).substring(0, 200));
  }
}

// ===== 一括投稿用（データ配列から直接投稿） =====

function postRowWithIndex_(sheet, row, rowData, fileIndex) {
  var no = rowData[COL.NO - 1].toString().trim();
  if (!no) throw new Error("記事番号が空です");

  var numStr = padNumber_(no);
  var htmlContent = null;
  if (fileIndex && fileIndex[numStr]) {
    htmlContent = fileIndex[numStr].getBlob().getDataAsString("UTF-8");
  }
  if (!htmlContent) throw new Error("HTMLファイルが見つかりません: No." + no);

  var meta = extractMeta_(htmlContent);
  var body = extractBody_(htmlContent);

  var categoryName = rowData[COL.CATEGORY - 1].toString().trim() || "時計の基礎知識";
  var categoryId = WP_CATEGORY_MAP[categoryName];
  if (!categoryId) throw new Error("カテゴリが不明: " + categoryName);

  var tagName = rowData[COL.TAG - 1].toString().trim();
  var tagIds = [];
  if (tagName) {
    tagName.split(",").forEach(function(t) {
      t = t.trim();
      if (WP_TAG_MAP[t]) tagIds.push(WP_TAG_MAP[t]);
    });
  }

  var scheduleVal = rowData[COL.SCHEDULE - 1];
  var postStatus = "draft";
  var dateStr = null;
  if (scheduleVal) {
    var scheduleDate = (scheduleVal instanceof Date) ? scheduleVal : new Date(scheduleVal.toString().trim());
    if (!isNaN(scheduleDate.getTime())) {
      dateStr = Utilities.formatDate(scheduleDate, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
      postStatus = (scheduleDate > new Date()) ? "future" : "publish";
    }
  }

  var image1 = rowData[COL.IMAGE1 - 1].toString().trim();
  var featuredMediaId = null;
  if (image1) {
    try { featuredMediaId = uploadImageFromUrl_(image1, meta.title || "FIRE KIDS Magazine"); }
    catch (e) { Logger.log("アイキャッチ失敗: " + e.message); }
  }

  var postData = {
    title: meta.title || rowData[COL.TITLE - 1].toString().trim(),
    content: body, status: postStatus, categories: [categoryId],
    excerpt: meta.description || "",
  };
  if (tagIds.length > 0) postData.tags = tagIds;
  if (dateStr) postData.date = dateStr;
  if (featuredMediaId) postData.featured_media = featuredMediaId;

  var response = wpApiRequest_("POST", "/posts", postData);
  if (response.id) {
    var statusText = (postStatus === "future") ? "予約済み" : (postStatus === "publish") ? "投稿済み" : "下書き保存";
    sheet.getRange(row, COL.STATUS).setValue(statusText);
    sheet.getRange(row, COL.POST_URL).setValue(response.link || "ID=" + response.id);
  } else {
    sheet.getRange(row, COL.STATUS).setValue("エラー");
    throw new Error(response.message || JSON.stringify(response).substring(0, 200));
  }
}

// ===== ファイルインデックス構築（1回だけ実行） =====

function buildFileIndex_() {
  var index = {};
  try {
    var baseFolder = DriveApp.getFolderById(MAGAZINE_FOLDER_ID);
    var articlesFolder = getSubFolder_(baseFolder, "articles");
    if (!articlesFolder) return index;

    var brandFolders = articlesFolder.getFolders();
    while (brandFolders.hasNext()) {
      var brandFolder = brandFolders.next();
      var files = brandFolder.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        var name = file.getName();
        if (name.endsWith(".html")) {
          var match = name.match(/^(\d{3})_article_/);
          if (match) {
            index[match[1]] = file;
          }
        }
      }
    }
  } catch (e) {
    Logger.log("インデックス構築エラー: " + e.message);
  }
  return index;
}

// ===== HTMLファイル検索（記事番号から自動検索） =====

function findHtmlByNo_(no) {
  // 番号を3桁にパディング
  var numStr = padNumber_(no);
  if (!numStr) return null;

  var baseFolder;
  try {
    baseFolder = DriveApp.getFolderById(MAGAZINE_FOLDER_ID);
  } catch (e) { return null; }

  var articlesFolder = getSubFolder_(baseFolder, "articles");
  if (!articlesFolder) return null;

  // 全ブランドフォルダを検索
  var brandFolders = articlesFolder.getFolders();
  while (brandFolders.hasNext()) {
    var brandFolder = brandFolders.next();
    var files = brandFolder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      // 139_article_*.html のパターンでマッチ
      if (name.indexOf(numStr + "_article_") === 0 && name.endsWith(".html")) {
        return file.getBlob().getDataAsString("UTF-8");
      }
    }
  }

  // THEMEフォルダも検索
  var themeFolder = getSubFolder_(articlesFolder, "THEME");
  if (themeFolder) {
    var tFiles = themeFolder.getFiles();
    while (tFiles.hasNext()) {
      var tf = tFiles.next();
      if (tf.getName().indexOf(numStr + "_article_") === 0 && tf.getName().endsWith(".html")) {
        return tf.getBlob().getDataAsString("UTF-8");
      }
    }
  }

  return null;
}

function padNumber_(n) {
  var num = parseInt(n, 10);
  if (isNaN(num) || num <= 0) return null;
  if (num < 10) return "00" + num;
  if (num < 100) return "0" + num;
  return "" + num;
}

function getSubFolder_(parent, name) {
  var iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : null;
}

// ===== チェック判定 =====

function isChecked_(val) {
  if (!val) return false;
  var s = val.toString().trim();
  for (var i = 0; i < CHECK_OK_VALUES.length; i++) {
    if (s === CHECK_OK_VALUES[i]) return true;
  }
  return false;
}

// ===== メタ情報抽出 =====

function extractMeta_(html) {
  var meta = { title: "", description: "" };
  var commentMatch = html.match(/<!--([\s\S]*?)-->/);
  if (commentMatch) {
    var comment = commentMatch[1];
    var titleMatch = comment.match(/title:\s*(.+)/);
    if (titleMatch) meta.title = titleMatch[1].trim();
    var descMatch = comment.match(/meta_description:\s*(.+)/);
    if (descMatch) meta.description = descMatch[1].trim();
  }
  return meta;
}

// ===== HTML本文抽出 =====

function extractBody_(html) {
  return html.replace(/^<!--[\s\S]*?-->\s*/, "").replace(/^\uFEFF/, "").trim();
}

// ===== 画像アップロード =====

function uploadImageFromUrl_(imageUrl, altText) {
  var response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("画像DL失敗: " + response.getResponseCode());

  var blob = response.getBlob();
  blob.setName(imageUrl.split("/").pop());

  var creds = getWpCredentials_();
  var token = Utilities.base64Encode(creds.user + ":" + creds.pass);

  var uploadResponse = UrlFetchApp.fetch(WP_API_URL + "/media", {
    method: "post",
    headers: { "Authorization": "Basic " + token, "Content-Disposition": "attachment; filename=" + blob.getName() },
    contentType: blob.getContentType(),
    payload: blob.getBytes(),
    muteHttpExceptions: true,
  });

  var result = JSON.parse(uploadResponse.getContentText());
  if (result.id) {
    wpApiRequest_("POST", "/media/" + result.id, { alt_text: altText });
    return result.id;
  }
  throw new Error("画像アップロードエラー");
}

// ===== WP API =====

function getWpCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty("WP_USER");
  var pass = props.getProperty("WP_APP_PASSWORD");
  if (!user || !pass) throw new Error("スクリプト プロパティにWP_USER/WP_APP_PASSWORDを設定してください");
  return { user: user, pass: pass };
}

function wpApiRequest_(method, endpoint, data) {
  var creds = getWpCredentials_();
  var token = Utilities.base64Encode(creds.user + ":" + creds.pass);
  var options = {
    method: method.toLowerCase(),
    headers: { "Authorization": "Basic " + token },
    contentType: "application/json",
    muteHttpExceptions: true,
  };
  if (data && method.toUpperCase() !== "GET") options.payload = JSON.stringify(data);
  return JSON.parse(UrlFetchApp.fetch(WP_API_URL + endpoint, options).getContentText());
}

// ===== カテゴリ・タグ取得 =====

function fetchCategories() {
  var cats = wpApiRequest_("GET", "/categories?per_page=100", null);
  var msg = "■ WPカテゴリ一覧\n\n";
  cats.forEach(function(c) { msg += "  \"" + c.name + "\": " + c.id + ",\n"; });
  SpreadsheetApp.getUi().alert(msg);
}

function fetchTags() {
  var tags = wpApiRequest_("GET", "/tags?per_page=100", null);
  var msg = "■ WPタグ一覧\n\n";
  tags.forEach(function(t) { msg += "  \"" + t.name + "\": " + t.id + ",\n"; });
  SpreadsheetApp.getUi().alert(msg);
}
