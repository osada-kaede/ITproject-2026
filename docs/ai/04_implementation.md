# AI質問機能 実装手順書 (`04_implementation.md`)

## 1. 文書情報・目的

* **関連文書**:
  * `01_request.md`（AI質問機能 追加要望書）
  * `docs/ai/02_requirements.md`（AI質問機能 要件定義書）
  * `docs/ai/03_design.md`（AI質問機能 詳細設計書）
* **目的**: 詳細設計書に基づき、パッケージ追加・環境変数設定から各ソースファイル（Service / Controller / Router / View / Client JS / サーバー統合）の実装手順および実装コード仕様を定める。

---

## 2. 事前準備（パッケージ・環境変数）

### 2.1. 依存パッケージのインストール

プロジェクトルートにて Google Gen AI SDK をインストールする。

```bash
npm install @google/genai
```

### 2.2. 環境変数の設定

`.env`（およびテンプレート用の `.env.example`）に以下の環境変数を追加する。

```env
# Gemini AI 設定
AI_API_KEY=your_gemini_api_key_here
AI_MODEL=gemini-2.5-flash
```

※ `.env` が `.gitignore` に含まれており、Git リポジトリにコミットされないことを必ず確認する。

---

## 3. 実装ステップ・コード仕様

以下の順序でファイルを作成・編集する（依存関係の末端である Service 層から順に積み上げる）。

### Step 1: サービス層の実装 (`src/apps/ai/aiService.ts`)

Gemini API との通信および例外の分類を担当するモジュールを作成する。

```typescript
import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 30_000;
const SYSTEM_INSTRUCTION =
  'あなたは親切で優秀なAIアシスタントです。ユーザーの質問に対して、日本語で分かりやすく、簡潔かつ正確に回答してください。';

export interface AiAnswerResult {
  answer: string;
  model: string;
}

export class AiServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AiService {
  private getApiKey(): string {
    const apiKey = (process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      throw new AiServiceError(
        500,
        'CONFIG_ERROR',
        'サーバー側のAI設定に問題が発生しています。管理者に連絡してください。'
      );
    }
    return apiKey;
  }

  private getModelName(): string {
    return (process.env.AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  public async generateAnswer(question: string): Promise<AiAnswerResult> {
    const apiKey = this.getApiKey();
    const model = this.getModelName();
    const ai = new GoogleGenAI({ apiKey });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: question,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          abortSignal: controller.signal,
        },
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') {
        throw new AiServiceError(
          400,
          'SAFETY_BLOCKED',
          '回答を生成できませんでした。質問内容を変えて再度お試しください。'
        );
      }

      const answerText = response.text?.trim();
      if (!answerText) {
        throw new AiServiceError(
          502,
          'AI_PROVIDER_ERROR',
          'AIから有効な回答を取得できませんでした。時間をおいて再度お試しください。'
        );
      }

      return {
        answer: answerText,
        model,
      };
    } catch (error: unknown) {
      if (error instanceof AiServiceError) {
        throw error;
      }

      const errObj = error as { name?: string; status?: number; message?: string };

      if (errObj?.name === 'AbortError') {
        console.error('[AiService] Gemini API request timed out.');
        throw new AiServiceError(
          504,
          'AI_TIMEOUT',
          'AIからの応答がタイムアウトしました。時間をおいて再度お試しください。'
        );
      }

      if (errObj?.status === 429) {
        console.error('[AiService] Gemini API rate limit exceeded (429).');
        throw new AiServiceError(
          429,
          'RATE_LIMIT_EXCEEDED',
          '現在リクエストが集中しています。しばらく待ってから再度お試しください。'
        );
      }

      if (errObj?.status === 401 || errObj?.status === 403) {
        console.error(`[AiService] Gemini API authentication/permission error (${errObj.status}).`);
        throw new AiServiceError(
          500,
          'CONFIG_ERROR',
          'サーバー側のAI認証設定に問題が発生しています。管理者に連絡してください。'
        );
      }

      console.error('[AiService] Unexpected Gemini API error:', errObj?.message || error);
      throw new AiServiceError(
        502,
        'AI_PROVIDER_ERROR',
        'AIサービスとの通信中にエラーが発生しました。時間をおいて再度お試しください。'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const aiService = new AiService();
```

---

### Step 2: コントローラー層の実装 (`src/apps/ai/aiController.ts`)

