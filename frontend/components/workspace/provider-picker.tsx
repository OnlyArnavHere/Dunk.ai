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
  /**
   * Per-option availability from GET /ai/providers, keyed by provider name.
   * An unavailable option stays visible, disabled, with the reason — so the
   * user learns what would unlock it instead of wondering where it went.
   */
  status?: Record<string, { available: boolean; source: 'byok' | 'hosted' | null; reason: string | null }>;
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
export function ProviderPicker({ value, onChange, disabled, className, status }: ProviderPickerProps) {
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
        {BOARD_PROVIDERS.map((provider) => {
          const state = status?.[provider.provider];
          return (
          <SelectItem key={provider.id} value={provider.id} disabled={state ? !state.available : false}>
            <span className="flex flex-col gap-0.5 py-0.5">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                {provider.label}
                {state?.source === 'byok' && (
                  <span className="rounded-full bg-secondary px-1.5 py-px text-[9px] font-medium text-muted-foreground">Your key</span>
                )}
                {state && !state.available && state.reason && (
                  <span className="rounded-full bg-secondary px-1.5 py-px text-[9px] font-medium text-muted-foreground">{state.reason}</span>
                )}
              </span>
              <span className="text-[10px] leading-snug text-muted-foreground max-w-[220px]">
                {provider.hint}
              </span>
            </span>
          </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
