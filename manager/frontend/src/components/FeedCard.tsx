import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Rss, RefreshCw } from 'lucide-react'
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Rss className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{feed.title}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => ingestFeed.mutate()}
            disabled={ingestFeed.isPending}
            title="Refresh feed"
          >
            <RefreshCw className={`h-4 w-4 ${ingestFeed.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription className="truncate text-xs">
          {feed.rss_url}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <label
            htmlFor={`auto-process-${feed.id}`}
            className="text-sm font-medium cursor-pointer"
          >
            Auto-Process Future Episodes
          </label>
          <Switch
            id={`auto-process-${feed.id}`}
            checked={feed.auto_process}
            onCheckedChange={(checked) => updateAutoProcess.mutate(checked)}
            disabled={updateAutoProcess.isPending}
          />
        </div>
      </CardContent>
    </Card>
  )
}
