'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Download, CheckCircle, AlertCircle, XCircle, ShieldCheck } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/store';

interface ValidationViewProps {
  projectId: string;
}

// ---- Types mirroring the Python validation output ----
interface ValidationIssue {
  id?: string;
  title?: string;
  name?: string;
  category?: string;
  status?: 'passed' | 'warning' | 'failed' | 'error' | 'info';
  severity?: 'error' | 'warning' | 'info';
  details?: string;
  message?: string;
  description?: string;
}

interface ValidationData {
  issues?: ValidationIssue[];
  checks?: ValidationIssue[];
  results?: ValidationIssue[];
  passed?: number;
  warnings?: number;
  failures?: number;
  status?: string;
  summary?: string;
}

type StatusKey = 'passed' | 'warning' | 'failed' | 'error' | 'info';

const STATUS_CONFIG: Record<StatusKey, { icon: React.ReactNode; color: string; border: string; bg: string }> = {
  passed: {
    icon: <CheckCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />,
    color: 'text-accent',
    border: 'border-accent/20',
    bg: 'bg-accent/5',
  },
  warning: {
    icon: <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />,
    color: 'text-amber-500',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
  },
  failed: {
    icon: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />,
    color: 'text-red-500',
    border: 'border-red-500/20',
    bg: 'bg-red-500/5',
  },
  error: {
    icon: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />,
    color: 'text-red-500',
    border: 'border-red-500/20',
    bg: 'bg-red-500/5',
  },
  info: {
    icon: <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />,
    color: 'text-accent',
    border: 'border-accent/20',
    bg: 'bg-accent/5',
  },
};

export function ValidationView({ projectId: _projectId }: ValidationViewProps) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput);
  const validation = aiOutput?.validation as ValidationData | null | undefined;

  const checks: ValidationIssue[] =
    validation?.issues ?? validation?.checks ?? validation?.results ?? [];

  const normaliseStatus = (item: ValidationIssue): StatusKey => {
    const raw = item.status ?? (item.severity === 'error' ? 'failed' : item.severity) ?? 'info';
    return (['passed', 'warning', 'failed', 'error', 'info'].includes(raw) ? raw : 'info') as StatusKey;
  };

  // Aggregate counts
  const passedCount = validation?.passed ?? checks.filter((c) => normaliseStatus(c) === 'passed').length;
  const warningCount = validation?.warnings ?? checks.filter((c) => normaliseStatus(c) === 'warning').length;
  const failedCount = validation?.failures ?? checks.filter((c) => ['failed', 'error'].includes(normaliseStatus(c))).length;
  const overallStatus = failedCount > 0 ? 'Needs Review' : warningCount > 0 ? 'Warning' : 'Ready';

  // ---- Empty / loading state ----
  if (!validation || checks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <ShieldCheck className="h-10 w-10 opacity-40" />
        <p className="text-sm">
          {aiOutput
            ? 'No validation results were generated for this run.'
            : 'Run the AI pipeline from the Chat tab to generate the Validation Report.'}
        </p>
      </div>
    );
  }

  const exportReport = () => {
    const text = checks
      .map((c) => `[${normaliseStatus(c).toUpperCase()}] ${c.title ?? c.name ?? 'Check'}: ${c.details ?? c.message ?? c.description ?? ''}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation-report.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6 pr-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Validation Report</h2>
              <p className="text-xs text-muted-foreground mt-1">{checks.length} check{checks.length !== 1 ? 's' : ''} performed</p>
            </div>
            <Button variant="outline" size="sm" className="border-border text-muted-foreground" onClick={exportReport}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Passed</p>
              <p className="text-3xl font-bold mt-1 text-accent">{passedCount}</p>
            </div>
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Warnings</p>
              <p className="text-3xl font-bold mt-1 text-amber-500">{warningCount}</p>
            </div>
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Failures</p>
              <p className="text-3xl font-bold mt-1 text-red-500">{failedCount}</p>
            </div>
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
              <p className={`text-2xl font-bold mt-1 ${failedCount > 0 ? 'text-red-500' : warningCount > 0 ? 'text-amber-500' : 'text-accent'}`}>
                {overallStatus}
              </p>
            </div>
          </div>

          {/* Validation Details */}
          <div className="space-y-3">
            {checks.map((check, idx) => {
              const s = normaliseStatus(check);
              const cfg = STATUS_CONFIG[s];
              return (
                <div key={check.id ?? idx} className={`rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-start gap-3">
                    {cfg.icon}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{check.title ?? check.name ?? `Check ${idx + 1}`}</h3>
                        {check.category && (
                          <span className="text-xs bg-primary/10 text-accent px-2 py-1 rounded">{check.category}</span>
                        )}
                        <span className={`text-xs font-medium uppercase ${cfg.color}`}>{s}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {check.details ?? check.message ?? check.description ?? ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {validation.summary && (
            <div className={`border rounded-lg p-4 mt-6 ${failedCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-accent/10 border-accent/20'}`}>
              <p className="text-xs text-foreground">{validation.summary}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