HTTP リクエストの検証とレスポンス制御を担当するモジュールを作成する。

```typescript
import { Request, Response, NextFunction } from 'express';
import { aiService, AiServiceError } from './aiService';

export const MAX_QUESTION_LENGTH = 2000;

export const renderIndex = (req: Request, res: Response, next: NextFunction): void => {
  try {
    res.render('ai/index', {
      title: 'AI質問アシスタント',
      maxLength: MAX_QUESTION_LENGTH,
    });
  } catch (error) {
    next(error);
  }
};

export const askQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawQuestion = req.body?.question;

    if (typeof rawQuestion !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '質問内容の形式が不正です。',
        },
      });
      return;
    }

    const trimmedQuestion = rawQuestion.trim();

    if (trimmedQuestion.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '質問内容を入力してください。',
        },
      });
      return;
    }

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `質問は${MAX_QUESTION_LENGTH}文字以内で入力してください。`,
        },
      });
      return;
    }

    const result = await aiService.generateAnswer(trimmedQuestion);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof AiServiceError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error('[AiController] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '予期せぬエラーが発生しました。',
      },
    });
  }
};
```

---

### Step 3: ルーター層の実装 (`src/apps/ai/aiRouter.ts`)

エンドポイントのマッピングを行うルーターを作成する。

```typescript
import express, { Router } from 'express';
import { renderIndex, askQuestion } from './aiController';

const aiRouter = Router();

aiRouter.get('/', renderIndex);
aiRouter.post('/ask', express.json(), askQuestion);

export default aiRouter;
```

---

### Step 4: ビューテンプレートの実装 (`views/ai/index.ejs`)

