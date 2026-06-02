/**
 * FIRE KIDS Magazine — スプレッドシート連携GAS
 *
 * 機能一覧（スプレッドシートのメニュー「FIRE KIDS」から実行）:
 *   1. 🔗 リンク取得 — A列(No)×B列(ブランド)からDriveファイルを検索しG〜I列にリンク挿入
 *   2. 記事TXT→ドキュメント — TXTファイルからGoogleドキュメントを作成（外部レビュー用）
 *   3. 記事ドキュメント→TXT — 編集済みGoogleドキュメントをTXTに書き戻し
 *   4. X投稿MD→ドキュメント — X投稿MDファイルからGoogleドキュメントを作成
 *   5. X投稿ドキュメント→MD — 編集済みGoogleドキュメントをMDに書き戻し
 *
 * スプレッドシート列構成:
 *   A=No  B=ブランド  C=記事タイトル  D=メインKW  E=ファイルNo
 *   F=記事TXT  G=X投稿
 *   H=原稿チェック  I=アップ済み  J=マガジン掲載日  K=マガジン_URL
 *   L=Xチェック  M=Xアップ済み  N=X投稿日  O=X_URL
 *
 * セットアップ:
 *   1. スプレッドシートで 拡張機能 → Apps Script を開く
 *   2. このコードを貼り付けて保存
 *   3. 下の BASE_FOLDER_ID に MAGAZINEフォルダのIDを設定
 *   4. onOpen が自動実行され「FIRE KIDS」メニューが追加される
 *   5. 初回実行時に権限承認が必要
 *
 * Googleドキュメント保存先:
 *   MAGAZINE/data/review_docs/
 */

// ===== 設定 =====
var BASE_FOLDER_ID = "1VJTnAfxZ93ozWnf69xlUGAqbl60Cw11B";  // 共有用ドライブ

// ===== 共有設定 =====
// 権限はreview_docsフォルダに直接付与済みのため、個別ファイルへの権限付与は不要

// ===== 列定義 =====
var COL = {
  NO: 1,               // A列: No（記事番号）
  BRAND: 2,            // B列: ブランド
  TITLE: 3,            // C列: 記事タイトル
  MAIN_KW: 4,          // D列: メインKW
  FILE_NO: 5,           // E列: ファイルNo（ファイル名プレフィックス番号）
  ARTICLE_TXT: 6,      // F列: 記事TXTリンク
  XPOST_FILE: 7,       // G列: X投稿リンク
  ARTICLE_CHECK: 8,    // H列: 原稿チェック
  ARTICLE_UPLOADED: 9,  // I列: アップ済み
  MAGAZINE_DATE: 10,   // J列: マガジン掲載日
  MAGAZINE_URL: 11,    // K列: マガジン_URL
  XPOST_CHECK: 12,     // L列: Xチェック
  XPOST_UPLOADED: 13,  // M列: Xアップ済み
  XPOST_DATE: 14,      // N列: X投稿日
  XPOST_URL: 15        // O列: X_URL
};

// ===== ブランド→フォルダ名マッピング =====
var BRAND_MAP = {
  "ロレックス": "ROLEX",
  "オメガ": "OMEGA",
  "セイコー": "SEIKO",
  "シチズン": "CITIZEN",
  "IWC": "IWC",
  "チューダー": "TUDOR",
  "チュードル": "TUDOR",
  "オリエント": "ORIENT",
  "ロンジン": "LONGINES",
  "ジャガー・ルクルト": "JLC",
  "ジャガールクルト": "JLC",
  "JLC": "JLC",
  "カルティエ": "CARTIER",
  "ユニバーサルジュネーブ": "UNIVERSAL",
  "ユニバーサル": "UNIVERSAL",
  "ユニバーサル・ジュネーブ": "UNIVERSAL",
  "ブライトリング": "BREITLING",
  "ヴァシュロン・コンスタンタン": "VACHERON",
  "ヴァシュロン": "VACHERON",
  "オーデマピゲ": "AP",
  "テーマ": "THEME",
  "テーマ記事": "THEME",
  "THEME": "THEME",
  "その他": "OTHER"
};

// ===== メニュー =====

function onOpen() {
  SpreadsheetApp.getUi().createMenu("FIRE KIDS")
    .addItem("🔗 リンク取得（全行）", "fetchAllLinks")
    .addItem("🔗 リンク取得（選択行）", "fetchSelectedLinks")
    .addSeparator()
    .addItem("記事TXT → ドキュメント（選択行）", "txtToDocSelected")
    .addItem("記事TXT → ドキュメント（選択範囲）", "txtToDocRange")
    .addItem("記事TXT → ドキュメント（全行）", "txtToDocAll")
    .addSeparator()
    .addItem("📎 既存ドキュメントのリンクを一括取得", "linkExistingDocs")
    .addSeparator()
    .addItem("記事ドキュメント → TXT書き戻し（選択行）", "docToTxtSelected")
    .addItem("記事ドキュメント → TXT書き戻し（全行）", "docToTxtAll")
    .addSeparator()
    .addItem("X投稿MD → ドキュメント（選択行）", "xpostToDocSelected")
    .addItem("X投稿MD → ドキュメント（選択範囲）", "xpostToDocRange")
    .addItem("X投稿MD → ドキュメント（全行）", "xpostToDocAll")
    .addSeparator()
    .addItem("X投稿ドキュメント → MD書き戻し（選択行）", "docToXpostSelected")
    .addItem("X投稿ドキュメント → MD書き戻し（全行）", "docToXpostAll")
    .addSeparator()
    .addItem("🔍 診断（デバッグ）", "debugDiagnose")
    .addItem("タイトルから｜FIRE KIDS Magazine を削除", "removeMagazineSuffix")
    .addToUi();
}

