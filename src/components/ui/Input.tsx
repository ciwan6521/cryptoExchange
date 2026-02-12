'use client';

import React, { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Input Component
// Form input with validation states and animations
// ============================================

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  suffix?: string;
  prefix?: string;
}

const sizeStyles = {
  sm: 'h-9 text-sm px-3',
  md: 'h-11 text-sm px-4',
  lg: 'h-13 text-base px-4',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      size = 'md',
      leftIcon,
      rightIcon,
      suffix,
      prefix,
      className,
      type,
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    
    return (
      <div className="w-full">
        {/* Label */}
        {label && (
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {label}
          </label>
        )}
        
        {/* Input container */}
        <div className="relative">
          {/* Prefix */}
          {prefix && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
              {prefix}
            </span>
          )}
          
          {/* Left icon */}
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              {leftIcon}
            </span>
          )}
          
          {/* Input */}
          <input
            ref={ref}
            type={isPassword && showPassword ? 'text' : type}
            disabled={disabled}
            className={cn(
              'w-full bg-surface-100 border rounded-lg',
              'text-white placeholder-gray-500',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2',
              // Normal state
              !error && 'border-glass-border focus:border-brand-500/50 focus:ring-brand-500/20',
              // Error state
              error && 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20',
              // Disabled state
              disabled && 'opacity-50 cursor-not-allowed',
              // Size
              sizeStyles[size],
              // Icon padding
              leftIcon && 'pl-10',
              (rightIcon || isPassword || suffix) && 'pr-10',
              prefix && 'pl-8',
              className
            )}
            {...props}
          />
          
          {/* Password toggle */}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
          
          {/* Right icon */}
          {!isPassword && rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {rightIcon}
            </span>
          )}
          
          {/* Suffix */}
          {suffix && !isPassword && !rightIcon && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
              {suffix}
            </span>
          )}
        </div>
        
        {/* Error / Hint */}
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-1.5 text-xs text-red-400"
            >
              {error}
            </motion.p>
          ) : hint ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5 text-xs text-gray-500"
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

Input.displayName = 'Input';

// Number input specifically for trading.
// Hardened: blocks scientific notation, enforces decimal precision,
// sanitizes paste, keyboard accessible (ArrowUp/Down to step).
interface NumberInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
}

// Strict decimal regex — no scientific notation, no leading zeros (except "0.")
function isValidTradingInput(val: string, maxDecimals: number): boolean {
  if (val === '' || val === '.') return true;
  const regex = new RegExp(`^(0|[1-9]\\d*)\\.?\\d{0,${maxDecimals}}$`);
  return regex.test(val) && !val.includes('e') && !val.includes('E');
}

function clampAndFormat(
  raw: string,
  min: number | undefined,
  max: number | undefined,
  decimals: number
): string {
  if (raw === '' || raw === '.') return raw;
  const num = parseFloat(raw);
  if (isNaN(num)) return '';
  if (min !== undefined && num < min) return min.toString();
  if (max !== undefined && num > max) return max.toString();
  return raw;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, step = 1, min, max, decimals = 8, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;

      // Block scientific notation characters entirely
      if (/[eE+\-]/.test(raw) && raw !== '' && raw !== '.') {
        // Allow minus only if min is negative (not typical for trading)
        if (!(raw.startsWith('-') && min !== undefined && min < 0)) return;
      }

      if (!isValidTradingInput(raw, decimals)) return;

      onChange(clampAndFormat(raw, min, max, decimals));
    };

    // Sanitize pasted content
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text/plain').trim();
      // Strip commas (common in copied prices), reject scientific notation
      const cleaned = pasted.replace(/,/g, '');
      if (!isValidTradingInput(cleaned, decimals)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      onChange(clampAndFormat(cleaned, min, max, decimals));
    };

    const increment = () => {
      if (disabled) return;
      const current = parseFloat(value) || 0;
      const newValue = current + step;
      if (max !== undefined && newValue > max) return;
      // Use toFixed then strip trailing zeros, but keep at least one decimal if step has decimals
      const formatted = newValue.toFixed(decimals).replace(/\.?0+$/, '');
      onChange(formatted);
    };

    const decrement = () => {
      if (disabled) return;
      const current = parseFloat(value) || 0;
      const newValue = current - step;
      if (min !== undefined && newValue < min) return;
      if (newValue < 0) return;
      const formatted = newValue.toFixed(decimals).replace(/\.?0+$/, '');
      onChange(formatted);
    };

    // Keyboard: ArrowUp/Down to step, Escape to blur
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        increment();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        decrement();
      } else if (e.key === 'Escape') {
        (e.target as HTMLInputElement).blur();
      }
      // Block 'e', 'E', '+' keys (scientific notation)
      if (['e', 'E', '+'].includes(e.key)) {
        e.preventDefault();
      }
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          {...props}
        />

        {/* Increment/Decrement buttons */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            type="button"
            onClick={increment}
            disabled={disabled}
            className="px-2 py-0.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors text-xs"
            tabIndex={-1}
            aria-label="Increment"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={decrement}
            disabled={disabled}
            className="px-2 py-0.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors text-xs"
            tabIndex={-1}
            aria-label="Decrement"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';

