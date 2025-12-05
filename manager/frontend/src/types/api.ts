export type EpisodeStatus = 'discovered' | 'queued' | 'processing' | 'cleaned' | 'failed' | 'ignored'

export interface Feed {
  id: number
  title: string
  rss_url: string
  description: string | null
  image_url: string | null
  author: string | null
  auto_process: boolean
  created_at: string
  updated_at: string
}

export interface Episode {
  id: number
  feed_id: number
  feed_title: string
  guid: string
  status: EpisodeStatus
  title: string
  audio_url: string
  published_at: string | null
  local_filename: string | null
  created_at: string
  updated_at: string
}

export interface PaginatedEpisodes {
  items: Episode[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface EpisodeProgress {
  episode_id: number
  progress: number
  stage: string
}
