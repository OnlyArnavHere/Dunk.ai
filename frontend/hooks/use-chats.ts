'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '@/lib/api'
import type { Chat, PaginatedResponse } from '@/lib/types'

export function useChats(projectId: string | null) {
  return useQuery({
    queryKey: ['chats', projectId],
    queryFn: () => chatApi.list(projectId!) as Promise<PaginatedResponse<Chat>>,
    enabled: !!projectId,
  })
}

export function useCreateChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, title }: { projectId: string; title?: string }) =>
      chatApi.create(projectId, title) as Promise<Chat>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chats', variables.projectId] })
    },
  })
}

export function useRenameChat(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => chatApi.rename(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats', projectId] })
    },
  })
}

export function useDeleteChat(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => chatApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats', projectId] })
    },
  })
}

// Persists a completed pipeline run's artifacts onto the session that
// produced them, so each chat session keeps its own independent
// requirements/architecture/bom/etc rather than sharing the project's.
export function useUpdateChatArtifacts(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => chatApi.updateArtifacts(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats', projectId] })
    },
  })
}