// ===== 1. リンク取得 =====

/**
 * 全行のA列(No)×B列(ブランド)からDrive内のファイルを検索し、G〜H列にHYPERLINKを挿入
 * G列=記事TXT, H列=X投稿MD
 */
function fetchAllLinks() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }

  var articleFolder = findFolder_("articles");
  var xpostFolder = findFolder_("x_posts");
  if (!articleFolder) {
    SpreadsheetApp.getUi().alert("フォルダが見つかりません: articles\nBASE_FOLDER_IDを確認してください。");
    return;
  }

  // 全ファイルのインデックスを構築
  var articleIndex = buildFullFileIndex_(articleFolder);
  var xpostIndex = xpostFolder ? buildFullFileIndex_(xpostFolder) : {};

  var allData = sheet.getRange(2, 1, lastRow - 1, COL.XPOST_FILE).getValues();
  var updated = 0;
  var notFound = [];

  for (var i = 0; i < allData.length; i++) {
    var fileNo = allData[i][COL.FILE_NO - 1].toString().trim();
    var no = allData[i][COL.NO - 1].toString().trim();
    var brand = allData[i][COL.BRAND - 1].toString().trim();
    // G列（ファイルNo）を優先、空ならA列（No）にフォールバック
    var lookupNo = fileNo || no;
    if (!lookupNo || !brand) continue;

    var row = i + 2;
    var numStr = padNumber_(lookupNo);
    if (!numStr) continue;

    var folderName = getBrandFolder_(brand);
    if (!folderName) {
      notFound.push("行" + row + ": ブランド「" + brand + "」不明");
      continue;
    }

    var found = false;

    // G列: 記事TXT
    var txtFile = findInIndex_(articleIndex, folderName, numStr, "article_", "txt");
    if (txtFile) {
      sheet.getRange(row, COL.ARTICLE_TXT).setFormula(
        '=HYPERLINK("' + txtFile.url + '","' + txtFile.name + '")'
      );
      found = true;
    }

    // H列: X投稿MD
    var xFile = findInIndex_(xpostIndex, folderName, numStr, "x_", "md");
    if (!xFile) xFile = findInIndex_(xpostIndex, folderName, numStr, "x_", "txt");
    if (xFile) {
      sheet.getRange(row, COL.XPOST_FILE).setFormula(
        '=HYPERLINK("' + xFile.url + '","' + xFile.name + '")'
      );
      found = true;
    }

    if (found) updated++;
  }

  var msg = "完了: " + updated + "件のリンクを取得しました。";
  if (notFound.length > 0) {
    msg += "\n\n見つからなかった行:\n" + notFound.slice(0, 10).join("\n");
    if (notFound.length > 10) msg += "\n... 他" + (notFound.length - 10) + "件";
  }
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * 選択行のリンクのみ取得
 */
function fetchSelectedLinks() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。"); return; }

  var articleFolder = findFolder_("articles");
  var xpostFolder = findFolder_("x_posts");
  if (!articleFolder) {
    SpreadsheetApp.getUi().alert("フォルダが見つかりません: articles");
    return;
  }

  // インデックスを1回だけ構築
  var articleIndex = buildFullFileIndex_(articleFolder);
  var xpostIndex = xpostFolder ? buildFullFileIndex_(xpostFolder) : {};

  // 選択範囲の必要列を一括読み込み
  var allData = sheet.getRange(startRow, 1, numRows, COL.XPOST_FILE).getValues();

  var updated = 0;
  var notFound = [];

  for (var i = 0; i < allData.length; i++) {
    var fileNo = allData[i][COL.FILE_NO - 1].toString().trim();
    var no = allData[i][COL.NO - 1].toString().trim();
    var brand = allData[i][COL.BRAND - 1].toString().trim();
    var lookupNo = fileNo || no;
    if (!lookupNo || !brand) continue;

    var row = startRow + i;
    var numStr = padNumber_(lookupNo);
    if (!numStr) continue;

    var folderName = getBrandFolder_(brand);
    if (!folderName) {
      notFound.push("行" + row + ": ブランド「" + brand + "」不明");
      continue;
    }

    var found = false;

    // F列: 記事TXT
    var txtFile = findInIndex_(articleIndex, folderName, numStr, "article_", "txt");
    if (txtFile) {
      sheet.getRange(row, COL.ARTICLE_TXT).setFormula(
        '=HYPERLINK("' + txtFile.url + '","' + txtFile.name + '")'
      );
      found = true;
    }

    // G列: X投稿MD
    var xFile = findInIndex_(xpostIndex, folderName, numStr, "x_", "md");
    if (!xFile) xFile = findInIndex_(xpostIndex, folderName, numStr, "x_", "txt");
    if (xFile) {
      sheet.getRange(row, COL.XPOST_FILE).setFormula(
        '=HYPERLINK("' + xFile.url + '","' + xFile.name + '")'
      );
      found = true;
    }

    if (found) updated++;
    else notFound.push("行" + row + " (No." + lookupNo + " / " + brand + ")");
  }

  var msg = "選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n";
  msg += "完了: " + updated + "件のリンクを取得しました。";
  if (notFound.length > 0) {
    msg += "\n\n見つからなかった行:\n" + notFound.slice(0, 10).join("\n");
    if (notFound.length > 10) msg += "\n... 他" + (notFound.length - 10) + "件";
  }
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * フォルダ内の全ファイルをブランド別・番号別にインデックス化
 * { "ROLEX": [ {name, url, number, prefix, ext}, ... ], ... }
 */
