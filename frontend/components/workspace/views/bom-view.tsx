'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Download, Copy, PackageOpen } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWorkspaceStore } from '@/lib/store';

interface BOMViewProps {
  projectId: string;
}

// ---- Types that mirror the Python BOM output ----
interface BomRow {
  reference?: string;
  designator?: string;
  component?: string;
  part_number?: string;
  manufacturer?: string;
  package?: string;
  qty?: number;
  quantity?: number;
  category?: string;
  supplier?: string;
  unit_cost?: string | number;
  cost?: string;
  availability?: string;
}

interface BomData {
  rows?: BomRow[];
  components?: BomRow[];
  total_cost?: string | number;
  summary?: string;
}

export function BOMView({ projectId: _projectId }: BOMViewProps) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput);
  const bom = aiOutput?.bom as BomData | null | undefined;

  // Normalise rows from whatever key the Python agent used
  const rows: BomRow[] = bom?.rows ?? bom?.components ?? [];

  const totalCost =
    bom?.total_cost != null
      ? String(bom.total_cost)
      : rows.length
      ? `$${rows.reduce((sum, r) => {
          const cost = parseFloat(String(r.unit_cost ?? r.cost ?? '0').replace(/[^0-9.]/g, ''));
          return sum + (isNaN(cost) ? 0 : cost * (r.qty ?? r.quantity ?? 1));
        }, 0).toFixed(2)}`
      : null;

  // ---- Empty / loading state ----
  if (!bom || rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <PackageOpen className="h-10 w-10 opacity-40" />
        <p className="text-sm">
          {aiOutput
            ? 'The AI pipeline did not generate a BOM for this run.'
            : 'Run the AI pipeline from the Chat tab to generate the Bill of Materials.'}
        </p>
      </div>
    );
  }

  const copyBom = () => {
    const csv = [
      ['Designator', 'Component', 'Qty', 'Category', 'Cost', 'Availability'].join(','),
      ...rows.map((r) =>
        [
          r.reference ?? r.designator ?? '',
          r.component ?? r.part_number ?? '',
          String(r.qty ?? r.quantity ?? ''),
          r.category ?? '',
          String(r.unit_cost ?? r.cost ?? ''),
          r.availability ?? '',
        ].join(',')
      ),
    ].join('\n');
    navigator.clipboard.writeText(csv);
  };

  const downloadBom = () => {
    const csv = [
      ['Designator', 'Component', 'Qty', 'Category', 'Cost', 'Availability'].join(','),
      ...rows.map((r) =>
        [
          r.reference ?? r.designator ?? '',
          r.component ?? r.part_number ?? '',
          String(r.qty ?? r.quantity ?? ''),
          r.category ?? '',
          String(r.unit_cost ?? r.cost ?? ''),
          r.availability ?? '',
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bom.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6 pr-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bill of Materials</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {rows.length} component{rows.length !== 1 ? 's' : ''}
                {totalCost ? ` • ${totalCost} estimated` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-border text-muted-foreground" onClick={copyBom}>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button variant="outline" size="sm" className="border-border text-muted-foreground" onClick={downloadBom}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Items</p>
              <p className="text-2xl font-bold mt-1">{rows.length}</p>
            </div>
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Estimated Cost</p>
              <p className="text-2xl font-bold mt-1">{totalCost ?? '—'}</p>
            </div>
            <div className="bg-secondary rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Categories</p>
              <p className="text-2xl font-bold mt-1">
                {new Set(rows.map((r) => r.category).filter(Boolean)).size || '—'}
              </p>
            </div>
          </div>

          {/* BOM Table */}
          <div className="bg-secondary rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-primary/5">
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="h-10 text-xs font-semibold text-muted-foreground">Designator</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-muted-foreground">Component</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-muted-foreground text-right">Qty</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-muted-foreground">Category</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-muted-foreground">Cost</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-muted-foreground">Availability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item, idx) => (
                  <TableRow key={idx} className="border-b border-border hover:bg-primary/5 cursor-pointer transition-colors">
                    <TableCell className="h-10 text-xs font-mono text-accent">
                      {item.reference ?? item.designator ?? `#${idx + 1}`}
                    </TableCell>
                    <TableCell className="h-10 text-xs text-foreground">
                      {(item as any).mfr_part ?? item.part_number ?? item.component ?? '—'}
                      {item.manufacturer ? <span className="text-muted-foreground block text-[10px]">{item.manufacturer}</span> : null}
                    </TableCell>
                    <TableCell className="h-10 text-xs text-muted-foreground text-right">
                      {item.qty ?? item.quantity ?? 1}
                    </TableCell>
                    <TableCell className="h-10 text-xs">
                      {item.category ? (
                        <span className="bg-primary/10 text-accent px-2 py-1 rounded text-xs">{item.category}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="h-10 text-xs font-semibold text-foreground">
                      {item.unit_cost ?? item.cost ?? (item as any).price ?? (item as any).unit_price ?? '—'}
                    </TableCell>
                    <TableCell className="h-10 text-xs text-accent">
                      {item.availability ?? (item as any).stock ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {bom.summary && (
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
              {typeof bom.summary === 'string' ? (
                <p className="text-xs text-foreground">{bom.summary}</p>
              ) : (
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                  {JSON.stringify(bom.summary, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
