
---

# 1. `docs/todo/01_requirements.md` (確定版)

```markdown
# 要件定義書（Todoアプリケーション V1）

## 1. 目的・対象範囲
本要件定義書は、既存のExpress ＋ TypeScript ＋ EJSで構築されたWebアプリケーションに、Todo管理機能を追加するための仕様を定める。

既存のトップページ（`/`）およびDB導通確認用エンドポイント（`/api/db-check`）はそのまま維持し、ユーザー向けTodo画面を新規に `/todo` へ配置する。バックエンドは既存のデータベース接続処理および `DATABASE_URL` を使用する。

なお、V1スコープでは認証機能、優先度設定、絞り込み・検索機能、タイトル編集機能は含まない。

* **画面表示**: `/todo`（`views/todo/index.ejs` を使用）
* **API基底パス**: `/api/todo/v1/todos`

---

## 2. 4機能と受け入れ条件

### REQ-01: Todo一覧取得
* **操作**: 画面初期表示時または更新時に、保存済みのTodo一覧を取得する。
* **入力**: なし（`GET /api/todo/v1/todos`）
* **結果**: 登録されているすべてのTodoデータを配列形式で取得する。0件の場合は空配列を返す。
* **エラー**: DB接続障害時等は500または503エラーを返す。
* **受け入れ条件**:
  * 画面ロード時に自動で一覧が描画されること。
  * データが0件の際、エラーとならず空の一覧が表示されること。
* **確認方法**: 画面表示時、および `GET /api/todo/v1/todos` を実行してレスポンスデータとステータスコードを確認する。

### REQ-02: Todo新規登録
* **操作**: ユーザーが入力フォームから新しいTodoを登録する。
* **入力**: JSON形式 `{ "title": "文字列" }`（`POST /api/todo/v1/todos`）
* **結果**: 前後の空白を除去した `title` を持つ新しいTodoを作成し、生成されたオブジェクト（ID、作成日時等含む）とステータス201を返す。
* **エラー**:
  * トリム後の `title` が空文字、または101文字以上の場合：422 Unprocessable Entity
  * リクエスト形式不正：400 Bad Request
* **受け入れ条件**:
  * 前後の空白を自動除去して保存されること。
  * 1〜100文字のタイトルが正しく登録され、一覧に反映されること。
  * 0文字および101文字以上の入力でエラーメッセージが表示されること。
* **確認方法**: 正常値・異常値のタイトルを入力し、登録後のレスポンスおよび画面表示を確認する。

### REQ-03: Todo完了状態の部分更新
* **操作**: チェックボックスの操作等により、指定したTodoの完了状態（`is_completed`）を変更する。
* **入力**: URLパラメータ `id`（1以上の整数）、JSON形式 `{ "is_completed": boolean }`（`PATCH /api/todo/v1/todos/:id`）
* **結果**: 対象Todoの完了状態を更新し、更新後のオブジェクトとステータス200を返す。
* **エラー**:
  * `id` が1未満または整数でない場合：400 Bad Request
  * 存在しない `id` を指定した場合：404 Not Found
  * リクエスト値不正：422 Unprocessable Entity
* **受け入れ条件**:
  * チェック操作により完了/未完了が即座に切り替わること。
  * 対象以外のデータに変更が波及しないこと。
* **確認方法**: 各状態のトグル操作を行い、DBおよびAPIレスポンスの `is_completed` 値を確認する。

### REQ-04: Todo削除
* **操作**: 削除ボタンの押下により、指定したTodoを削除する。
* **入力**: URLパラメータ `id`（1以上の整数）（`DELETE /api/todo/v1/todos/:id`）
* **結果**: 対象のTodoを削除し、ステータス204（本文なし）を返す。
* **エラー**:
  * `id` が1未満または整数でない場合：400 Bad Request
  * 存在しない `id` を指定した場合：404 Not Found
* **受け入れ条件**:
  * 削除実行後、一覧から対象アイテムが消去されること。
  * 存在しないIDを指定した際に適切に404エラーが処理されること。
* **確認方法**: 削除操作を行い、204レスポンスおよび画面・一覧からの消去を確認する。

---

## 3. 共通のデータ・エラー条件

### データ仕様
* **ID**: 1以上の整数（自動採番）
* **title**: 前後の空白（Trim処理）を除外した1〜100文字の文字列
* **is_completed**: ブーリアン値（デフォルト: `false`）

### レスポンス・エラー共通仕様
* **成功レスポンス**:
  * GET/POST/PATCH: JSON形式 `{ "data": ... }`（0件のGETは `{ "data": [] }` で200）
  * DELETE: レスポンス本文なし（204 No Content）
* **エラーレスポンス（共通JSON形式）**:
  `{ "error": { "code": "エラーコード", "message": "エラー詳細メッセージ" } }`
* **エラー条件とHTTPステータスコード**:
  * **400 Bad Request**: JSON構文エラー、または `id` に整数以外が渡された場合
  * **422 Unprocessable Entity**: `title` の文字数制限違反（0文字、101文字以上）等、バリデーション失敗時
  * **404 Not Found**: PATCH/DELETE時に指定された `id` のTodoが存在しない場合
  * **500 Internal Server Error**: サーバー内部エラーまたは予期せぬDBエラー発生時
  * **503 Service Unavailable**: Neon DBへの接続切断や一時的なネットワーク不通時

---

## 4. 環境別確認

Preview環境（Vercel Preview）およびProduction環境（Vercel Production）は、同一のNeon PostgreSQLデータベースを参照する。

* **データ運用ポリシー**: 個人情報や機密情報は一切扱わず、テスト用および動作確認用の架空データのみを使用する。
* **確認手順**:
  1. Preview環境（PRデプロイ時）にて `/todo` にアクセスし、Fetch経由でCRUD全操作（GET/POST/PATCH/DELETE）およびバリデーションエラー時の動作を検証する。
  2. 本番環境（Productionデプロイ時）にて同様に `/todo` から動作確認を実施し、Preview環境とデータ共有・整合性が保たれていることを確認する。

```

