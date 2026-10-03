'use client'

import { Bell, CheckCheck, Loader2, Sparkles, AlertTriangle, FileText, Share2, AtSign, Info, type LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/use-notifications'
import type { AppNotification } from '@/lib/types'

// LucideIcon, not React.ElementType: once @react-three/fiber is in the build it adds
// three.js tags to JSX, and ElementType's union then types className as never.
const TYPE_ICONS: Record<AppNotification['type'], LucideIcon> = {
  project_shared: Share2,
  ai_complete: Sparkles,
  ai_failed: AlertTriangle,
  document_ready: FileText,
  system: Info,
  mention: AtSign,
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function NotificationsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading, isError } = useNotifications(open)
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const notifications = data?.items || []
  const hasUnread = notifications.some((n) => !n.isRead)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-background/95 backdrop-blur-xl border-foreground/10 p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-foreground/10">
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">Updates from your projects and agents.</DialogDescription>
            </div>
            {hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                {markAllAsRead.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCheck className="w-3 h-3 mr-1" />}
                Mark all read
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[380px]">
          {isLoading && (
            <div className="p-5 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="p-8 text-center">
              <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Failed to load notifications.</p>
            </div>
          )}

          {!isLoading && !isError && notifications.length === 0 && (
            <div className="p-10 text-center">
              <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground mt-1">You have no notifications right now.</p>
            </div>
          )}

          <div className="divide-y divide-foreground/5">
            {notifications.map((notification) => {
              const Icon = TYPE_ICONS[notification.type] || Info
              return (
                <button
                  key={notification._id}
                  onClick={() => {
                    if (!notification.isRead) markAsRead.mutate(notification._id)
                  }}
                  className={`w-full text-left px-5 py-3.5 flex gap-3 transition-colors hover:bg-foreground/5 ${
                    notification.isRead ? 'opacity-60' : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium truncate">{notification.title}</p>
                      {!notification.isRead && <span className="h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{formatRelativeTime(notification.createdAt)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
