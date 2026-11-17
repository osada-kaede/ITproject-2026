# TODOアプリ V1 設計書

## 1. 作るものとファイルの役割

既存のExpress ＋ TypeScript ＋ EJS構成を維持しつつ、以下のファイル構成でTODOアプリ（V1）を実装する。

### ファイル構成と役割
* **`index.ts`**: エントリーポイント。既存ルート（`/`, `/api/db-check`）を維持し、`express.json()`、JSON構文エラーハンドラ、`/todo` 画面ルート、`/api/v1/todos` の `todoRouter` 登録のみを最小限追記する。
* **`db.ts`**: 既存のNeon PostgreSQL接続モジュール（`pool` をエクスポート）。変更しない。
* **`sql/todo/020_create_todo_tasks.sql`**: `todo_tasks` テーブルを作成するDDLスクリプト。
* **`src/apps/todo/todoRouter.ts`**: `/api/v1/todos` 配下のHTTPメソッドとパス（`/`, `/:id`）をControllerへ振り分ける。
* **`src/apps/todo/todoController.ts`**: リクエストの入力検証（400/422）、存在確認（404）、例外捕捉（500/503）、統一JSONレスポンスの生成を行う。
* **`src/apps/todo/todoModel.ts`**: `db.ts` の `pool` を用いてパラメーター化SQL（`$1`, `$2`）を実行し、DB列（snake_case）をJSON形式（camelCase）へ変換する。
* **`views/todo/index.ejs`**: `/todo` 画面のHTMLテンプレート（入力フォーム、エラー・処理中・0件表示エリア、TODO一覧リスト）。
* **`public/todo/todo.js`**: ブラウザ用JavaScript。API通信を集約する `TodoApi` クラスと、画面DOMの描画・イベント制御を実装する。

---

## 2. リクエストはどこを通るか

### 画面表示フロー
`ブラウザ (GET /todo)` → `index.ts` → `views/todo/index.ejs`（HTML返却） → `public/todo/todo.js` 読み込み

### API呼び出しフロー
`ブラウザ (TodoApiメソッド)` → `Fetch API` → `index.ts (express.json)` → `todoRouter.ts` → `todoController.ts (検証)` → `todoModel.ts (SQL実行)` → `db.ts (Neon PostgreSQL)` → `todoModel.ts (camelCase変換)` → `todoController.ts (統一JSON返却)` → `画面DOM更新 (textContent)`

---

## 3. DBの設計

### テーブル作成SQL（`sql/todo/020_create_todo_tasks.sql`）

```sql
CREATE TABLE IF NOT EXISTS todo_tasks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 100
    AND char_length(btrim(title)) > 0
  ),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### カラム定義

| 列名（DB） | 型・制約 | JSONキー | 目的 |
| --- | --- | --- | --- |
| `id` | `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | `id` | 1件を識別する主キー |
| `title` | `TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100 AND char_length(btrim(title)) > 0)` | `title` | TODO本文 |
| `is_completed` | `BOOLEAN NOT NULL DEFAULT FALSE` | `isCompleted` | 完了状態（初期値 `false`） |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `createdAt` | 作成日時（ISO 8601文字列へ変換） |

---

## 4. APIの共通ルール

* **ベースURL**: `/api/v1/todos`
* **成功レスポンス（GET / POST / PATCH）**:
  ```json
  {
    "status": "success",
    "data": ...
  }
  ```
* **成功レスポンス（DELETE）**: ステータス `204`、レスポンス本文なし。
* **エラーレスポンス（400 / 422 / 404 / 500 / 503 共通）**:
  ```json
  {
    "status": "error",
    "code": "BAD_REQUEST",
    "message": "エラー内容の説明",
    "details": []
  }
  ```

---

## 5. 各機能の詳細設計（REQ-01〜REQ-04）