---

# 2. `docs/todo/02_design.md` (確定版)

```markdown
# TODOアプリ V1 設計書

## 1. 作るものとファイルの役割

既存のアプリケーション構成を維持しつつ、`/todo` 画面および REST API 機能を追加する。

### ファイル構成と役割
* **`index.ts`**: エントリーポイント。既存ルーティングの維持および `todoRouter` の登録（変更は最低限に抑える）。
* **`db.ts`**: 既存の Neon PostgreSQL 接続モジュール。
* **`sql/todo/020_create_todo_tasks.sql`**: Todo用テーブル定義（DDL）スクリプト。
* **`src/apps/todo/todoRouter.ts`**: 画面表示（`/todo`）および API（`/api/todo/v1/todos`）のルーティング定義。
* **`src/apps/todo/todoController.ts`**: リクエストの受け取り、バリデーション、レスポンス整形。
* **`src/apps/todo/todoModel.ts`**: DB（`db.ts`）を操作したSQLクエリの実行。
* **`views/todo/index.ejs`**: TODO操作画面のEJSテンプレート。
* **`public/todo/todo.js`**: ブラウザ上で動作し、`TodoApi` クラスを定義して Fetch API による非同期通信を行うJavaScript。

---

## 2. リクエストはどこを通るか

### 画面表示フロー
`ブラウザ (GET /todo)` → `index.ts` → `todoRouter.ts` → `todoController.ts` → `views/todo/index.ejs` (HTMLレンダリング)

### API呼び出しフロー (CRUD全般)
`ブラウザ (public/todo/todo.js の TodoApiクラス)` → `Fetch API` → `index.ts` → `todoRouter.ts` → `todoController.ts (検証・制御)` → `todoModel.ts (SQL呼び出し)` → `db.ts (Neon DB)` → `JSONレスポンス返却` → `画面DOM更新`

---

## 3. DBの設計

### テーブル作成SQL (`sql/todo/020_create_todo_tasks.sql`)

```sql
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

```

### カラム定義

| カラム名 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| **`id`** | `SERIAL` | PRIMARY KEY | Todoを識別する1以上の整数ID |
| **`title`** | `VARCHAR(100)` | NOT NULL | Todoのタイトル（前後の空白除去後 1〜100文字） |
| **`is_completed`** | `BOOLEAN` | NOT NULL DEFAULT false | 完了フラグ (未完了: false, 完了: true) |
| **`created_at`** | `TIMESTAMP WITH TIME ZONE` | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時 |

---

## 4. APIの共通ルール

### ベースパス

`/api/todo/v1/todos`

### レスポンスフォーマット

* **成功時 (GET / POST / PATCH)**:
```json
{
  "data": { ... }
}

```


* **成功時 (DELETE)**: ステータスコード `204 No Content`（本文なし）
* **エラー時 (400 / 422 / 404 / 500 / 503)**:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーの概要メッセージ"
  }
}

```



---

## 5. 各機能の詳細設計

### 5.1 REQ-01 TODO一覧を取得する

