class TodoApi {
  constructor(baseUrl = '/api/v1/todos') {
    this.baseUrl = baseUrl;
  }

  // エラー応答を統一的に処理する
  async _handleResponse(res, expectNoContent = false) {
    if (expectNoContent && res.status === 204) {
      return;
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      if (!res.ok) {
        throw new Error(`通信エラーが発生しました (HTTP ${res.status})`);
      }
      return null;
    }

    if (!res.ok) {
      const code = body?.code ? `[${body.code}] ` : '';
      const message = body?.message || `エラーが発生しました (HTTP ${res.status})`;
      throw new Error(`${code}${message}`);
    }

    return body.data;
  }

  // 一覧取得: GET /api/v1/todos
  async list() {
    const res = await fetch(this.baseUrl);
    return await this._handleResponse(res);
  }

  // 新規登録: POST /api/v1/todos
  async create(title) {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return await this._handleResponse(res);
  }

  // 完了状態の部分更新: PATCH /api/v1/todos/:id
  async update(id, isCompleted) {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
    return await this._handleResponse(res);
  }

  // 削除: DELETE /api/v1/todos/:id（204のためJSON解析しない）
  async delete(id) {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
    });
    await this._handleResponse(res, true);
  }
}

// 画面の初期化とイベント制御
document.addEventListener('DOMContentLoaded', () => {
  const api = new TodoApi();

  const form = document.getElementById('todo-form');
  const titleInput = document.getElementById('todo-title');
  const submitBtn = document.getElementById('todo-submit');
  const statusArea = document.getElementById('status-area');
  const errorArea = document.getElementById('error-area');
  const emptyMessage = document.getElementById('empty-message');
  const todoList = document.getElementById('todo-list');

  function setLoading(isLoading, message = '読み込み中...') {
    statusArea.textContent = isLoading ? message : '';
    submitBtn.disabled = isLoading;
  }

  function showError(message) {
    errorArea.textContent = message;
    errorArea.style.display = message ? 'block' : 'none';
  }

  // TODO一覧を画面に描画する（XSS対策のため必ずtextContentを使用）
  function renderTodos(todos) {
    todoList.innerHTML = '';

    if (!todos || todos.length === 0) {
      emptyMessage.style.display = 'block';
      return;
    }

    emptyMessage.style.display = 'none';

    todos.forEach((todo) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '10px';
      li.style.padding = '8px 0';
      li.style.borderBottom = '1px solid #ddd';

      // 完了チェックボックス
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.isCompleted;
      checkbox.addEventListener('change', async () => {
        showError('');
        setLoading(true, '更新中...');
        try {
          await api.update(todo.id, checkbox.checked);
          await loadTodos();
        } catch (err) {
          checkbox.checked = !checkbox.checked;
          showError(err.message);
          setLoading(false);
        }
      });

      // タイトル表示
      const span = document.createElement('span');
      span.textContent = todo.title;
      span.style.flex = '1';
      if (todo.isCompleted) {
        span.style.textDecoration = 'line-through';
        span.style.color = '#888';
      }

      // 削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = '削除';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.addEventListener('click', async () => {
        showError('');
        setLoading(true, '削除中...');
        try {
          await api.delete(todo.id);
          await loadTodos();
        } catch (err) {
          showError(err.message);
          setLoading(false);
        }
      });

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(deleteBtn);
      todoList.appendChild(li);
    });
  }

  // 一覧の再取得
  async function loadTodos() {
    setLoading(true, '読み込み中...');
    try {
      const todos = await api.list();
      renderTodos(todos);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // 新規登録フォーム送信
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    setLoading(true, '登録中...');

    try {
      await api.create(titleInput.value);
      titleInput.value = '';
      await loadTodos();
    } catch (err) {
      showError(err.message);
      setLoading(false);
    }
  });

  // 初回読み込み
  loadTodos();
});