import React from 'react';
import { CheckSquare } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface TodoItem {
  id?: string;
  content: string;
  status?: string;
  priority?: string;
}

interface TodoToolProps {
  todos: TodoItem[];
  result?: any;
}

export const TodoTool: React.FC<TodoToolProps> = ({ todos, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const copyValue = todos.map(t => `[${t.status ?? 'pending'}] ${t.content}`).join('\n');
  const summary = `${todos.length} item${todos.length !== 1 ? 's' : ''}`;

  return (
    <BaseTool
      icon={<CheckSquare className="h-3.5 w-3.5" />}
      iconColor="rgba(251, 191, 36, 0.8)"
      label="Todo"
      keyParam={summary}
      status={status}
      copyValue={copyValue}
    >
      <div className="space-y-0.5 p-1">
        {todos.map((todo, i) => (
          <div key={todo.id ?? i} className="flex items-start gap-2 text-xs px-1 py-0.5">
            <span className="text-muted-foreground shrink-0 mt-px">
              {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '○'}
            </span>
            <span className={todo.status === 'completed' ? 'line-through text-muted-foreground' : ''}>
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </BaseTool>
  );
};
