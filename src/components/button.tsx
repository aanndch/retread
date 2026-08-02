import type { ComponentChildren } from 'preact';

interface ButtonProps {
  children: ComponentChildren;
  onClick?: (e: any) => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'fab' | 'icon';
  size?: 'sm' | 'md';
  disabled?: boolean;
  class?: string;
  style?: any;
  id?: string;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  size = 'md',
  disabled = false,
  class: className = '',
  style,
  id
}: ButtonProps) {
  let computedClass = '';
  
  if (variant === 'fab') {
    computedClass = 'btn-fab';
  } else if (variant === 'icon') {
    computedClass = 'btn-icon';
  } else {
    computedClass = `btn btn-${variant}`;
    if (size === 'sm') {
      computedClass += ' btn-sm';
    }
  }

  const finalClass = `${computedClass} ${className}`.trim();

  return (
    <button
      type={type}
      class={finalClass}
      onClick={onClick}
      disabled={disabled}
      style={style}
      id={id}
    >
      {children}
    </button>
  );
}
