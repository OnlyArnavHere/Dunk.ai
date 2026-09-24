'use client';

import React from 'react';
import { Cpu } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BOARD_PROVIDERS, type BoardProviderId } from '@/lib/providers';

interface ProviderPickerProps {
  value: BoardProviderId;
  onChange: (next: BoardProviderId) => void;
  /** Locked while a run is in flight: the provider is baked into that job. */
  disabled?: boolean;
}

/**
 * Which model generates the board.
 *
 * Sits next to the Generate button rather than in Settings because it is a
 * per-run decision with a real cost/quality trade-off, not a preference you set
 * once — and because the run it applies to starts here. The choice is remembered
 * between runs by useBoardGeneration.
 */
export function ProviderPicker({ value, onChange, disabled }: ProviderPickerProps) {
  const active = BOARD_PROVIDERS.find((p) => p.id === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as BoardProviderId)} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className="w-[150px] border-border text-muted-foreground"
        aria-label="Board generation model"
        title={active ? `${active.label} — ${active.hint}` : 'Board generation model'}
      >
        <Cpu className="w-3.5 h-3.5 mr-1.5 shrink-0" />
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent>
        {BOARD_PROVIDERS.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            <span className="flex flex-col gap-0.5 py-0.5">
              <span className="text-xs font-medium">{provider.label}</span>
              <span className="text-[10px] leading-snug text-muted-foreground max-w-[220px]">
                {provider.hint}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