function buildFullFileIndex_(folder) {
  var result = {};
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    var sub = subfolders.next();
    var brandName = sub.getName();
    if (brandName === "_posted") continue;
    result[brandName] = [];

    // サブフォルダ直下のファイル
    var files = sub.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      var match = name.match(/^(\d{3})_(article_|x_).*\.(txt|html|md)$/);
      if (match) {
        result[brandName].push({
          name: name,
          url: file.getUrl(),
          number: match[1],
          prefix: match[2],
          ext: match[3]
        });
      }
    }

    // _posted サブフォルダ内も検索
    var postedIter = sub.getFoldersByName("_posted");
    if (postedIter.hasNext()) {
      var posted = postedIter.next();
      var pFiles = posted.getFiles();
      while (pFiles.hasNext()) {
        var pf = pFiles.next();
        var pName = pf.getName();
        var pMatch = pName.match(/^(\d{3})_(article_|x_).*\.(txt|html|md)$/);
        if (pMatch) {
          result[brandName].push({
            name: pName,
            url: pf.getUrl(),
            number: pMatch[1],
            prefix: pMatch[2],
            ext: pMatch[3]
          });
        }
      }
    }
  }
  return result;
}

/**
 * インデックスからブランド×番号×プレフィックス×拡張子でファイルを検索
 */
function findInIndex_(index, brandFolder, numStr, prefix, ext) {
  var files = index[brandFolder];
  if (!files) return null;
  for (var i = 0; i < files.length; i++) {
    if (files[i].number === numStr && files[i].prefix === prefix && files[i].ext === ext) {
      return files[i];
    }
  }
  return null;
}

// ===== タイトル整形 =====

function removeMagazineSuffix() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  var suffix = "｜FIRE KIDS Magazine";
  var updated = 0;
  for (var i = 2; i <= lastRow; i++) {
    var cell = sheet.getRange(i, COL.TITLE);
    var value = cell.getValue().toString();
    if (value.indexOf(suffix) !== -1) {
      cell.setValue(value.replace(suffix, ""));
      updated++;
    }
  }
  SpreadsheetApp.getUi().alert("完了: " + updated + "件のタイトルから「｜FIRE KIDS Magazine」を削除しました。");
}

// ===== 診断関数 =====

function debugDiagnose() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var msgs = [];

  msgs.push("■ 設定:");
  msgs.push("  BASE_FOLDER_ID: " + (BASE_FOLDER_ID ? BASE_FOLDER_ID : "（未設定 → マイドライブから検索）"));
  var baseFolder = getBaseFolder_();
  msgs.push("  ベースフォルダ: " + (baseFolder ? "✅ " + baseFolder.getName() : "❌ 見つからない"));

  var articleFolder = findFolder_("articles");
  var xpostFolder = findFolder_("x_posts");
  msgs.push("");
  msgs.push("■ フォルダ検索:");
  msgs.push("  articles: " + (articleFolder ? "✅ 見つかった" : "❌ 見つからない"));
  msgs.push("  x_posts: " + (xpostFolder ? "✅ 見つかった" : "❌ 見つからない"));

  if (articleFolder) {
    var articleIndex = buildFullFileIndex_(articleFolder);
    var totalFiles = 0;
    for (var brand in articleIndex) totalFiles += articleIndex[brand].length;
    msgs.push("");
    msgs.push("■ 記事ファイル数: " + totalFiles);
    for (var b in articleIndex) {
      msgs.push("  " + b + ": " + articleIndex[b].length + "件");
    }
  }

  msgs.push("");
  msgs.push("■ スプレッドシート行数: " + sheet.getLastRow());

  SpreadsheetApp.getUi().alert(msgs.join("\n"));
}

// ===== TXT → ドキュメント =====

function txtToDocSelected() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。"); return; }

  var count = 0;
  for (var i = 0; i < numRows; i++) {
    count += txtToDocRow_(sheet, startRow + i);
  }
  SpreadsheetApp.getUi().alert("選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n完了: " + count + "件のドキュメントを作成しました。");
}

function txtToDocAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }

  var articleFolder = findFolder_("articles");
  if (!articleFolder) { SpreadsheetApp.getUi().alert("フォルダが見つかりません: articles"); return; }
  var reviewFolder = getOrCreateFolder_("data/review_docs");

  // 既存ドキュメントマップを一括構築（毎行検索しない）
  var existingDocs = {};
  var docFiles = reviewFolder.getFiles();
  while (docFiles.hasNext()) {
    var df = docFiles.next();
    existingDocs[df.getName()] = df.getUrl();
  }

  // ファイルマップを一括構築
  var fileMap = buildFileMapRecursive_(articleFolder);

  // G列の値・数式を一括読み込み
  var formulas = sheet.getRange(2, COL.ARTICLE_TXT, lastRow - 1, 1).getFormulas();
  var values = sheet.getRange(2, COL.ARTICLE_TXT, lastRow - 1, 1).getValues();

  var count = 0;
  var updates = []; // {row, formula} のバッチ

  for (var i = 0; i < formulas.length; i++) {
    var fileName = "";
    if (formulas[i][0]) {
      var m = formulas[i][0].match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
      if (m) fileName = m[1];
    } else {
      fileName = values[i][0].toString().trim();
    }
    if (!fileName) continue;

    var docTitle = fileName.replace(/\.txt$/, "");
    var row = i + 2;

    // 既存ドキュメントがあればリンクだけ更新
    if (existingDocs[docTitle]) {
      updates.push({row: row, formula: '=HYPERLINK("' + existingDocs[docTitle] + '","' + docTitle + '")'});
      continue;
    }

    // ファイルマップからTXTを取得
    var txtUrl = fileMap[fileName];
    if (!txtUrl) continue;

    var fileIdMatch = txtUrl.match(/[-\w]{25,}/);
    if (!fileIdMatch) continue;

    var txtFile;
    try { txtFile = DriveApp.getFileById(fileIdMatch[0]); } catch (e) { continue; }

    var content = txtFile.getBlob().getDataAsString("UTF-8");
    var doc = DocumentApp.create(docTitle);
    doc.getBody().setText(content);
    doc.saveAndClose();

    var newDocFile = DriveApp.getFileById(doc.getId());
    reviewFolder.addFile(newDocFile);
    DriveApp.getRootFolder().removeFile(newDocFile);

    updates.push({row: row, formula: '=HYPERLINK("' + doc.getUrl() + '","' + docTitle + '")'});
    count++;
  }

  // バッチでセル更新（一括書き込み）
  if (updates.length > 0) {
    for (var u = 0; u < updates.length; u++) {
      sheet.getRange(updates[u].row, COL.ARTICLE_TXT).setFormula(updates[u].formula);
    }
    SpreadsheetApp.flush();
  }

  SpreadsheetApp.getUi().alert("完了: " + count + "件作成 / " + (updates.length - count) + "件既存リンク更新");
}

/**
 * 選択範囲のみドキュメント化（194以降の未チェック記事を一括処理する用途）
 * 使い方: スプレッドシートで194行目〜最終行を選択してメニュー実行
 * - 選択範囲外の行（チェック済み）は一切触らない
 * - 既にドキュメントが存在する場合はリンクを再設定するだけ（新規作成はしない）
 */
function txtToDocRange() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) {
    SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。");
    return;
  }

  var articleFolder = findFolder_("articles");
  if (!articleFolder) { SpreadsheetApp.getUi().alert("フォルダが見つかりません: articles"); return; }
  var reviewFolder = getOrCreateFolder_("data/review_docs");

  // 既存ドキュメントマップを一括構築
  var existingDocs = {};
  var docFiles = reviewFolder.getFiles();
  while (docFiles.hasNext()) {
    var df = docFiles.next();
    existingDocs[df.getName()] = df.getUrl();
  }

  // ファイルマップを一括構築
  var fileMap = buildFileMapRecursive_(articleFolder);

  // 選択範囲の値・数式を一括読み込み
  var formulas = sheet.getRange(startRow, COL.ARTICLE_TXT, numRows, 1).getFormulas();
  var values = sheet.getRange(startRow, COL.ARTICLE_TXT, numRows, 1).getValues();

  var count = 0;
  var skipped = 0;
  var notFound = 0;
  var updates = [];

  for (var i = 0; i < formulas.length; i++) {
    var fileName = "";
    if (formulas[i][0]) {
      var m = formulas[i][0].match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
      if (m) fileName = m[1];
    } else {
      fileName = values[i][0].toString().trim();
    }
    if (!fileName) continue;

    var docTitle = fileName.replace(/\.txt$/, "");
    var row = startRow + i;

    // 既存ドキュメントがあればリンクだけ更新（重複作成しない）
    if (existingDocs[docTitle]) {
      updates.push({row: row, formula: '=HYPERLINK("' + existingDocs[docTitle] + '","' + docTitle + '")'});
      skipped++;
      continue;
    }

    // ファイルマップからTXTを取得
    var txtUrl = fileMap[fileName];
    if (!txtUrl) { notFound++; continue; }

    var fileIdMatch = txtUrl.match(/[-\w]{25,}/);
    if (!fileIdMatch) { notFound++; continue; }

    var txtFile;
    try { txtFile = DriveApp.getFileById(fileIdMatch[0]); } catch (e) { notFound++; continue; }

    var content = txtFile.getBlob().getDataAsString("UTF-8");
    var doc = DocumentApp.create(docTitle);
    doc.getBody().setText(content);
    doc.saveAndClose();

    var newDocFile = DriveApp.getFileById(doc.getId());
    reviewFolder.addFile(newDocFile);
    DriveApp.getRootFolder().removeFile(newDocFile);

    updates.push({row: row, formula: '=HYPERLINK("' + doc.getUrl() + '","' + docTitle + '")'});
    count++;
  }

  // バッチでセル更新
  if (updates.length > 0) {
    for (var u = 0; u < updates.length; u++) {
      sheet.getRange(updates[u].row, COL.ARTICLE_TXT).setFormula(updates[u].formula);
    }
    SpreadsheetApp.flush();
  }

  var msg = "選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n\n";
  msg += "新規作成: " + count + "件\n";
  msg += "既存リンク再設定: " + skipped + "件\n";
  if (notFound > 0) msg += "ファイル未発見: " + notFound + "件";
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * X投稿MDの選択範囲ドキュメント化
 */
