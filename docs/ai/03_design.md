# AI質問機能 詳細設計書 (`03_design.md`)

## 1. 文書情報・目的

* **関連文書**:
  * `01_request.md`（AI質問機能 追加要望書）
  * `docs/ai/02_requirements.md`（AI質問機能 要件定義書）
* **目的**: 要件定義書で確定した仕様に基づき、ディレクトリ構成、モジュール間インターフェース、API仕様、例外ハンドリング、およびフロントエンドの画面・スクリプト設計を定義する。

---

## 2. アーキテクチャ・ディレクトリ構成

既存の `src/apps/todo/` のレイヤー構造（Router / Controller / Service）を踏襲し、以下のファイル構成で新規作成および既存ファイルへのマウントを行う。

```text
project-root/
├── index.ts                     # [修正] app.use('/ai', aiRouter) の追加
├── public/
│   └── ai/
│       └── ai.js                # [新規] フロントエンド非同期通信・UI制御スクリプト
├── src/
│   └── apps/
│       └── ai/
│           ├── aiRouter.ts      # [新規] ルーティング定義
│           ├── aiController.ts  # [新規] リクエスト検証・レスポンス制御
│           └── aiService.ts     # [新規] Gemini API 連携・エラー変換
└── views/
    └── ai/
        └── index.ejs            # [新規] AI質問画面テンプレート
```

### 2.1. レイヤー間の責務と依存関係

```text
[Client (ai.js)]
      │  HTTP (GET /ai, POST /ai/ask)
      ▼
[aiRouter.ts]       : URLパスとHTTPメソッドのマッピング・JSONパーサー適用
      │
      ▼
[aiController.ts]   : 入力バリデーション、HTTPステータス決定、JSON/EJSレスポンス生成
      │
      ▼
[aiService.ts]      : @google/genai SDK 呼び出し、システムプロンプト付与、APIエラー分類
      │
      ▼
[Google Gemini API] : 外部LLMサービス
```

---

## 3. API・ルーティング設計

### 3.1. エンドポイント一覧

| メソッド | パス | コントローラー処理 | 概要 |
| :--- | :--- | :--- | :--- |
| `GET` | `/ai` | `aiController.renderIndex` | AI質問画面（`views/ai/index.ejs`）のHTMLを返却する |
| `POST` | `/ai/ask` | `aiController.askQuestion` | 質問テキストを受け取り、Gemini APIの回答をJSONで返却する |

### 3.2. `GET /ai`（画面初期表示）

* **リクエスト**: パラメータなし
* **レスポンス**: `200 OK` (`text/html`)
  * `views/ai/index.ejs` をレンダリングして返却する。
  * テンプレートへ渡すデータ:
    ```json
    {
      "title": "AI質問アシスタント",
      "maxLength": 2000
    }
    ```

### 3.3. `POST /ai/ask`（AI質問送信API）

#### リクエスト仕様
* **Headers**: `Content-Type: application/json`
* **Body (JSON)**:
  ```json
  {
    "question": "TypeScriptのインターフェースと型エイリアスの違いを教えてください。"
  }
  ```

#### レスポンス仕様（正常系: `200 OK`）
* **Headers**: `Content-Type: application/json`
* **Body (JSON)**:
  ```json
  {
    "success": true,
    "data": {
      "answer": "TypeScriptにおけるinterfaceとtype（型エイリアス）の主な違いは以下の通りです...",
      "model": "gemini-2.5-flash"
    }
  }
  ```

