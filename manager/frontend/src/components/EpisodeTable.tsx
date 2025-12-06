import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { ListPlus, EyeOff, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { episodesApi, feedsApi } from '@/lib/api'
import type { Episode, EpisodeStatus, Feed } from '@/types/api'

const statusVariantMap: Record<EpisodeStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  discovered: 'secondary',
  queued: 'outline',
  processing: 'default',
  cleaned: 'default',
  failed: 'destructive',
  ignored: 'secondary',
}

type TabType = 'active' | 'ignored'

export function EpisodeTable() {
  const queryClient = useQueryClient()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [activeTab, setActiveTab] = useState<TabType>('active')
  const [selectedFeedId, setSelectedFeedId] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const pageSize = 25

  const { data, isLoading } = useQuery({
    queryKey: ['episodes', { feedId: selectedFeedId, activeTab, page }],
    queryFn: () => episodesApi.list({
      feed_id: selectedFeedId,
      status: activeTab === 'ignored' ? 'ignored' : undefined,
      show_ignored: activeTab === 'ignored',
      page,
      page_size: pageSize,
    }),
    refetchInterval: 5000,
  })

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds'],
    queryFn: feedsApi.list,
  })

  const episodes = data?.items ?? []
  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0

  const queueMutation = useMutation({
    mutationFn: episodesApi.queueBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['episodes'] })
      setRowSelection({})
    },
  })

  const ignoreMutation = useMutation({
    mutationFn: episodesApi.ignoreBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['episodes'] })
      setRowSelection({})
    },
  })

  const unignoreMutation = useMutation({
    mutationFn: episodesApi.unignoreBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['episodes'] })
      setRowSelection({})
    },
  })

  const columns = useMemo<ColumnDef<Episode>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            disabled={!row.getCanSelect()}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'feed_title',
        header: 'Podcast',
        cell: ({ row }) => (
          <div className="max-w-[150px] truncate text-sm" title={row.original.feed_title}>
            {row.original.feed_title}
          </div>
        ),
      },
      {
        accessorKey: 'title',
        header: 'Episode',
        cell: ({ row }) => (
          <div className="max-w-md truncate font-medium" title={row.original.title}>
            {row.original.title}
          </div>
        ),
      },
      {
        accessorKey: 'published_at',
        header: 'Published',
        cell: ({ row }) => {
          const date = row.original.published_at
          if (!date) return <span className="text-muted-foreground">—</span>
          return format(new Date(date), 'MMM d, yyyy')
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          return (
            <Badge variant={statusVariantMap[status]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
    ],
    []
  )

  const table = useReactTable({
    data: episodes,
    columns,
    state: {
      rowSelection,
    },
    enableRowSelection: (row) => {
      const status = row.original.status
      if (activeTab === 'ignored') {
        return status === 'ignored'
      }
      return status === 'discovered' || status === 'failed'
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const selectedEpisodes = table
    .getSelectedRowModel()
    .rows.map((row) => row.original)

  const handleQueueSelected = () => {
    const ids = selectedEpisodes.map((ep) => ep.id)
    queueMutation.mutate(ids)
  }

  const handleIgnoreSelected = () => {
    const ids = selectedEpisodes.map((ep) => ep.id)
    ignoreMutation.mutate(ids)
  }

  const handleUnignoreSelected = () => {
    const ids = selectedEpisodes.map((ep) => ep.id)
    unignoreMutation.mutate(ids)
  }

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setRowSelection({})
    setPage(1)
  }

  const handleFeedFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedFeedId(value ? Number(value) : undefined)
    setRowSelection({})
    setPage(1)
  }

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="h-96 flex items-center justify-center text-muted-foreground">
          Loading episodes...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabs and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange('active')}
          >
            Active
          </Button>
          <Button
            variant={activeTab === 'ignored' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange('ignored')}
          >
            <EyeOff className="mr-2 h-4 w-4" />
            Ignored
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="feed-filter" className="text-sm text-muted-foreground">
            Filter by podcast:
          </label>
          <select
            id="feed-filter"
            value={selectedFeedId ?? ''}
            onChange={handleFeedFilterChange}
            className="px-3 py-1 border rounded-md bg-background text-sm"
          >
            <option value="">All podcasts</option>
            {feeds.map((feed: Feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selectedEpisodes.length > 0 ? (
            <span>{selectedEpisodes.length} episode(s) selected</span>
          ) : (
            <span>{total} total episodes</span>
          )}
        </div>
        {selectedEpisodes.length > 0 && (
          <div className="flex gap-2">
            {activeTab === 'active' && (
              <>
                <Button
                  onClick={handleQueueSelected}
                  disabled={queueMutation.isPending}
                  size="sm"
                >
                  <ListPlus className="mr-2 h-4 w-4" />
                  Queue ({selectedEpisodes.length})
                </Button>
                <Button
                  onClick={handleIgnoreSelected}
                  disabled={ignoreMutation.isPending}
                  size="sm"
                  variant="outline"
                >
                  <EyeOff className="mr-2 h-4 w-4" />
                  Ignore
                </Button>
              </>
            )}
            {activeTab === 'ignored' && (
              <Button
                onClick={handleUnignoreSelected}
                disabled={unignoreMutation.isPending}
                size="sm"
              >
                <Eye className="mr-2 h-4 w-4" />
                Restore ({selectedEpisodes.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {activeTab === 'ignored' ? 'No ignored episodes.' : 'No episodes found.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