function xpostToDocRange() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) {
    SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。");
    return;
  }

  var reviewFolder = getOrCreateFolder_("data/review_docs");

  var existingDocs = {};
  var docFiles = reviewFolder.getFiles();
  while (docFiles.hasNext()) {
    var df = docFiles.next();
    existingDocs[df.getName()] = df.getUrl();
  }

  var formulas = sheet.getRange(startRow, COL.XPOST_FILE, numRows, 1).getFormulas();

  var count = 0;
  var skipped = 0;
  var updates = [];

  for (var i = 0; i < formulas.length; i++) {
    if (!formulas[i][0]) continue;

    var urlMatch = formulas[i][0].match(/HYPERLINK\("([^"]*)"[^"]*"([^"]*)"\)/);
    if (!urlMatch) continue;

    var fileUrl = urlMatch[1];
    var fileName = urlMatch[2];
    var docTitle = "X_" + fileName.replace(/\.(md|txt)$/, "");
    var row = startRow + i;

    if (existingDocs[docTitle]) {
      updates.push({row: row, formula: '=HYPERLINK("' + existingDocs[docTitle] + '","' + docTitle + '")'});
      skipped++;
      continue;
    }

    var fileIdMatch = fileUrl.match(/[-\w]{25,}/);
    if (!fileIdMatch) continue;

    var mdFile;
    try { mdFile = DriveApp.getFileById(fileIdMatch[0]); } catch (e) { continue; }

    var content;
    try { content = mdFile.getBlob().getDataAsString("UTF-8"); } catch (e) {
      try { content = mdFile.getAs("text/plain").getDataAsString("UTF-8"); } catch (e2) { continue; }
    }

    var doc = DocumentApp.create(docTitle);
    doc.getBody().setText(content);
    doc.saveAndClose();

    var newDocFile = DriveApp.getFileById(doc.getId());
    reviewFolder.addFile(newDocFile);
    DriveApp.getRootFolder().removeFile(newDocFile);

    updates.push({row: row, formula: '=HYPERLINK("' + doc.getUrl() + '","' + docTitle + '")'});
    count++;
  }

  for (var u = 0; u < updates.length; u++) {
    sheet.getRange(updates[u].row, COL.XPOST_FILE).setFormula(updates[u].formula);
  }

  var msg = "選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n\n";
  msg += "新規作成: " + count + "件\n";
  msg += "既存リンク再設定: " + skipped + "件";
  SpreadsheetApp.getUi().alert(msg);
}

function txtToDocRow_(sheet, row) {
  var articleFolder = findFolder_("articles");
  if (!articleFolder) return 0;
  var reviewFolder = getOrCreateFolder_("data/review_docs");

  var cell = sheet.getRange(row, COL.ARTICLE_TXT);
  var fileName = getPlainValue_(cell);
  if (!fileName) return 0;

  var txtFile = findFileRecursive_(articleFolder, fileName);
  if (!txtFile) return 0;

  var docTitle = fileName.replace(/\.txt$/, "");

  var existing = reviewFolder.getFilesByName(docTitle);
  if (existing.hasNext()) {
    cell.setFormula('=HYPERLINK("' + existing.next().getUrl() + '","' + docTitle + '")');
    return 0;
  }

  var content = txtFile.getBlob().getDataAsString("UTF-8");
  var doc = DocumentApp.create(docTitle);
  doc.getBody().setText(content);
  doc.saveAndClose();

  var docFile = DriveApp.getFileById(doc.getId());
  reviewFolder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile);

  cell.setFormula('=HYPERLINK("' + doc.getUrl() + '","' + docTitle + '")');
  return 1;
}

/**
 * HTMLファイル内のCDN画像URLを抽出し、Googleドキュメントの末尾に挿入
 * 画像はドキュメント末尾に「--- 参考画像 ---」セクションとしてまとめて挿入
 */
function insertImagesFromHtml_(doc, htmlFile) {
  var htmlContent;
  try {
    htmlContent = htmlFile.getBlob().getDataAsString("UTF-8");
  } catch (e) {
    return;
  }

  // CDN画像URLを全て抽出
  var imgPattern = /src="(https:\/\/cdn\.firekids\.jp\/[^"]+)"/g;
  var urls = [];
  var seen = {};
  var match;
  while ((match = imgPattern.exec(htmlContent)) !== null) {
    var url = match[1];
    if (!seen[url]) {
      urls.push(url);
      seen[url] = true;
    }
  }

  if (urls.length === 0) return;

  var body = doc.getBody();

  // セパレーター
  body.appendParagraph("").setSpacingAfter(12);
  var separator = body.appendParagraph("━━━ 参考画像 ━━━");
  separator.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  separator.setForegroundColor("#888888");
  separator.setFontSize(10);

  // 画像を挿入（最大6枚）
  var inserted = 0;
  for (var i = 0; i < urls.length && inserted < 6; i++) {
    try {
      var response = UrlFetchApp.fetch(urls[i], {muteHttpExceptions: true});
      if (response.getResponseCode() !== 200) continue;

      var blob = response.getBlob();
      var img = body.appendImage(blob);

      // 幅を300pxに統一
      var width = img.getWidth();
      var height = img.getHeight();
      if (width > 300) {
        var ratio = 300 / width;
        img.setWidth(300);
        img.setHeight(Math.round(height * ratio));
      }

      // 画像の下にURLをキャプションとして追加
      var caption = body.appendParagraph(urls[i]);
      caption.setFontSize(7);
      caption.setForegroundColor("#999999");

      inserted++;
    } catch (e) {
      // 画像取得失敗はスキップ
      continue;
    }
  }

  if (inserted > 0) {
    var note = body.appendParagraph("※ 上記はCDN参考画像です。記事レビュー時の参照用として挿入しています。");
    note.setFontSize(8);
    note.setForegroundColor("#AAAAAA");
    note.setItalic(true);
  }
}

