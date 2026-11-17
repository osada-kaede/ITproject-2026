# TODOアプリ V1 実装手順書

## 1. 概要・進め方

本手順書は、`01_requirements.md`（REQ-01〜REQ-04）および `02_design.md` に基づき、既存の `index.ts`・`db.ts` を壊さずにTODOアプリ（V1）を段階的に実装・検証するための作業手順である。

---

## 2. 実装工程一覧

### 工程1: 作業ブランチの作成と既存サイトの確認
* **対象ファイル**: プロジェクト全体
* **作業内容**: `main` を最新化し、`feature/todo-app` ブランチを作成して既存機能が動作することを確認する。
* **確認コマンド**:
  ```bash
  git switch main && git pull origin main
  git switch -c feature/todo-app
  npm ci && npm run build && npm run dev
  ```
* **期待結果**: `http://localhost:3000/` と `http://localhost:3000/api/db-check` が正常に表示されること。
* **失敗時に最初に見る場所**: `.env` の `DATABASE_URL` 設定、Node.jsバージョン。

### 工程2: SQLファイルの保存（Git管理）
* **対象ファイル**: `sql/todo/020_create_todo_tasks.sql`（新規作成）
* **作業内容**: `02_design.md` に記載した `todo_tasks` テーブル作成SQLを保存する。
* **確認コマンド**: `git status`
* **期待結果**: `sql/todo/020_create_todo_tasks.sql` が新規ファイルとして認識されること。
* **失敗時に最初に見る場所**: ファイルパス・ファイル名のスペル。

### 工程3: Neon SQL Editorでの手動SQL実行と記録
* **対象ファイル**: Neon DB、`sql/README.md`（追記）
* **作業内容**: Neon SQL Editorで `DATABASE_URL` と同じブランチ・DBを選択して `020_create_todo_tasks.sql` を手動実行し、`sql/README.md` にファイル名・対象・実行日・結果を記録する（接続文字列は書かない）。
* **確認コマンド**: Neon SQL Editor上で `SELECT * FROM todo_tasks ORDER BY id;` を実行。
* **期待結果**: エラーなく実行でき、初回は0件が返ること。
* **失敗時に最初に見る場所**: Neon画面上部の選択ブランチ・DB名。

### 工程4: Model層と一覧・登録API（REQ-01, REQ-02）の実装
* **対象ファイル**: `src/apps/todo/todoModel.ts`, `src/apps/todo/todoController.ts`, `src/apps/todo/todoRouter.ts`, `index.ts`
* **作業内容**:
  * `todoModel.ts` に `findAll()`, `create(title)` と camelCase 変換を実装する。
  * `todoController.ts` に `list`, `create`（400/422バリデーション含む）を実装する。
  * `todoRouter.ts` を作成し、`index.ts` に `express.json()`、JSON構文エラーハンドラ、`/api/v1/todos` 登録を追加する。
* **確認コマンド**:
  ```bash
  npm run build && npm run dev
  curl.exe -i http://localhost:3000/api/v1/todos
  ```
* **期待結果**: `GET /api/v1/todos` が `200` で `{"status":"success","data":[]}` を返し、`POST` で `201`、不正入力で `400` / `422` が返ること。
* **失敗時に最初に見る場所**: `db.ts` の import パス（`../../../db`）、`index.ts` の `express.json()` 配置順。

### 工程5: 部分更新・削除API（REQ-03, REQ-04）の実装
* **対象ファイル**: `src/apps/todo/todoModel.ts`, `src/apps/todo/todoController.ts`, `src/apps/todo/todoRouter.ts`
* **作業内容**: `updateCompleted(id, isCompleted)` と `deleteById(id)` を実装し、`PATCH /:id` と `DELETE /:id` を接続する。
* **確認コマンド**: ブラウザのDevTools Consoleまたは `curl.exe -i` で `PATCH` と `DELETE` を送信する。
* **期待結果**: `PATCH` は `200` で更新後のTODOを返し、`DELETE` は `204`（本文なし）を返すこと。存在しないIDは `404`、不正IDは `400` が返ること。
* **失敗時に最初に見る場所**: IDの正整数チェック、`DELETE` 時の `rowCount` 判定。

### 工程6: TodoApiと画面（`/todo`）の実装
* **対象ファイル**: `public/todo/todo.js`, `views/todo/index.ejs`, `index.ts`
* **作業内容**:
  * `public/todo/todo.js` に `TodoApi` クラス（`list`, `create`, `update`, `delete`）と画面イベント（`textContent` 描画、エラー表示、0件表示）を実装する。
  * `views/todo/index.ejs` を作成し、`index.ts` に `GET /todo` ルートを追加する。
* **確認コマンド**:
  ```bash
  npm run build && npm start
  ```
  実行後、ブラウザで `http://localhost:3000/todo` を開いて登録・完了切替・削除・エラー表示を操作する。
* **期待結果**: 再読み込みなしでCRUD操作が反映され、0件時に「TODOがありません」と表示されること。
* **失敗時に最初に見る場所**: ブラウザDevToolsのConsoleおよびNetworkタブのステータスコード・レスポンス。

### 工程7: 3環境テスト（Local / Preview / Production）と提出
* **対象ファイル**: `docs/todo/04_test_results.md`
* **作業内容**:
  1. Local環境で全項目をテストして `04_test_results.md` に記録する。
  2. `.env` や秘密情報が含まれないことを `git status` で確認し、`feature/todo-app` をpushしてPull Requestを作成する。
  3. Vercel Preview環境でテストし、PRと `04_test_results.md` に結果を記録する。
  4. `main` へマージ後、Production環境でもテストして `04_test_results.md` を更新・pushする。
* **期待結果**: 3環境すべてでREQ-01〜REQ-04および既存ルートが正常動作し、提出物が揃っていること。
* **失敗時に最初に見る場所**: VercelのDeployment Logsおよび環境変数 `DATABASE_URL` の設定。