| 要件ID | 操作 | メソッド・URL | リクエスト本文 | 成功時ステータス・JSON例 | 失敗時ステータス・code | DB処理（Model） | TodoApiメソッド | 確認方法 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **REQ-01** | 一覧取得 | `GET /api/v1/todos` | なし | `200`<br>`{"status":"success","data":[{"id":1,"title":"課題","isCompleted":false,"createdAt":"2026-11-17T00:00:00.000Z"}]}`<br>（0件時は `"data":[]`） | `500` `INTERNAL_ERROR`<br>`503` `DB_UNAVAILABLE` | `SELECT id, title, is_completed, created_at FROM todo_tasks ORDER BY id` | `TodoApi.list()` | ブラウザ初期表示および `curl` で200と配列を確認 |
| **REQ-02** | 新規登録 | `POST /api/v1/todos` | `{"title":"課題を提出する"}` | `201`<br>`{"status":"success","data":{"id":1,"title":"課題を提出する","isCompleted":false,"createdAt":"..."}}` | `400` `BAD_REQUEST`（JSON不正・欠落・型違い）<br>`422` `VALIDATION_ERROR`（空白のみ・101文字以上）<br>`500` / `503` | `INSERT INTO todo_tasks (title) VALUES ($1) RETURNING id, title, is_completed, created_at` | `TodoApi.create(title)` | フォーム送信および異常値送信で201/400/422を確認 |
| **REQ-03** | 完了状態の部分更新 | `PATCH /api/v1/todos/:id` | `{"isCompleted":true}` | `200`<br>`{"status":"success","data":{"id":1,"title":"課題を提出する","isCompleted":true,"createdAt":"..."}}` | `400` `BAD_REQUEST`（不正ID・JSON不正・boolean以外）<br>`404` `NOT_FOUND`（ID未存在）<br>`500` / `503` | `UPDATE todo_tasks SET is_completed = $1 WHERE id = $2 RETURNING id, title, is_completed, created_at` | `TodoApi.update(id, isCompleted)` | チェックボックス操作および存在しないID送信で200/404を確認 |
| **REQ-04** | 削除 | `DELETE /api/v1/todos/:id` | なし | `204`<br>（本文なし） | `400` `BAD_REQUEST`（不正ID）<br>`404` `NOT_FOUND`（ID未存在）<br>`500` / `503` | `DELETE FROM todo_tasks WHERE id = $1`（`rowCount` で存在判定） | `TodoApi.delete(id)` | 削除ボタン押下および存在しないID送信で204/404を確認 |

---

## 6. 画面とTodoApiの設計

* **`public/todo/todo.js`**:
  * `TodoApi` クラスに `baseUrl = '/api/v1/todos'` と通信処理を集約し、画面イベント側でURLを直接組み立てない。
  * `delete(id)` ではステータス `204` を受け取った際に `res.json()` を呼ばずに終了する。
  * `!res.ok` の場合はエラーJSONの `code` と `message` を取り出して例外を投げ、画面のエラー表示領域へ出力する。
  * 一覧の描画ではXSS防止のため `innerHTML` にユーザー入力を渡さず、必ず `textContent` を使用する。
* **`views/todo/index.ejs`**:
  * 入力フォーム（`#todo-form`）、エラー表示領域（`#error-area`）、処理中ステータス表示（`#status-area`）、0件メッセージ（`#empty-message`）、一覧リスト（`#todo-list`）を備える。

---

## 7. エラーはどこで処理するか

1. **JSON構文エラー（`400 BAD_REQUEST`）**: `index.ts` の `express.json()` 直後にエラーハンドリングミドルウェアを配置し、HTMLではなく統一エラーJSONを返す。
2. **入力・ID形式エラー（`400 BAD_REQUEST` / `422 VALIDATION_ERROR`）**: `todoController.ts` でDBアクセス前に検証して返す。
3. **対象未発見（`404 NOT_FOUND`）**: `todoModel.ts` の更新・削除結果が空（`null` または `false`）の場合に `todoController.ts` で返す。
4. **DB接続障害・内部エラー（`503 DB_UNAVAILABLE` / `500 INTERNAL_ERROR`）**: `todoController.ts` の `catch` ブロックでエラーコードを判定して返し、詳細はサーバーの `console.error` にのみ出力してクライアントへは接続文字列やSQLを返さない。

---

## 8. 実装への注意事項

* `index.ts` への追記は `express.json()`、JSON構文エラーハンドラ、`/todo` ルート、`/api/v1/todos` への `todoRouter` 登録のみに留め、既存の `/` と `/api/db-check` を壊さない。
* `npm run build`（`tsc`）後に `npm start` で起動した際も `views/todo/index.ejs` と `public/todo/todo.js` が正しく配信されることを確認する。