/**
 * フォルダ内の全ファイルを名前→URLのマップで返す（再帰）
 */
function buildFileMapRecursive_(folder, parentName) {
  var map = {};
  var folderName = parentName || "";
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    map[file.getName()] = file.getUrl();
  }
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    var sub = subfolders.next();
    if (sub.getName() === "_posted") continue;
    var subMap = buildFileMapRecursive_(sub, sub.getName());
    for (var key in subMap) { map[key] = subMap[key]; }
  }
  return map;
}

/**
 * 既存のreview_docsドキュメントのリンクをF列に一括設定
 * ドキュメント作成済みだがリンクが切れている場合に使用
 */
function linkExistingDocs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }

  var reviewFolder = getOrCreateFolder_("data/review_docs");

  // review_docs内の全ドキュメントをマップ化（名前→URL）
  var docMap = {};
  var docFiles = reviewFolder.getFiles();
  while (docFiles.hasNext()) {
    var df = docFiles.next();
    docMap[df.getName()] = df.getUrl();
  }

  var txtCount = 0;
  var xCount = 0;

  // F列: 記事TXTドキュメント
  var txtFormulas = sheet.getRange(2, COL.ARTICLE_TXT, lastRow - 1, 1).getFormulas();
  var txtValues = sheet.getRange(2, COL.ARTICLE_TXT, lastRow - 1, 1).getValues();

  for (var i = 0; i < txtFormulas.length; i++) {
    var fileName = "";
    if (txtFormulas[i][0]) {
      var m = txtFormulas[i][0].match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
      if (m) fileName = m[1];
    } else {
      fileName = txtValues[i][0].toString().trim();
    }
    if (!fileName) continue;

    var docTitle = fileName.replace(/\.txt$/, "");
    var docUrl = docMap[docTitle];
    if (docUrl) {
      sheet.getRange(i + 2, COL.ARTICLE_TXT).setFormula(
        '=HYPERLINK("' + docUrl + '","' + docTitle + '")'
      );
      txtCount++;
    }
  }

  // G列: X投稿ドキュメント
  var xFormulas = sheet.getRange(2, COL.XPOST_FILE, lastRow - 1, 1).getFormulas();
  var xValues = sheet.getRange(2, COL.XPOST_FILE, lastRow - 1, 1).getValues();

  for (var j = 0; j < xFormulas.length; j++) {
    var xFileName = "";
    if (xFormulas[j][0]) {
      var xm = xFormulas[j][0].match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
      if (xm) xFileName = xm[1];
    } else {
      xFileName = xValues[j][0].toString().trim();
    }
    if (!xFileName) continue;

    var xDocTitle = "X_" + xFileName.replace(/\.(md|txt)$/, "");
    var xDocUrl = docMap[xDocTitle];
    if (xDocUrl) {
      sheet.getRange(j + 2, COL.XPOST_FILE).setFormula(
        '=HYPERLINK("' + xDocUrl + '","' + xDocTitle + '")'
      );
      xCount++;
    }
  }

  SpreadsheetApp.getUi().alert("完了:\n  記事ドキュメント: " + txtCount + "件\n  X投稿ドキュメント: " + xCount + "件");
}

// ===== ドキュメント → TXT書き戻し =====

function docToTxtSelected() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。"); return; }

  var count = 0;
  for (var i = 0; i < numRows; i++) {
    count += docToTxtRow_(sheet, startRow + i);
  }
  SpreadsheetApp.getUi().alert("選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n完了: " + count + "件のTXTを更新しました。");
}

function docToTxtAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }
  var count = 0;
  for (var i = 2; i <= lastRow; i++) {
    count += docToTxtRow_(sheet, i);
  }
  SpreadsheetApp.getUi().alert("完了: " + count + "件のTXTを更新しました。");
}

function docToTxtRow_(sheet, row) {
  var cell = sheet.getRange(row, COL.ARTICLE_TXT);
  var formula = cell.getFormula();
  if (!formula) return 0;

  var urlMatch = formula.match(/HYPERLINK\("([^"]*)".*\)/);
  if (!urlMatch) return 0;
  var nameMatch = formula.match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
  if (!nameMatch) return 0;
  var docTitle = nameMatch[1];

  var docIdMatch = urlMatch[1].match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) return 0;

  var doc;
  try { doc = DocumentApp.openById(docIdMatch[1]); } catch (e) { return 0; }
  var newContent = doc.getBody().getText();

  // ファクトチェック欄を除去（本文のみ抽出）
  var fcMarker = "━━━━━━━━━━━━━━━━━━━━";
  var fcIndex = newContent.indexOf(fcMarker);
  if (fcIndex > 0) {
    newContent = newContent.substring(0, fcIndex).replace(/\s+$/, "\n");
  }
  // 参考画像セクションも除去
  var imgMarker = "━━━ 参考画像 ━━━";
  var imgIndex = newContent.indexOf(imgMarker);
  if (imgIndex > 0) {
    newContent = newContent.substring(0, imgIndex).replace(/\s+$/, "\n");
  }

  var txtName = docTitle + ".txt";
  var articleFolder = findFolder_("articles");
  if (!articleFolder) return 0;

  var txtFile = findFileRecursive_(articleFolder, txtName);
  if (!txtFile) return 0;

  txtFile.setContent(newContent);
  cell.setFormula('=HYPERLINK("' + txtFile.getUrl() + '","' + txtName + '")');
  sheet.getRange(row, COL.ARTICLE_UPLOADED).setValue("レビュー済み");
  return 1;
}

