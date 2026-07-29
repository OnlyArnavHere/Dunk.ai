'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, PackageOpen, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';

interface RequirementsViewProps {
  projectId: string;
}

export function RequirementsView({ projectId: _projectId }: RequirementsViewProps) {
  const requirements = useWorkspaceStore((s) => s.aiOutput?.requirements) as Record<string, any>;

  if (!requirements) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <PackageOpen className="h-10 w-10 opacity-40" />
        <p className="text-sm">Run the AI pipeline from the Chat tab to generate Requirements.</p>
      </div>
    );
  }

  // Flatten the requirement categories for display
  const displayItems = [];
  let idCounter = 1;
  const categories = [
    { key: 'functional_requirements', label: 'Functional' },
    { key: 'hardware_inputs', label: 'Inputs' },
    { key: 'hardware_outputs', label: 'Outputs' },
    { key: 'connectivity', label: 'Connectivity' },
    { key: 'power_requirements', label: 'Power' },
    { key: 'physical_constraints', label: 'Physical' },
    { key: 'safety_compliance', label: 'Safety & Regulatory' },
  ];

  for (const cat of categories) {
    const data = requirements[cat.key];
    if (Array.isArray(data)) {
      for (const item of data) {
        displayItems.push({ id: idCounter++, category: cat.label, title: item });
      }
    } else if (typeof data === 'object' && data !== null) {
      // Power requirements is a dict
      for (const [k, v] of Object.entries(data)) {
        if (v) displayItems.push({ id: idCounter++, category: cat.label, title: `${k}: ${v}` });
      }
    }
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-4 pr-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">{requirements.project_name || 'Project Requirements'}</h2>
              <p className="text-xs text-muted-foreground mt-1">Analyzed from your description</p>
            </div>
          </div>

          <div className="space-y-3">
            {displayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No specific requirements captured.</p>
            ) : (
              displayItems.map((req) => (
                <div key={req.id} className="bg-secondary rounded-lg border border-border p-4 hover:border-accent/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-primary/10 text-accent px-2 py-1 rounded">
                          {req.category}
                        </span>
                      </div>
                      <p className="text-sm text-foreground mt-2">{req.title}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
