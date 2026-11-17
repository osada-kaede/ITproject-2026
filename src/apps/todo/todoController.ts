import { Request, Response } from 'express';
import { todoModel } from './todoModel';

// 統一エラーレスポンスを返すヘルパー
function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({
    status: 'error',
    code,
    message,
    details: [],
  });
}

// DB接続エラーか内部エラーかを判定して返す
function handleUnexpectedError(res: Response, error: unknown) {
  console.error('TODO APIエラー:', error);
  const errCode = (error as { code?: string })?.code;
  // PostgreSQLの接続系エラーコード（08xxx, 57P01など）やネットワークエラーは503
  if (
    typeof errCode === 'string' &&
    (errCode.startsWith('08') ||
      errCode === '57P01' ||
      errCode === 'ECONNREFUSED' ||
      errCode === 'ETIMEDOUT')
  ) {
    return sendError(res, 503, 'DB_UNAVAILABLE', 'データベースに接続できません');
  }
  return sendError(res, 500, 'INTERNAL_ERROR', 'サーバー内部エラーが発生しました');
}

// IDが1以上の整数かチェックする（不正ならnullを返す）
function parsePositiveIntId(rawId: unknown): number | null {
  if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
    return null;
  }
  const num = Number(rawId);
  return Number.isSafeInteger(num) ? num : null;
}

export const todoController = {
  // GET /api/v1/todos
  async list(_req: Request, res: Response) {
    try {
      const todos = await todoModel.findAll();
      return res.status(200).json({
        status: 'success',
        data: todos,
      });
    } catch (error) {
      return handleUnexpectedError(res, error);
    }
  },

  // POST /api/v1/todos
  async create(req: Request, res: Response) {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return sendError(res, 400, 'BAD_REQUEST', 'リクエスト本文のJSONが不正です');
      }

      const { title } = req.body;

      // titleの欠落・型違いは400
      if (title === undefined || title === null || typeof title !== 'string') {
        return sendError(res, 400, 'BAD_REQUEST', 'titleは文字列で指定してください');
      }

      // 空白だけ、または101文字以上は422
      const trimmed = title.trim();
      if (trimmed.length === 0 || title.length > 100) {
        return sendError(
          res,
          422,
          'VALIDATION_ERROR',
          'titleは前後の空白を除き1〜100文字で入力してください'
        );
      }

      const created = await todoModel.create(title);
      return res.status(201).json({
        status: 'success',
        data: created,
      });
    } catch (error) {
      return handleUnexpectedError(res, error);
    }
  },

  // PATCH /api/v1/todos/:id
  async update(req: Request, res: Response) {
    try {
      const id = parsePositiveIntId(req.params.id);
      if (id === null) {
        return sendError(res, 400, 'BAD_REQUEST', 'IDは1以上の整数で指定してください');
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return sendError(res, 400, 'BAD_REQUEST', 'リクエスト本文のJSONが不正です');
      }

      const { isCompleted } = req.body;
      if (typeof isCompleted !== 'boolean') {
        return sendError(
          res,
          400,
          'BAD_REQUEST',
          'isCompletedはboolean型（true/false）で指定してください'
        );
      }

      const updated = await todoModel.updateCompleted(id, isCompleted);
      if (!updated) {
        return sendError(res, 404, 'NOT_FOUND', '指定されたTODOが見つかりません');
      }

      return res.status(200).json({
        status: 'success',
        data: updated,
      });
    } catch (error) {
      return handleUnexpectedError(res, error);
    }
  },

  // DELETE /api/v1/todos/:id
  async remove(req: Request, res: Response) {
    try {
      const id = parsePositiveIntId(req.params.id);
      if (id === null) {
        return sendError(res, 400, 'BAD_REQUEST', 'IDは1以上の整数で指定してください');
      }

      const deleted = await todoModel.deleteById(id);
      if (!deleted) {
        return sendError(res, 404, 'NOT_FOUND', '指定されたTODOが見つかりません');
      }

      // 204は本文なしで返す
      return res.status(204).send();
    } catch (error) {
      return handleUnexpectedError(res, error);
    }
  },
};