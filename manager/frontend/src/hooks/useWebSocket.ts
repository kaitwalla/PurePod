import { useEffect, useRef, useCallback, useState } from 'react'
import type { EpisodeProgress } from '@/types/api'

interface UseWebSocketOptions {
  onProgress?: (progress: EpisodeProgress) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [progressMap, setProgressMap] = useState<Map<number, EpisodeProgress>>(() => new Map())
  const reconnectTimeoutRef = useRef<number | undefined>(undefined)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/progress`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setIsConnected(true)
      options.onConnect?.()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as EpisodeProgress
        setProgressMap((prev) => {
          const next = new Map(prev)
          next.set(data.episode_id, data)
          return next
        })
        options.onProgress?.(data)
      } catch {
        console.error('Failed to parse WebSocket message')
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      options.onDisconnect?.()
      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    wsRef.current = ws
  }, [options])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const getProgress = useCallback(
    (episodeId: number): EpisodeProgress | undefined => {
      return progressMap.get(episodeId)
    },
    [progressMap]
  )

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    isConnected,
    progressMap,
    getProgress,
    connect,
    disconnect,
  }
}
