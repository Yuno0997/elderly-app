import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { cn } from './ui/utils';

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

function loadTodos(storageKey: string): TodoItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTodos(storageKey: string, todos: TodoItem[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(todos));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function TodoList({
  title = 'To-do List',
  storageKey = 'safealert_admin_todos_v1',
  suggestions = [],
}: {
  title?: string;
  storageKey?: string;
  suggestions?: Array<{ id: string; text: string }>;
}) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    setTodos(loadTodos(storageKey));
  }, [storageKey]);

  useEffect(() => {
    saveTodos(storageKey, todos);
  }, [storageKey, todos]);

  const visibleTodos = useMemo(() => {
    return [...todos].sort((a, b) => Number(a.done) - Number(b.done));
  }, [todos]);

  const addTodo = (t: string) => {
    const trimmed = t.trim();
    if (!trimmed) return;
    const item: TodoItem = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setTodos((prev) => [item, ...prev]);
    setText('');
  };

  const toggle = (id: string) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: string) => setTodos((prev) => prev.filter((t) => t.id !== id));

  const addSuggestion = (s: { id: string; text: string }) => {
    const exists = todos.some((t) => t.text.trim().toLowerCase() === s.text.trim().toLowerCase());
    if (!exists) addTodo(s.text);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <div className="text-xs text-slate-500">{todos.filter((t) => !t.done).length} open</div>
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTodo(text);
          }}
          placeholder="Add a task…"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => addTodo(text)}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
          aria-label="Add task"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addSuggestion(s)}
              className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
              title="Add to list"
            >
              + {s.text}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {visibleTodos.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-6">No tasks yet.</div>
        ) : (
          visibleTodos.map((t) => (
            <div key={t.id} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0',
                  t.done ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-transparent'
                )}
                aria-label={t.done ? 'Mark as not done' : 'Mark as done'}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className={cn('text-sm', t.done ? 'text-slate-400 line-through' : 'text-slate-700')}>
                  {t.text}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