AI質問画面の EJS テンプレートを作成する。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= title %></title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f5f7fa;
      color: #333;
      margin: 0;
      padding: 20px;
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 24px 32px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      margin: 0;
      font-size: 1.5rem;
      color: #1f2937;
    }
    .nav-link {
      color: #2563eb;
      text-decoration: none;
      font-size: 0.9rem;
    }
    .nav-link:hover {
      text-decoration: underline;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
    .meta-bar {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: #6b7280;
      margin-top: 6px;
    }
    .char-limit-warn {
      color: #dc2626;
      font-weight: bold;
    }
    .button-group {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-primary {
      background-color: #2563eb;
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) {
      background-color: #1d4ed8;
    }
    .btn-secondary {
      background-color: #e5e7eb;
      color: #374151;
    }
    .btn-secondary:hover:not(:disabled) {
      background-color: #d1d5db;
    }
    .hidden {
      display: none !important;
    }
    .loading-box {
      margin-top: 20px;
      padding: 16px;
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      color: #1e40af;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .error-box {
      margin-top: 20px;
      padding: 14px 16px;
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      color: #b91c1c;
    }
    .result-section {
      margin-top: 28px;
      border-top: 1px solid #e5e7eb;
      padding-top: 20px;
    }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .result-header h2 {
      margin: 0;
      font-size: 1.15rem;
      color: #111827;
    }
    .answer-content {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.98rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><%= title %></h1>
      <a href="/" class="nav-link">← トップへ戻る</a>
    </div>

    <form id="ai-form" data-max-length="<%= maxLength %>">
      <div class="form-group">
        <label for="question-input">AIへの質問を入力してください</label>
        <textarea
          id="question-input"
          name="question"
          rows="5"
          maxlength="<%= maxLength %>"
          placeholder="例：TypeScriptのメリットを3つ簡潔に教えてください。"
          required
        ></textarea>
        <div class="meta-bar">
          <span>ヒント: Ctrl + Enter（Macは Cmd + Enter）で送信できます</span>
          <span><span id="char-count">0</span> / <%= maxLength %> 文字</span>
        </div>
      </div>

      <div class="button-group">
        <button type="submit" id="submit-btn" class="btn-primary">質問を送信する</button>
        <button type="button" id="clear-btn" class="btn-secondary">クリア</button>
      </div>
    </form>

    <div id="loading-indicator" class="loading-box hidden" aria-live="polite">
      <span>AIが回答を生成しています... しばらくお待ちください。</span>
    </div>

    <div id="error-box" class="error-box hidden" role="alert"></div>

    <section id="result-section" class="result-section hidden" aria-live="polite">
      <div class="result-header">
        <h2>AIからの回答</h2>
        <button type="button" id="copy-btn" class="btn-secondary">回答をコピー</button>
      </div>
      <div id="answer-content" class="answer-content"></div>
    </section>
  </div>

  <script src="/ai/ai.js" defer></script>
</body>
</html>
```

---

### Step 5: クライアントスクリプトの実装 (`public/ai/ai.js`)

非同期通信と画面描画制御を行うブラウザ用スクリプトを作成する。

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('ai-form');
  const questionInput = document.getElementById('question-input');
  const charCount = document.getElementById('char-count');
  const submitBtn = document.getElementById('submit-btn');
  const clearBtn = document.getElementById('clear-btn');
  const loadingIndicator = document.getElementById('loading-indicator');
  const errorBox = document.getElementById('error-box');
  const resultSection = document.getElementById('result-section');
  const answerContent = document.getElementById('answer-content');
  const copyBtn = document.getElementById('copy-btn');

  if (!form || !questionInput) return;

  const maxLength = Number(form.dataset.maxLength) || 2000;

  const updateCharCount = () => {
    const length = questionInput.value.length;
    charCount.textContent = String(length);
    if (length >= maxLength) {
      charCount.classList.add('char-limit-warn');
    } else {
      charCount.classList.remove('char-limit-warn');
    }
  };

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  };

  const hideError = () => {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  };

  const setLoading = (isLoading) => {
    submitBtn.disabled = isLoading;
    clearBtn.disabled = isLoading;
    questionInput.disabled = isLoading;
    if (isLoading) {
      loadingIndicator.classList.remove('hidden');
    } else {
      loadingIndicator.classList.add('hidden');
    }
  };

  questionInput.addEventListener('input', updateCharCount);

  questionInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!submitBtn.disabled) {
        form.requestSubmit();
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const trimmed = questionInput.value.trim();
    if (!trimmed) {
      showError('質問内容を入力してください。');
      questionInput.focus();
      return;
    }

    if (trimmed.length > maxLength) {
      showError(`質問は${maxLength}文字以内で入力してください。`);
      questionInput.focus();
      return;
    }

    setLoading(true);
    resultSection.classList.add('hidden');

    try {
      const response = await fetch('/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: trimmed }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        const errMsg =
          payload?.error?.message || '回答の取得に失敗しました。時間をおいて再度お試しください。';
        showError(errMsg);
        return;
      }

      // XSS防止のため textContent で安全に描画
      answerContent.textContent = payload.data.answer;
      resultSection.classList.remove('hidden');
    } catch (err) {
      console.error('Network or parsing error:', err);
      showError('サーバーとの通信に失敗しました。ネットワーク接続をご確認ください。');
    } finally {
      setLoading(false);
    }
  });

  clearBtn.addEventListener('click', () => {
    questionInput.value = '';
    updateCharCount();
    hideError();
    resultSection.classList.add('hidden');
    answerContent.textContent = '';
    questionInput.focus();
  });

  copyBtn.addEventListener('click', async () => {
    const text = answerContent.textContent;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const originalLabel = copyBtn.textContent;
      copyBtn.textContent = 'コピーしました！';
      setTimeout(() => {
        copyBtn.textContent = originalLabel;
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      showError('クリップボードへのコピーに失敗しました。');
    }
  });
});
```

---

### Step 6: サーバー統合 (`index.ts`)

既存の `index.ts` に `aiRouter` をインポートし、既存のルーティング定義（TODOルーター等）と同列にマウントする。  
※ **必ず 404 ハンドラーおよびグローバルエラーハンドラーよりも前の行**に配置すること。

```typescript
// 既存のルーターインポート付近に追加
import aiRouter from './src/apps/ai/aiRouter';

// ...（既存のミドルウェア・静的ファイル配信・TODOルーター設定）...

// AI質問機能のルーティングマウント（404ハンドラーより前に記述）
app.use('/ai', aiRouter);
```

---

## 4. 実装後のビルド・起動確認

1. TypeScript の型チェック・コンパイルエラーがないことを確認する。
   ```bash
   npx tsc --noEmit
   ```
2. 開発サーバーを起動し、コンソールに起動エラーが出ないことを確認する。
3. ブラウザで `http://localhost:<PORT>/ai` にアクセスし、画面が表示されることを確認する。