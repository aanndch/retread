import { PageHeader } from '../components/page-header';
import { TODO_SECTIONS } from '../todo-list';

interface TodoProps {
  onNavigateBack: (logicalParent: string | null) => void;
}

// Read-only changelog/roadmap: shows shipped features, fixed bugs and planned
// ideas as a checklist. Nothing here is interactive — status lives in
// src/todo-list.ts.
export function Todo({ onNavigateBack }: TodoProps) {
  return (
    <div class="todo-container">
      <PageHeader onBack={() => onNavigateBack('#/')} />

      <main class="todo-body">
        <h2 class="page-heading">Build Log</h2>
        <p class="todo-sub">Shipped features, squashed bugs, and what's next for Retread.</p>

        {TODO_SECTIONS.map((section) => (
          <section class={`todo-section todo-section--${section.kind || 'planned'}`} key={section.id}>
            <h3 class="todo-section-label">
              {section.label}
              <span class="todo-count">{section.items.length}</span>
            </h3>
            {section.description && <p class="todo-section-desc">{section.description}</p>}
            <ul class="todo-list">
              {section.items.map((item) => (
                <li class={`todo-item${item.status === 'done' ? ' is-done' : ''}`} key={item.id}>
                  <span class="todo-check" aria-hidden="true">
                    {item.status === 'done' ? '×' : ''}
                  </span>
                  <span class="todo-text">
                    <span class="todo-title-row">
                      {item.badge && <span class="todo-badge">{item.badge}</span>}
                      <span class="todo-title">{item.title}</span>
                    </span>
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
