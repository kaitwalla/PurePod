export type EpisodeStatus = 'discovered' | 'queued' | 'processing' | 'cleaned' | 'failed'

export interface Feed {
  id: number
  title: string
  rss_url: string
  auto_process: boolean
  created_at: string
  updated_at: string
}

export interface Episode {
  id: number
  feed_id: number
  guid: string
  status: EpisodeStatus
  title: string
  audio_url: string
  local_filename: string | null
  created_at: string
  updated_at: string
}

export interface EpisodeProgress {
  episode_id: number
  progress: number
  stage: string
}
