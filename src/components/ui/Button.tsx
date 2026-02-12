'use client';

import React, { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================
// Button Component
// Primary interactive element with micro-animations
// ============================================

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-brand-500 text-white
    hover:bg-brand-400 active:bg-brand-600
    shadow-lg shadow-brand-500/20
    disabled:bg-brand-500/50
  `,
  secondary: `
    bg-surface-50 text-gray-200 border border-glass-border
    hover:bg-surface-100 hover:border-glass-hover
    disabled:bg-surface-100/50 disabled:text-gray-500
  `,
  ghost: `
    text-gray-400 bg-transparent
    hover:text-white hover:bg-white/5
    disabled:text-gray-600
  `,
  danger: `
    bg-red-500/10 text-red-400 border border-red-500/20
    hover:bg-red-500/20 hover:border-red-500/30
    disabled:bg-red-500/5 disabled:text-red-400/50
  `,
  success: `
    bg-green-500/10 text-green-400 border border-green-500/20
    hover:bg-green-500/20 hover:border-green-500/30
    disabled:bg-green-500/5 disabled:text-green-400/50
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    
    return (
      <motion.button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'transition-colors duration-200',
          'disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={isDisabled}
        whileHover={!isDisabled ? { scale: 1.01 } : undefined}
        whileTap={!isDisabled ? { scale: 0.98 } : undefined}
        transition={{ duration: 0.15 }}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <motion.svg
            className="w-4 h-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </motion.svg>
        )}
        
        {/* Left icon */}
        {!loading && icon && iconPosition === 'left' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
        
        {/* Button text */}
        {children && <span>{children as React.ReactNode}</span>}
        
        {/* Right icon */}
        {!loading && icon && iconPosition === 'right' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

// Icon-only button variant
interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconPosition'> {
  'aria-label': string;
  children: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', className, children, ...props }, ref) => {
    const iconSizeStyles: Record<ButtonSize, string> = {
      sm: 'h-8 w-8',
      md: 'h-10 w-10',
      lg: 'h-12 w-12',
    };
    
    return (
      <Button
        ref={ref}
        size={size}
        className={cn(iconSizeStyles[size], 'p-0', className)}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

