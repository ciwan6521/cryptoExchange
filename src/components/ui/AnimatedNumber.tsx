'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { usePrevious, useReducedMotion } from '@/hooks';

// ============================================
// Animated Number Component
// Balance roll animation for trading displays
// ============================================

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  showSign?: boolean;
  colored?: boolean; // Color based on positive/negative change
  duration?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  className,
  showSign = false,
  colored = false,
  duration = 0.3,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const previousValue = usePrevious(value);
  const [displayValue, setDisplayValue] = useState(value);
  const animationRef = useRef<number>();
  
  const direction = useMemo(() => {
    if (previousValue === undefined) return 'none';
    if (value > previousValue) return 'up';
    if (value < previousValue) return 'down';
    return 'none';
  }, [value, previousValue]);
  
  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }
    
    const startValue = displayValue;
    const endValue = value;
    const startTime = performance.now();
    const durationMs = duration * 1000;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + (endValue - startValue) * easeProgress;
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, prefersReducedMotion]);
  
  const formattedValue = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  const sign = showSign && value > 0 ? '+' : '';
  
  return (
    <span
      className={cn(
        'tabular-nums',
        colored && direction === 'up' && 'text-profit',
        colored && direction === 'down' && 'text-loss',
        className
      )}
    >
      {prefix}{sign}{formattedValue}{suffix}
    </span>
  );
};

// Rolling digits animation (slot machine style)
interface RollingDigitsProps {
  value: string;
  className?: string;
}

export const RollingDigits: React.FC<RollingDigitsProps> = ({
  value,
  className,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const digits = value.split('');
  
  return (
    <span className={cn('inline-flex tabular-nums', className)}>
      {digits.map((digit, index) => (
        <RollingDigit
          key={`${index}-${digit}`}
          digit={digit}
          animate={!prefersReducedMotion}
        />
      ))}
    </span>
  );
};

interface RollingDigitProps {
  digit: string;
  animate: boolean;
}

const RollingDigit: React.FC<RollingDigitProps> = ({ digit, animate }) => {
  const isNumber = /\d/.test(digit);
  
  if (!isNumber || !animate) {
    return <span>{digit}</span>;
  }
  
  return (
    <span className="relative inline-block overflow-hidden h-[1em]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={digit}
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="inline-block"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

// Price display with direction indicator
interface PriceDisplayProps {
  price: number;
  decimals?: number;
  prefix?: string;
  size?: 'sm' | 'md' | 'lg';
  showArrow?: boolean;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  price,
  decimals = 2,
  prefix = '$',
  size = 'md',
  showArrow = true,
}) => {
  const previousPrice = usePrevious(price);
  const direction = useMemo(() => {
    if (previousPrice === undefined) return null;
    if (price > previousPrice) return 'up';
    if (price < previousPrice) return 'down';
    return null;
  }, [price, previousPrice]);
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl font-semibold',
  };
  
  return (
    <div className={cn('flex items-center gap-1', sizeClasses[size])}>
      <AnimatedNumber
        value={price}
        decimals={decimals}
        prefix={prefix}
        colored
        className={direction === 'up' ? 'text-profit' : direction === 'down' ? 'text-loss' : 'text-white'}
      />
      {showArrow && direction && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'text-xs',
            direction === 'up' ? 'text-profit' : 'text-loss'
          )}
        >
          {direction === 'up' ? '▲' : '▼'}
        </motion.span>
      )}
    </div>
  );
};

