import { pool } from '../../../db';

export interface Todo {
  id: number;
  title: string;
  isCompleted: boolean;
  createdAt: string;
}

interface TodoRow {
  id: number;
  title: string;
  is_completed: boolean;
  created_at: Date | string;
}

// DBの行をAPIレスポンス用のJSON形式に変換する
function mapRowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    isCompleted: row.is_completed,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export const todoModel = {
  // 一覧取得
  async findAll(): Promise<Todo[]> {
    const result = await pool.query<TodoRow>(
      'SELECT id, title, is_completed, created_at FROM todo_tasks ORDER BY id'
    );
    return result.rows.map(mapRowToTodo);
  },

  // 新規登録
  async create(title: string): Promise<Todo> {
    const result = await pool.query<TodoRow>(
      `INSERT INTO todo_tasks (title)
       VALUES ($1)
       RETURNING id, title, is_completed, created_at`,
      [title]
    );
    return mapRowToTodo(result.rows[0]);
  },

  // 完了状態の部分更新
  async updateCompleted(id: number, isCompleted: boolean): Promise<Todo | null> {
    const result = await pool.query<TodoRow>(
      `UPDATE todo_tasks
       SET is_completed = $1
       WHERE id = $2
       RETURNING id, title, is_completed, created_at`,
      [isCompleted, id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToTodo(result.rows[0]);
  },

  // 削除
  async deleteById(id: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM todo_tasks WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};