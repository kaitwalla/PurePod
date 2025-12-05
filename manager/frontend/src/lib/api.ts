import type { Feed, PaginatedEpisodes } from '@/types/api'

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

export interface EpisodeListParams {
  feed_id?: number
  status?: string
  show_ignored?: boolean
  page?: number
  page_size?: number
}

export const episodesApi = {
  list: (params?: EpisodeListParams) => {
    const searchParams = new URLSearchParams()
    if (params?.feed_id) searchParams.set('feed_id', String(params.feed_id))
    if (params?.status) searchParams.set('status', params.status)
    if (params?.show_ignored) searchParams.set('show_ignored', 'true')
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.page_size) searchParams.set('page_size', String(params.page_size))
    const query = searchParams.toString()
    return fetchAPI<PaginatedEpisodes>(`/episodes${query ? `?${query}` : ''}`)
  },

  queueBulk: (episodeIds: number[]) =>
    fetchAPI<{ queued: number }>('/episodes/queue', {
      method: 'POST',
      body: JSON.stringify({ episode_ids: episodeIds }),
    }),

  ignoreBulk: (episodeIds: number[]) =>
    fetchAPI<{ ignored: number }>('/episodes/ignore', {
      method: 'POST',
      body: JSON.stringify({ episode_ids: episodeIds }),
    }),

  unignoreBulk: (episodeIds: number[]) =>
    fetchAPI<{ restored: number }>('/episodes/unignore', {
      method: 'POST',
      body: JSON.stringify({ episode_ids: episodeIds }),
    }),
}
