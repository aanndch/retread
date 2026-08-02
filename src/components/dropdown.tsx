import { useState, useRef, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  class?: string;
}

export function Dropdown({ options, value, onChange, class: className = '' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, options.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        onChange(options[activeIndex].value);
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeIndex, options, onChange]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleToggle = () => {
    setIsOpen(o => !o);
    if (!isOpen) {
      const idx = options.findIndex(o => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  };

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div class={`dropdown ${className}`} ref={containerRef}>
      <button
        type="button"
        class="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedLabel}</span>
        <span class={`dropdown-arrow${isOpen ? ' open' : ''}`}>▾</span>
      </button>
      {isOpen && (
        <div class="dropdown-menu" role="listbox" ref={listRef}>
          {options.map((opt, i) => (
            <div
              key={opt.value}
              class={`dropdown-option${opt.value === value ? ' selected' : ''}${i === activeIndex ? ' active' : ''}`}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => handleSelect(opt.value)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