#### レスポンス仕様（異常系: `4xx` / `5xx`）
* **Headers**: `Content-Type: application/json`
* **Body (JSON)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "質問内容を入力してください。"
    }
  }
  ```

#### エラーコード・HTTPステータス一覧

| HTTPステータス | エラーコード (`error.code`) | 発生条件 | ユーザー向けメッセージ例 (`error.message`) |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | 未入力、型不正、空白のみ、`2,000`文字超過 | `質問内容を入力してください。` / `質問は2000文字以内で入力してください。` |
| `400 Bad Request` | `SAFETY_BLOCKED` | Gemini APIの安全性フィルタによるブロック | `回答を生成できませんでした。質問内容を変えて再度お試しください。` |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Gemini APIのレート制限超過（429） | `現在リクエストが集中しています。しばらく待ってから再度お試しください。` |
| `504 Gateway Timeout` | `AI_TIMEOUT` | Gemini API応答が規定時間（30秒）を超過 | `AIからの応答がタイムアウトしました。時間をおいて再度お試しください。` |
| `502 Bad Gateway` | `AI_PROVIDER_ERROR` | Gemini API側の5xxエラーやネットワーク通信障害 | `AIサービスとの通信中にエラーが発生しました。時間をおいて再度お試しください。` |
| `500 Internal Server Error` | `CONFIG_ERROR` | `AI_API_KEY` 未設定・認証エラー等 | `サーバー側のAI設定に問題が発生しています。管理者に連絡してください。` |
| `500 Internal Server Error` | `INTERNAL_ERROR` | 上記以外の予期せぬサーバーエラー | `予期せぬエラーが発生しました。` |

---

## 4. バックエンド詳細設計

### 4.1. `src/apps/ai/aiRouter.ts`
* `express.Router()` を生成し、ルートを定義する。
* 既存の `index.ts` でグローバルに `express.json()` が有効化されていないケースにも安全に対応できるよう、ルーターレベルまたは `POST /ask` に対して `express.json()` ミドルウェアを適用する。
* **定義ルート**:
  * `router.get('/', renderIndex);`
  * `router.post('/ask', express.json(), askQuestion);`

### 4.2. `src/apps/ai/aiService.ts`
* **定数・設定**:
  * `DEFAULT_MODEL = 'gemini-2.5-flash'`
  * `TIMEOUT_MS = 30000`（30秒）
  * `SYSTEM_INSTRUCTION = 'あなたは親切で優秀なAIアシスタントです。ユーザーの質問に対して、日本語で分かりやすく、簡潔かつ正確に回答してください。'`
* **カスタムエラークラス (`AiServiceError`)**:
  * `statusCode: number`、`code: string`、`message: string` を保持し、Controller 層で HTTP レスポンスへ一意に変換できるようにする。
* **主要メソッド**:
  * `generateAnswer(question: string): Promise<{ answer: string; model: string }>`
    1. 環境変数 `process.env.AI_API_KEY || process.env.GEMINI_API_KEY` を取得。未設定の場合は `AiServiceError(500, 'CONFIG_ERROR', ...)` をスロー。
    2. `new GoogleGenAI({ apiKey })` でクライアントを初期化。
    3. `AbortController` を用いて `30,000ms` のタイムアウト制御を設定。
    4. `ai.models.generateContent({ model, contents: question, config: { systemInstruction: SYSTEM_INSTRUCTION, abortSignal } })` を呼び出し。
    5. レスポンスの `finishReason` が `'SAFETY'` 等でテキストが空の場合は `AiServiceError(400, 'SAFETY_BLOCKED', ...)` をスロー。
    6. SDK からスローされた例外（ステータスコード `429`、`401/403`、`5xx`、`AbortError` 等）を判定し、適切な `AiServiceError` にラップして再スローする（サーバーログには機密情報を除いたエラー詳細を `console.error` で出力）。

### 4.3. `src/apps/ai/aiController.ts`
* **定数**: `MAX_QUESTION_LENGTH = 2000`
* **`renderIndex(req: Request, res: Response, next: NextFunction)`**:
  * `res.render('ai/index', { title: 'AI質問アシスタント', maxLength: MAX_QUESTION_LENGTH })` を実行。例外時は `next(err)` へ委譲。
* **`askQuestion(req: Request, res: Response, next: NextFunction)`**:
  1. `req.body?.question` を取得。
  2. バリデーションチェック:
     * `typeof question !== 'string'` または `question.trim().length === 0` → `400 VALIDATION_ERROR`（「質問内容を入力してください。」）を返却。
     * `question.trim().length > MAX_QUESTION_LENGTH` → `400 VALIDATION_ERROR`（「質問は2000文字以内で入力してください。」）を返却。
  3. `aiService.generateAnswer(question.trim())` を呼び出し。
  4. 成功時: `res.status(200).json({ success: true, data: result })` を返却。
  5. 例外捕捉時:
     * `err instanceof AiServiceError` の場合: `res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } })` を返却。
     * それ以外の予期せぬエラー（かつJSON APIリクエスト）の場合: `console.error` に記録の上、`500 INTERNAL_ERROR` の JSON を返却（APIクライアントにHTMLのエラーページが返るのを防止）。

---

## 5. フロントエンド詳細設計

### 5.1. 画面テンプレート (`views/ai/index.ejs`)
* 既存のスタイルと調和するシンプルで視認性の高いレイアウトを採用する。
* **主なDOM要素とID設計**:
  * `#ai-form`: 質問送信フォーム
  * `#question-input`: 質問入力 `<textarea>`（`maxlength="2000"`、`rows="5"`、プレースホルダー付き）
  * `#char-count`: 現在の文字数表示 `<span>`（初期値 `0`）
  * `#submit-btn`: 送信ボタン（`type="submit"`）
  * `#clear-btn`: クリアボタン（`type="button"`）
  * `#loading-indicator`: ローディング表示エリア（初期状態 `hidden`）
  * `#error-box`: エラーメッセージ表示エリア（初期状態 `hidden`、`role="alert"`）
  * `#result-section`: 回答結果表示セクション（初期状態 `hidden`）
  * `#answer-content`: AIの回答テキスト描画領域（`white-space: pre-wrap;` で改行・インデントを保持）
  * `#copy-btn`: 回答コピーボタン（`type="button"`）
  * `<script src="/ai/ai.js" defer></script>` の読み込み

### 5.2. クライアントスクリプト (`public/ai/ai.js`)
* **イベント処理フロー**:
  1. **文字数カウント (`input` イベント)**:
     * `#question-input` の入力文字数をリアルタイムで `#char-count` に反映する。上限付近・超過時は文字色を変更して視覚的に通知する。
  2. **キーボードショートカット (`keydown` イベント)**:
     * `Ctrl + Enter` または `Cmd + Enter` でフォーム送信を実行し、UXを向上させる。
  3. **送信処理 (`submit` イベント)**:
     * `e.preventDefault()` でデフォルトのページ遷移を抑止。
     * クライアント側事前バリデーション（空文字チェック・2000文字超過チェック）。不備があれば `#error-box` を表示して中断。
     * UIを「送信中状態」へ切り替え（`#submit-btn` と `#question-input` を `disabled`、`#loading-indicator` を表示、`#error-box` を非表示）。
     * `fetch('/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })` を実行。
     * レスポンスJSONの `success` が `true` の場合:
       * `#answer-content.textContent = data.answer` で安全に描画（XSS防止）し、`#result-section` を表示。
     * `success` が `false` またはネットワークエラーの場合:
       * `#error-box.textContent = error.message` を設定して表示。
     * `finally` ブロックで必ず「送信中状態」を解除（ボタン・入力欄を再有効化、ローディング非表示）。
  4. **クリア処理 (`#clear-btn` クリック)**:
     * 入力欄、文字数カウント、エラー表示、回答表示をすべて初期状態にリセットする。
  5. **コピー処理 (`#copy-btn` クリック)**:
     * `navigator.clipboard.writeText(answerContent.textContent)` を実行し、ボタンラベルを一時的に「コピーしました！」に変更する。