// ===== X投稿MD → ドキュメント =====

function xpostToDocSelected() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。"); return; }

  var count = 0;
  for (var i = 0; i < numRows; i++) {
    count += xpostToDocRow_(sheet, startRow + i);
  }
  SpreadsheetApp.getUi().alert("選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n完了: " + count + "件のX投稿ドキュメントを作成しました。");
}

function xpostToDocAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }

  var reviewFolder = getOrCreateFolder_("data/review_docs");

  // 既存ドキュメントマップを一括構築
  var existingDocs = {};
  var docFiles = reviewFolder.getFiles();
  while (docFiles.hasNext()) {
    var df = docFiles.next();
    existingDocs[df.getName()] = df.getUrl();
  }

  // H列の数式を一括読み込み（HYPERLINKからURL+ファイル名を直接取得）
  var formulas = sheet.getRange(2, COL.XPOST_FILE, lastRow - 1, 1).getFormulas();

  var count = 0;
  var skipped = 0;
  var updates = [];

  for (var i = 0; i < formulas.length; i++) {
    if (!formulas[i][0]) continue;

    // HYPERLINKからURL+ファイル名を直接抽出
    var urlMatch = formulas[i][0].match(/HYPERLINK\("([^"]*)"[^"]*"([^"]*)"\)/);
    if (!urlMatch) continue;

    var fileUrl = urlMatch[1];
    var fileName = urlMatch[2];
    var docTitle = "X_" + fileName.replace(/\.(md|txt)$/, "");
    var row = i + 2;

    // 既存ドキュメントがあればスキップ
    if (existingDocs[docTitle]) {
      updates.push({row: row, formula: '=HYPERLINK("' + existingDocs[docTitle] + '","' + docTitle + '")'});
      skipped++;
      continue;
    }

    // HYPERLINKのURLからファイルIDを直接取得（再検索不要）
    var fileIdMatch = fileUrl.match(/[-\w]{25,}/);
    if (!fileIdMatch) continue;

    var mdFile;
    try { mdFile = DriveApp.getFileById(fileIdMatch[0]); } catch (e) { continue; }

    var content;
    try { content = mdFile.getBlob().getDataAsString("UTF-8"); } catch (e) {
      // MIMEタイプ問題の場合、テキストとして再取得
      try { content = mdFile.getAs("text/plain").getDataAsString("UTF-8"); } catch (e2) { continue; }
    }

    var doc = DocumentApp.create(docTitle);
    doc.getBody().setText(content);
    doc.saveAndClose();

    var newDocFile = DriveApp.getFileById(doc.getId());
    reviewFolder.addFile(newDocFile);
    DriveApp.getRootFolder().removeFile(newDocFile);

    updates.push({row: row, formula: '=HYPERLINK("' + doc.getUrl() + '","' + docTitle + '")'});
    count++;
  }

  // バッチでセル更新
  for (var u = 0; u < updates.length; u++) {
    sheet.getRange(updates[u].row, COL.XPOST_FILE).setFormula(updates[u].formula);
  }

  var msg = "完了: " + count + "件のX投稿ドキュメントを作成しました。";
  if (skipped > 0) msg += "\n既存スキップ: " + skipped + "件";
  SpreadsheetApp.getUi().alert(msg);
}

function xpostToDocRow_(sheet, row) {
  var reviewFolder = getOrCreateFolder_("data/review_docs");
  var cell = sheet.getRange(row, COL.XPOST_FILE);
  var formula = cell.getFormula();

  // HYPERLINKからURL+ファイル名を直接取得
  var fileUrl, fileName;
  if (formula) {
    var urlMatch = formula.match(/HYPERLINK\("([^"]*)"[^"]*"([^"]*)"\)/);
    if (!urlMatch) return 0;
    fileUrl = urlMatch[1];
    fileName = urlMatch[2];
  } else {
    // プレーンテキストの場合はx_postsフォルダから検索
    fileName = cell.getValue().toString().trim();
    if (!fileName) return 0;
    var xpostFolder = findFolder_("x_posts");
    if (!xpostFolder) return 0;
    var mdFile = findFileRecursive_(xpostFolder, fileName);
    if (!mdFile) return 0;
    fileUrl = mdFile.getUrl();
  }

  var docTitle = "X_" + fileName.replace(/\.(md|txt)$/, "");

  var existing = reviewFolder.getFilesByName(docTitle);
  if (existing.hasNext()) {
    cell.setFormula('=HYPERLINK("' + existing.next().getUrl() + '","' + docTitle + '")');
    return 0;
  }

  var fileIdMatch = fileUrl.match(/[-\w]{25,}/);
  if (!fileIdMatch) return 0;

  var mdFile2;
  try { mdFile2 = DriveApp.getFileById(fileIdMatch[0]); } catch (e) { return 0; }

  var content;
  try { content = mdFile2.getBlob().getDataAsString("UTF-8"); } catch (e) {
    try { content = mdFile2.getAs("text/plain").getDataAsString("UTF-8"); } catch (e2) { return 0; }
  }

  var doc = DocumentApp.create(docTitle);
  doc.getBody().setText(content);
  doc.saveAndClose();

  var docFile = DriveApp.getFileById(doc.getId());
  reviewFolder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile);

  cell.setFormula('=HYPERLINK("' + doc.getUrl() + '","' + docTitle + '")');
  return 1;
}

