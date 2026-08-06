import { useState } from 'preact/hooks';
import { PageHeader } from '../components/page-header';
import { TODO_SECTIONS } from '../todo-list';

interface TodoProps {
  onNavigateBack: (logicalParent: string | null) => void;
}

type TodoTab = 'new' | 'roadmap';

// Read-only changelog/roadmap: "What's New" shows shipped features and fixed
// bugs; "Roadmap" holds planned ideas. Nothing here is interactive — status
// lives in src/todo-list.ts.
export function Todo({ onNavigateBack }: TodoProps) {
  const [tab, setTab] = useState<TodoTab>('new');
  const sections = TODO_SECTIONS.filter((s) =>
    tab === 'roadmap' ? s.kind === 'planned' : s.kind === 'shipped'
  );

  return (
    <div class="todo-container">
      <PageHeader onBack={() => onNavigateBack('#/')} />

      <main class="todo-body">
        <h2 class="page-heading">What's New</h2>
        <p class="todo-sub">Shipped features and squashed bugs — the latest on Retread.</p>

        <nav class="todo-tabs" aria-label="Build log sections">
          <button
            type="button"
            class={tab === 'new' ? 'active' : ''}
            aria-current={tab === 'new' ? 'page' : undefined}
            onClick={() => setTab('new')}
          >
            What's New
          </button>
          <button
            type="button"
            class={tab === 'roadmap' ? 'active' : ''}
            aria-current={tab === 'roadmap' ? 'page' : undefined}
            onClick={() => setTab('roadmap')}
          >
            Roadmap
          </button>
        </nav>

        {sections.map((section) => (
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
