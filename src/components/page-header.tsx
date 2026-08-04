import { Button } from './button';
import { ArrowLeft, EditIcon, TrashIcon } from './icons';

interface PageHeaderProps {
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}

export function PageHeader({
  onBack,
  onEdit,
  onDelete,
  disabled = false,
}: PageHeaderProps) {
  return (
    <header class="page-header">
      <Button
        variant="icon"
        aria-label="Back"
        onClick={onBack}
        disabled={disabled}
      >
        <ArrowLeft size={14} />
      </Button>
      <div class="page-header-spacer" />
      {onEdit && (
        <Button
          variant="icon"
          aria-label="Edit"
          onClick={onEdit}
          disabled={disabled}
        >
          <EditIcon size={14} />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="icon"
          class="btn-danger-text btn-icon-text"
          aria-label="Delete"
          onClick={onDelete}
          disabled={disabled}
        >
          <TrashIcon size={14} />
        </Button>
      )}
    </header>
  );
}
