import { Button } from './button';
import { ArrowLeft } from './icons';
import type { JSX } from 'preact';

interface PageHeaderProps {
  title: string | JSX.Element;
  onBack: () => void;
  subTitle?: string | JSX.Element;
  classType?: 'detail' | 'editor' | 'backup';
  actions?: JSX.Element;
  disabled?: boolean;
}

export function PageHeader({
  title,
  onBack,
  subTitle,
  classType = 'detail',
  actions,
  disabled = false,
}: PageHeaderProps) {
  const headerClass = `${classType}-header`;
  return (
    <header class={headerClass}>
      <Button
        variant="icon"
        aria-label="Back"
        onClick={onBack}
        disabled={disabled}
      >
        <ArrowLeft />
      </Button>
      <div class="header-titles">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
        {subTitle && (
          typeof subTitle === 'string' ? (
            <span class="trip-dates-sub">{subTitle}</span>
          ) : subTitle
        )}
      </div>
      {actions && (
        <div class="header-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--spacing-xs)' }}>
          {actions}
        </div>
      )}
    </header>
  );
}
