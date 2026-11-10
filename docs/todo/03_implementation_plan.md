
---

# TODOアプリ V1 実装計画書（`docs/todo/03_implementation_plan.md`）

## 1. 概要・進め方

本計画書は、既存のExpress + TypeScript + EJS構成（`index.ts` / `db.ts` 等）を維持したまま、`/todo` 画面および REST API（`/api/todo/v1/todos`）を事故なく実装するための作業手順書である。

作業は全6工程で構成し、各工程ごとに「動作確認」を実施して成功を確認してから次のステップへ進む。

---

## 2. 実装工程一覧

### STEP 1: DBテーブル作成スクリプトの作成とNeon実行

* **目的**: Todoデータを保持する `todos` テーブルを構築する。
* **対象ファイル**:
* `sql/todo/020_create_todo_tasks.sql`（新規作成）


* **作業内容**:
1. 以下のDDLスクリプトを `sql/todo/020_create_todo_tasks.sql` に作成してGit管理下に保存する。
```sql
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

```


2. Neonの管理コンソール（SQL Editor）を開き、上記SQLを手動実行する。


* **確認コマンド / 方法**:
* Neon SQL Editorにて以下を実行。
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'todos';

```




* **期待結果**: テーブル一覧に `todos` が表示されること。
* **失敗時に最初に見る場所**: Neon SQL Editorの構文エラーメッセージ、実行対象のブーリアン/ブランチ設定（`production` に接続しているか）。

---

### STEP 2: Model層（DB操作）の実装

* **目的**: 既存の `db.ts` を利用し、`todos` テーブルに対するCRUDクエリ関数を提供する。
* **対象ファイル**:
* `src/apps/todo/todoModel.ts`（新規作成）


* **作業内容**:
* `db.ts` から `pool`（またはDBクエリ関数）をインポートする。
* `findAll()`, `create(title)`, `updateStatus(id, isCompleted)`, `deleteById(id)` を実装する。
* SQLインジェクション防止のため、パラメタライズドクエリ（`$1`, `$2`）を使用する。


* **確認コマンド / 方法**:
* 簡易的に型チェックとビルドを行う。
```bash
npx tsc --noEmit

```




* **期待結果**: TypeScriptの型エラーが発生せずにビルドが通ること。
* **失敗時に最初に見る場所**: `db.ts` からのインポートパス表記、`todoModel.ts` 内の型定義。

---

### STEP 3: Controller層（バリデーション・制御）の実装

* **目的**: リクエストの受け取り、要件に基づくバリデーション（`title` 文字数・`id` 形式等）、ステータスコード（200/201/204/400/422/404/500/503）の整形を行う。
* **対象ファイル**:
* `src/apps/todo/todoController.ts`（新規作成）


* **作業内容**:
* **一覧取得（GET）**: 0件時は `data: []`（200 OK）を返す。
* **登録（POST）**: `title.trim()` を実施。1〜100文字でない場合は422。形式不正は400。（201 Created）
* **完了変更（PATCH）**: `id` が1未満・非整数の場合400。`is_completed` がブーリアンの場合以外422。対象なし404。（200 OK）
* **削除（DELETE）**: `id` バリデーション後、対象なしは404。（204 No Content）
* **例外処理**: DB・接続エラー等は try-catch で捕捉し 500 / 503 を返す。


* **確認コマンド / 方法**:
```bash
npx tsc --noEmit

```


* **期待結果**: エラーなく型チェックを通過すること。
* **失敗時に最初に見る場所**: `todoController.ts` 内の `trim()` 処理漏れや `parseInt` のNaN判定ロジック。

---

### STEP 4: Router層の実装と `index.ts` への最小限登録

* **目的**: ルーティングを設定し、既存のルート（`/` や `/api/db-check`）を壊さずにTodoエンドポイントを接続する。
* **対象ファイル**:
* `src/apps/todo/todoRouter.ts`（新規作成）
* `index.ts`（追記）


* **作業内容**:
1. `todoRouter.ts` に `/`（EJS用）および `/api/todo/v1/todos` 用のルーティングを定義する。
2. `index.ts` に最低限のコードを追加する（ルーティングモジュールの読み込みと `app.use` のみ）。
```typescript
// index.tsへの追記イメージ
import { todoRouter } from './src/apps/todo/todoRouter';
// ...
app.use(todoRouter);

```




* **確認コマンド / 方法**:
1. サーバー起動: `npm run dev` (または `npx tsx index.ts`)
2. curl コマンドまたは API クライアント等で疎通テスト。
```bash
curl -X GET http://localhost:3000/api/todo/v1/todos
curl -X GET http://localhost:3000/api/db-check

```




* **期待結果**:
* `GET /api/todo/v1/todos` → `{"data":[]}` (ステータス 200)
* 既存の `GET /api/db-check` および `/` が従来通り正常に応答すること。


* **失敗時に最初に見る場所**: `index.ts` の `app.use` の記述位置（既存ミドルウェアより後に置いていないか等）、ルーティングのパス指定。

---

### STEP 5: View層（EJS）と Client JS（TodoApi）の実装

* **目的**: ブラウザから操作できる画面および `TodoApi` クラスを実装する。
* **対象ファイル**:
* `views/todo/index.ejs`（新規作成）
* `public/todo/todo.js`（新規作成）


* **作業内容**:
1. `public/todo/todo.js` に `TodoApi` クラス（Fetch呼び出し処理）およびDOM操作・フォーム送信ハンドラーを実装する。
2. `views/todo/index.ejs` にフォーム・タスク一覧エリアを記述し、`<script src="/todo/todo.js"></script>` を読み込む。
3. 静的ファイル配信（`app.use(express.static('public'))`）が機能しているか確認する。


* **確認コマンド / 方法**:
* ブラウザで `http://localhost:3000/todo` にアクセスする。


* **期待結果**: Todo管理画面が正しくレンダリングされ、ブラウザのデベロッパーツール（Console）にエラーが出ていないこと。
* **失敗時に最初に見る場所**: `views/todo/index.ejs` のレンダリングパス、`public` フォルダの静的ファイルルーティング設定。

---

### STEP 6: 全体動作検証とエラーハンドリングの確認

* **目的**: 要件定義（`01_requirements.md`）を満たしているか全パターンの結合テストを行う。
* **対象ファイル**:
* プロジェクト全体


* **作業内容**:
* 画面上から登録・一覧更新・完了トグル・削除をテストする。
* 異常値テストを実施する。
* 0文字（空白のみ）で登録 → 422エラーメッセージ表示
* 101文字以上で登録 → 422エラーメッセージ表示




* **確認コマンド / 方法**:
* 画面UIからの操作およびブラウザ Network タブでHTTPレスポンスコード（200, 201, 204, 422等）を確認する。


* **期待結果**: 全要件（REQ-01〜REQ-04）がエラーなく動作すること。
* **失敗時に最初に見る場所**: `public/todo/todo.js` の `_handleResponse` や `todoController.ts` のバリデーション分岐。