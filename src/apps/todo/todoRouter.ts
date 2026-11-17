import { Router } from 'express';
import { todoController } from './todoController';

export const todoRouter = Router();

todoRouter.get('/', todoController.list);
todoRouter.post('/', todoController.create);
todoRouter.patch('/:id', todoController.update);
todoRouter.delete('/:id', todoController.remove);