// ===== X投稿ドキュメント → MD書き戻し =====

function docToXpostSelected() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) { SpreadsheetApp.getUi().alert("データ行を選択してください（2行目以降）。"); return; }

  var count = 0;
  for (var i = 0; i < numRows; i++) {
    count += docToXpostRow_(sheet, startRow + i);
  }
  SpreadsheetApp.getUi().alert("選択範囲: " + startRow + "行目〜" + (startRow + numRows - 1) + "行目\n完了: " + count + "件のX投稿MDを更新しました。");
}

function docToXpostAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("データがありません。"); return; }
  var count = 0;
  for (var i = 2; i <= lastRow; i++) {
    count += docToXpostRow_(sheet, i);
  }
  SpreadsheetApp.getUi().alert("完了: " + count + "件のX投稿MDを更新しました。");
}

function docToXpostRow_(sheet, row) {
  var cell = sheet.getRange(row, COL.XPOST_FILE);
  var formula = cell.getFormula();
  if (!formula) return 0;

  var urlMatch = formula.match(/HYPERLINK\("([^"]*)".*\)/);
  if (!urlMatch) return 0;
  var nameMatch = formula.match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
  if (!nameMatch) return 0;
  var docTitle = nameMatch[1];

  var docIdMatch = urlMatch[1].match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) return 0;

  var doc;
  try { doc = DocumentApp.openById(docIdMatch[1]); } catch (e) { return 0; }
  var content = doc.getBody().getText();

  var baseName = docTitle.replace(/^X_/, "");
  var mdName = baseName + ".md";
  var xpostFolder = findFolder_("x_posts");
  if (!xpostFolder) return 0;

  var mdFile = findFileRecursive_(xpostFolder, mdName);
  if (!mdFile) {
    var txtName = baseName + ".txt";
    mdFile = findFileRecursive_(xpostFolder, txtName);
    if (mdFile) mdName = txtName;
  }
  if (!mdFile) return 0;

  mdFile.setContent(content);
  cell.setFormula('=HYPERLINK("' + mdFile.getUrl() + '","' + mdName + '")');
  return 1;
}

// ===== 投稿済み管理 =====
// スプレッドシートのI列（アップ済み）で状態管理するため、ファイル隔離機能は削除

// ===== ユーティリティ =====

function padNumber_(n) {
  var num = parseInt(n, 10);
  if (isNaN(num) || num <= 0) return null;
  if (num < 10) return "00" + num;
  if (num < 100) return "0" + num;
  return "" + num;
}

function getBrandFolder_(brand) {
  var folderName = BRAND_MAP[brand];
  if (folderName) return folderName;
  for (var key in BRAND_MAP) {
    if (brand.indexOf(key) !== -1) return BRAND_MAP[key];
  }
  return null;
}

function getPlainValue_(cell) {
  var formula = cell.getFormula();
  if (formula) {
    var match = formula.match(/HYPERLINK\("[^"]*","([^"]*)"\)/);
    if (match) return match[1];
  }
  return cell.getValue().toString().trim();
}

function getBaseFolder_() {
  if (BASE_FOLDER_ID && BASE_FOLDER_ID !== "") {
    try { return DriveApp.getFolderById(BASE_FOLDER_ID); } catch (e) { return null; }
  }
  var iter = DriveApp.getRootFolder().getFoldersByName("MAGAZINE");
  return iter.hasNext() ? iter.next() : null;
}

function findFolder_(path) {
  var parts = path.split("/");
  var baseFolder = getBaseFolder_();
  if (!baseFolder) return null;
  var startIdx = (parts[0] === "MAGAZINE" && baseFolder.getName() === "MAGAZINE") ? 1 : 0;
  var folder = baseFolder;
  for (var i = startIdx; i < parts.length; i++) {
    var iter = folder.getFoldersByName(parts[i]);
    if (iter.hasNext()) { folder = iter.next(); } else { return null; }
  }
  return folder;
}

function getOrCreateFolder_(path) {
  var parts = path.split("/");
  var baseFolder = getBaseFolder_();
  if (!baseFolder) baseFolder = DriveApp.getRootFolder();
  var startIdx = (parts[0] === "MAGAZINE" && baseFolder.getName() === "MAGAZINE") ? 1 : 0;
  var folder = baseFolder;
  for (var i = startIdx; i < parts.length; i++) {
    var iter = folder.getFoldersByName(parts[i]);
    if (iter.hasNext()) { folder = iter.next(); } else { folder = folder.createFolder(parts[i]); }
  }
  return folder;
}

function findFileRecursive_(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) return files.next();
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    var result = findFileRecursive_(subfolders.next(), fileName);
    if (result) return result;
  }
  return null;
}

// ===== 権限付与について =====
// review_docsフォルダに直接権限を付与済みのため、個別ファイルへの権限付与機能は削除

function getSubFolder_(parent, name) {
  var iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : null;
}

function getOrCreateSubFolder_(parent, name) {
  var iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : parent.createFolder(name);
}
