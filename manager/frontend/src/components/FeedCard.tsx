import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Podcast, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { feedsApi } from '@/lib/api'
import type { Feed } from '@/types/api'

interface FeedCardProps {
  feed: Feed
}

export function FeedCard({ feed }: FeedCardProps) {
  const queryClient = useQueryClient()
  const [showConfirm, setShowConfirm] = useState(false)

  const updateAutoProcess = useMutation({
    mutationFn: (autoProcess: boolean) =>
      feedsApi.updateAutoProcess(feed.id, autoProcess),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    },
  })

  const ingestFeed = useMutation({
    mutationFn: () => feedsApi.ingest(feed.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['episodes'] })
    },
  })

  const deleteFeed = useMutation({
    mutationFn: () => feedsApi.delete(feed.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
      queryClient.invalidateQueries({ queryKey: ['episodes'] })
    },
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {feed.image_url ? (
            <img
              src={feed.image_url}
              alt={feed.title}
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Podcast className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg leading-tight">{feed.title}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => ingestFeed.mutate()}
                disabled={ingestFeed.isPending}
                title="Refresh feed"
                className="flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${ingestFeed.isPending ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {feed.author && (
              <CardDescription className="text-xs mt-1">
                {feed.author}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor={`auto-process-${feed.id}`}
            className="text-sm font-medium cursor-pointer"
          >
            Auto-Process New Episodes
          </label>
          <Switch
            id={`auto-process-${feed.id}`}
            checked={feed.auto_process}
            onCheckedChange={(checked) => updateAutoProcess.mutate(checked)}
            disabled={updateAutoProcess.isPending}
          />
        </div>
        <div className="pt-2 border-t">
          {showConfirm ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Delete this podcast?</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirm(false)}
                  disabled={deleteFeed.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteFeed.mutate()}
                  disabled={deleteFeed.isPending}
                >
                  {deleteFeed.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirm(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Podcast
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
