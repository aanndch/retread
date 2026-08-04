import { PageHeader } from '../components/page-header';
import { TODO_SECTIONS } from '../todo-list';

interface TodoProps {
  onNavigateBack: (logicalParent: string | null) => void;
}

// Read-only changelog/roadmap: shows shipped features and fixed bugs as a
// checklist. Nothing here is interactive — status lives in src/todo-list.ts.
export function Todo({ onNavigateBack }: TodoProps) {
  return (
    <div class="todo-container">
      <PageHeader onBack={() => onNavigateBack('#/')} />

      <main class="todo-body">
        <h2 class="page-heading">Build Log</h2>
        <p class="todo-sub">Shipped features and squashed bugs for Retread.</p>

        {TODO_SECTIONS.map((section) => (
          <section class="todo-section" key={section.id}>
            <h3 class="todo-section-label">{section.label}</h3>
            <ul class="todo-list">
              {section.items.map((item) => (
                <li class={`todo-item${item.status === 'done' ? ' is-done' : ''}`} key={item.id}>
                  <span class="todo-check" aria-hidden="true">
                    {item.status === 'done' ? '×' : ''}
                  </span>
                  <span class="todo-text">
                    <span class="todo-title">{item.title}</span>
                    {item.note && <span class="todo-note">{item.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
