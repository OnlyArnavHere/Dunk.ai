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
  /** Overrides the trigger width, which the compact toolbar sizing assumes. */
  className?: string;
}

/**
 * Which model generates the board.
 *
 * Lives in Settings, as "Default agent/model for PCB generation". It used to
 * sit beside the Generate button as a per-run decision, but generation is no
 * longer something you start by hand — it follows the chat pipeline — so there
 * is no per-run moment left to make the choice in. The value is persisted by
 * readStoredBoardProvider / writeStoredBoardProvider in lib/providers.ts and
 * read fresh each time a run starts.
 */
export function ProviderPicker({ value, onChange, disabled, className }: ProviderPickerProps) {
  const active = BOARD_PROVIDERS.find((p) => p.id === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as BoardProviderId)} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className={className ?? 'w-[150px] border-border text-muted-foreground'}
        aria-label="Board generation model"
        title={active ? `${active.label} — ${active.hint}` : 'Board generation model'}
      >
        <Cpu className="w-3.5 h-3.5 mr-1.5 shrink-0" />
        {/* Explicit children: the default SelectValue mirrors the whole chosen
            item, and each item here is a two-line name-plus-hint block that the
            trigger is far too small to show. */}
        <SelectValue placeholder="Model">{active?.label}</SelectValue>
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