* **HTTPメソッド / パス**: `GET /api/todo/v1/todos`
* **処理フロー**: `todoController.ts` → `todoModel.ts (SELECT * FROM todos ORDER BY id ASC)`
* **レスポンス (200 OK)**:
```json
{
  "data": [
    {
      "id": 1,
      "title": "要件定義書を確認する",
      "is_completed": false,
      "created_at": "2026-11-10T14:47:00Z"
    }
  ]
}

```


※データが0件の場合は `{ "data": [] }` を返す。

### 5.2 REQ-02 TODOを登録する

* **HTTPメソッド / パス**: `POST /api/todo/v1/todos`
* **リクエストボディ**:
```json
{
  "title": "新しいタスク"
}

```


* **処理フロー**:
1. `todoController.ts` で `title` の前後空白をトリム（`trim()`）。
2. トリム後の文字列が 1〜100 文字でない場合は **422** を返す。
3. `todoModel.ts (INSERT INTO todos (title) VALUES ($1) RETURNING *)` を実行し、生成オブジェクトを返却。


* **レスポンス (201 Created)**:
```json
{
  "data": {
    "id": 2,
    "title": "新しいタスク",
    "is_completed": false,
    "created_at": "2026-11-10T15:00:00Z"
  }
}

```



### 5.3 REQ-03 完了状態を変える

* **HTTPメソッド / パス**: `PATCH /api/todo/v1/todos/:id`
* **リクエストボディ**:
```json
{
  "is_completed": true
}

```


* **処理フロー**:
1. `id` が1以上の整数でない場合は **400** を返す。
2. `is_completed` がブーリアン型でない場合は **422** を返す。
3. `todoModel.ts (UPDATE todos SET is_completed = $1 WHERE id = $2 RETURNING *)` を実行。
4. 対象行が存在しない場合は **404** を返す。


* **レスポンス (200 OK)**:
```json
{
  "data": {
    "id": 1,
    "title": "要件定義書を確認する",
    "is_completed": true,
    "created_at": "2026-11-10T14:47:00Z"
  }
}

```



### 5.4 REQ-04 TODOを削除する

* **HTTPメソッド / パス**: `DELETE /api/todo/v1/todos/:id`
* **処理フロー**:
1. `id` が1以上の整数でない場合は **400** を返す。
2. `todoModel.ts (DELETE FROM todos WHERE id = $1)` を実行。
3. 削除対象が存在しない場合は **404** を返す。


* **レスポンス (204 No Content)**: 本文なし

---

## 6. 画面とTodoApiの設計

`public/todo/todo.js` に `TodoApi` クラスを実装し、画面側のUIイベントから呼び出す。

```javascript
class TodoApi {
  constructor(baseUrl = '/api/todo/v1/todos') {
    this.baseUrl = baseUrl;
  }

  // GET: 一覧取得
  async fetchTodos() {
    const res = await fetch(this.baseUrl);
    return this._handleResponse(res);
  }

  // POST: 登録
  async createTodo(title) {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return this._handleResponse(res);
  }

  // PATCH: 完了状態変更
  async updateStatus(id, isCompleted) {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: isCompleted })
    });
    return this._handleResponse(res);
  }

  // DELETE: 削除
  async deleteTodo(id) {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE'
    });
    if (res.status === 204) return true;
    return this._handleResponse(res);
  }

  async _handleResponse(res) {
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || 'エラーが発生しました');
    }
    return json.data;
  }
}

```

---

## 7. エラーはどこで処理するか

1. **入力・リクエストバリデーション (400 / 422)**:
* `todoController.ts` でチェックを行い、エラー時はモデルを呼び出さずに即座にエラーJSONを返す。


2. **リソース非存在チェック (404)**:
* `todoModel.ts` の処理結果（`rowCount === 0`）を `todoController.ts` で受け取り、404を返却する。


3. **サーバー・DB障害 (500 / 503)**:
* `todoController.ts` 全体を `try-catch` で囲み、DB接続エラー時は 503、その他の予期せぬ例外は 500 を返却する。



---

## 8. 実装への注意事項

* **`index.ts` への追記は最低限にする**:
`index.ts` にはルーティングの呼び出しコード（数行）のみを追加する。
```typescript
import { todoRouter } from './src/apps/todo/todoRouter';
// ...
app.use('/', todoRouter);

```


* **静的ファイルの配信設定**:
`public/todo/todo.js` がブラウザから読み込めるよう、Expressの `express.static('public')` の設定を確認・有効化する。
* **環境とデータ運用**:
Preview環境とProduction環境で同一のNeon DBを共有するため、削除やテスト時のデータ破壊に配慮する。

```

```