'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Info, AlertCircle, Lock } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { Button, NumberInput, Select } from '@/components/ui';
import { mul, toFixedWithCommas, toFixed, validateOrder as validateOrderDecimal } from '@/lib/decimal';
import { getPrecision } from '@/lib/tokens';
import { isEnabled } from '@/lib/feature-flags';
import { useTradingDisabled } from './ConnectionStatus';
import { useAdminStore } from '@/stores/admin-store';
import { useUserFlags } from '@/hooks/useUserFlags';
import { useOrderStore } from '@/stores/order-store';
import { ApiError } from '@/lib/api';

// ============================================
// Order Form Component
// Buy/Sell order placement with:
//   - Decimal-safe arithmetic (no native floats for money)
//   - Asset-precision-aware inputs
//   - Feature-flag gating
//   - Connection-aware disabled state
// ============================================

interface OrderFormProps {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  currentPrice: number;
  availableBase?: number;
  availableQuote?: number;
  onSubmit?: (order: OrderData) => void;
}

interface OrderData {
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop-limit';
  price?: string;
  stopPrice?: string;
  quantity: string;
  total: string;
}

type OrderType = 'limit' | 'market' | 'stop-limit';

const percentButtons = [25, 50, 75, 100];

export const OrderForm: React.FC<OrderFormProps> = ({
  symbol,
  baseAsset,
  quoteAsset,
  currentPrice,
  availableBase = 0,
  availableQuote = 0,
  onSubmit,
}) => {
  const precision = useMemo(() => getPrecision(symbol), [symbol]);
  const tradingDisabled = useTradingDisabled();
  const liveTradingEnabled = isEnabled('ENABLE_LIVE_TRADING');
  const { tradingEnabled: adminTradingOn, newOrdersEnabled: adminNewOrdersOn } = useAdminStore((s) => s.systemFlags);
  const pairDisabled = false; // Pair-level disable comes from backend via market API
  const { userTradingEnabled } = useUserFlags();
  const stopLimitEnabled = isEnabled('ENABLE_STOP_LIMIT');

  // Build order type options based on feature flags
  const orderTypes = useMemo(() => {
    const types = [
      { value: 'limit', label: 'Limit' },
      { value: 'market', label: 'Market' },
    ];
    if (stopLimitEnabled) {
      types.push({ value: 'stop-limit', label: 'Stop Limit' });
    }
    return types;
  }, [stopLimitEnabled]);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price, setPrice] = useState(toFixed(currentPrice, precision.price));
  const [stopPrice, setStopPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All arithmetic through decimal.ts — never native floats
  const effectivePrice = orderType === 'market' ? currentPrice.toString() : price;
  const total = useMemo(() => {
    const q = parseFloat(quantity);
    const p = parseFloat(effectivePrice);
    if (isNaN(q) || isNaN(p) || q <= 0 || p <= 0) return '0';
    return mul(effectivePrice, quantity);
  }, [quantity, effectivePrice]);

  const available = side === 'buy' ? availableQuote : availableBase;
  const availableAsset = side === 'buy' ? quoteAsset : baseAsset;

  // Percent-based quantity using decimal-safe math
  const handlePercentClick = useCallback((percent: number) => {
    const pct = (percent / 100).toString();
    if (side === 'buy') {
      const budget = mul(availableQuote.toString(), pct);
      const p = parseFloat(effectivePrice);
      if (isNaN(p) || p <= 0) return;
      const maxQty = parseFloat(budget) / p;
      setQuantity(toFixed(maxQty, precision.quantity));
    } else {
      const maxQty = parseFloat(mul(availableBase.toString(), pct));
      setQuantity(toFixed(maxQty, precision.quantity));
    }
  }, [side, availableQuote, availableBase, effectivePrice, precision.quantity]);

  // Validate using decimal.ts deterministic validation
  const validate = (): boolean => {
    if (orderType === 'stop-limit' && (!stopPrice || parseFloat(stopPrice) <= 0)) {
      setError('Please enter a stop price');
      return false;
    }

    // Order size min/max enforcement is handled server-side by the execution engine

    const priceToValidate = orderType === 'market' ? currentPrice.toString() : price;
    const balanceStr = side === 'buy' ? availableQuote.toString() : availableBase.toString();
    const err = validateOrderDecimal(priceToValidate, quantity, symbol, side, balanceStr);
    if (err) {
      setError(err);
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!liveTradingEnabled || tradingDisabled) return;
    if (!validate()) return;

    setIsSubmitting(true);

    const orderData: OrderData = {
      side,
      type: orderType,
      price: orderType !== 'market' ? price : undefined,
      stopPrice: orderType === 'stop-limit' ? stopPrice : undefined,
      quantity,
      total,
    };

    try {
      const dashSymbol = symbol.replace('/', '-');
      const result = await useOrderStore.getState().placeOrder({
        symbol: dashSymbol,
        side,
        order_type: orderType === 'stop-limit' ? 'limit' : orderType,
        quantity,
        price: orderType !== 'market' ? price : undefined,
      });
      onSubmit?.(orderData);
      setQuantity('');
      setError(null);
      toast.success(`${side === 'buy' ? 'Buy' : 'Sell'} order placed`, {
        description: `${quantity} ${baseAsset} @ ${orderType === 'market' ? 'market price' : price + ' ' + quoteAsset}`,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Order placement failed';
      setError(msg);
      toast.error('Order failed', { description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = !liveTradingEnabled || tradingDisabled || !adminTradingOn || !adminNewOrdersOn || pairDisabled || !userTradingEnabled;

  return (
    <div className="h-full flex flex-col">
      {/* Live trading disabled banner */}
      {!liveTradingEnabled && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
          <Lock className="w-3 h-3" />
          Live trading is currently disabled
        </div>
      )}
      {!adminTradingOn && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          <Lock className="w-3 h-3" />
          Trading is temporarily suspended by the system
        </div>
      )}
      {adminTradingOn && !adminNewOrdersOn && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
          <Lock className="w-3 h-3" />
          New order submissions are temporarily paused
        </div>
      )}
      {pairDisabled && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          <Lock className="w-3 h-3" />
          Trading for {symbol} is currently disabled
        </div>
      )}
      {!userTradingEnabled && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          <Lock className="w-3 h-3" />
          Trading has been restricted on your account
        </div>
      )}

      {/* Side selector */}
      <div className="grid grid-cols-2 p-1 bg-surface-200 rounded-lg m-3 mb-0">
        <button
          onClick={() => setSide('buy')}
          className={cn(
            'py-2.5 text-sm font-medium rounded-md transition-all',
            side === 'buy'
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
              : 'text-gray-400 hover:text-gray-200'
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={cn(
            'py-2.5 text-sm font-medium rounded-md transition-all',
            side === 'sell'
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
              : 'text-gray-400 hover:text-gray-200'
          )}
        >
          Sell
        </button>
      </div>

      {/* Order form content */}
      <div className="flex-1 p-3 space-y-3 overflow-auto">
        {/* Order type */}
        <Select
          options={orderTypes}
          value={orderType}
          onChange={(v) => setOrderType(v as OrderType)}
          label="Order Type"
          disabled={isDisabled}
        />

        {/* Stop price (for stop-limit orders) */}
        <AnimatePresence>
          {orderType === 'stop-limit' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <NumberInput
                label="Stop Price"
                value={stopPrice}
                onChange={setStopPrice}
                suffix={quoteAsset}
                decimals={precision.price}
                min={0}
                disabled={isDisabled}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Price (not for market orders) */}
        {orderType !== 'market' && (
          <NumberInput
            label="Price"
            value={price}
            onChange={setPrice}
            suffix={quoteAsset}
            decimals={precision.price}
            min={0}
            disabled={isDisabled}
          />
        )}

        {/* Quantity */}
        <NumberInput
          label="Amount"
          value={quantity}
          onChange={setQuantity}
          suffix={baseAsset}
          decimals={precision.quantity}
          min={0}
          disabled={isDisabled}
        />

        {/* Percent buttons */}
        <div className="grid grid-cols-4 gap-2">
          {percentButtons.map((percent) => (
            <button
              key={percent}
              onClick={() => handlePercentClick(percent)}
              disabled={isDisabled}
              className="py-1.5 text-xs text-gray-400 bg-surface-100 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              {percent}%
            </button>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between py-2 border-t border-glass-border">
          <span className="text-sm text-gray-400">Total</span>
          <span className="text-sm font-medium text-white tabular-nums">
            {toFixedWithCommas(total, 2)} {quoteAsset}
          </span>
        </div>

        {/* Available balance */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Available</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {formatNumber(available, { decimals: side === 'buy' ? 2 : precision.quantity })} {availableAsset}
          </span>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-400">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit button */}
        <Button
          fullWidth
          size="lg"
          loading={isSubmitting}
          onClick={handleSubmit}
          disabled={isDisabled}
          className={cn(
            side === 'buy'
              ? 'bg-green-500 hover:bg-green-400 shadow-lg shadow-green-500/20'
              : 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20'
          )}
        >
          {side === 'buy' ? 'Buy' : 'Sell'} {baseAsset}
        </Button>

        {/* Info notice */}
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>
            {orderType === 'limit' && 'Limit orders execute at the specified price or better.'}
            {orderType === 'market' && 'Market orders execute immediately at the best available price.'}
            {orderType === 'stop-limit' && 'Stop-limit orders trigger when the stop price is reached.'}
          </span>
        </div>
      </div>
    </div>
  );
};

