import type { Feed, Episode } from '@/types/api'

// In dev, Vite proxies /api/* to the backend. In prod, API is served from same origin.
const API_BASE = import.meta.env.DEV ? '/api' : ''

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  return response.json()
}

export const feedsApi = {
  list: () => fetchAPI<Feed[]>('/feeds'),

  create: (rss_url: string) =>
    fetchAPI<Feed>(`/feeds?rss_url=${encodeURIComponent(rss_url)}`, {
      method: 'POST',
    }),

  updateAutoProcess: (feedId: number, autoProcess: boolean) =>
    fetchAPI<Feed>(`/feeds/${feedId}/auto-process?auto_process=${autoProcess}`, {
      method: 'PATCH',
    }),

  ingest: (feedId: number) =>
    fetchAPI<{ message: string; new_episodes: number }>(`/feeds/${feedId}/ingest`, {
      method: 'POST',
    }),
}

export const episodesApi = {
  list: (params?: { feed_id?: number; status?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.feed_id) searchParams.set('feed_id', String(params.feed_id))
    if (params?.status) searchParams.set('status', params.status)
    const query = searchParams.toString()
    return fetchAPI<Episode[]>(`/episodes${query ? `?${query}` : ''}`)
  },

  queueBulk: (episodeIds: number[]) =>
    fetchAPI<{ queued: number }>('/episodes/queue', {
      method: 'POST',
      body: JSON.stringify({ episode_ids: episodeIds }),
    }),
}
