import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { ArrowUpDown, ListPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { episodesApi } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Episode, EpisodeStatus } from '@/types/api'

const statusVariantMap: Record<EpisodeStatus, 'discovered' | 'queued' | 'processing' | 'cleaned' | 'failed'> = {
  discovered: 'discovered',
  queued: 'queued',
  processing: 'processing',
  cleaned: 'cleaned',
  failed: 'failed',
}

export function EpisodeTable() {
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const { progressMap } = useWebSocket()

  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ['episodes'],
    queryFn: () => episodesApi.list(),
    refetchInterval: 5000, // Poll for status updates
  })

  const queueMutation = useMutation({
    mutationFn: episodesApi.queueBulk,
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
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Title
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="max-w-md truncate font-medium" title={row.original.title}>
            {row.original.title}
          </div>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => format(new Date(row.original.created_at), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          const progress = progressMap.get(row.original.id)

          return (
            <div className="flex items-center gap-2">
              <Badge variant={statusVariantMap[status]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
              {status === 'processing' && progress && (
                <div className="w-20">
                  <Progress value={progress.progress} className="h-2" />
                </div>
              )}
            </div>
          )
        },
      },
    ],
    [progressMap]
  )

  const table = useReactTable({
    data: episodes,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    enableRowSelection: (row) => row.original.status === 'discovered',
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const selectedEpisodes = table
    .getSelectedRowModel()
    .rows.map((row) => row.original)

  const handleQueueSelected = () => {
    const ids = selectedEpisodes.map((ep) => ep.id)
    queueMutation.mutate(ids)
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
      {/* Bulk Actions Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selectedEpisodes.length > 0 ? (
            <span>{selectedEpisodes.length} episode(s) selected</span>
          ) : (
            <span>{episodes.length} total episodes</span>
          )}
        </div>
        {selectedEpisodes.length > 0 && (
          <Button
            onClick={handleQueueSelected}
            disabled={queueMutation.isPending}
            size="sm"
          >
            <ListPlus className="mr-2 h-4 w-4" />
            Queue for Processing ({selectedEpisodes.length})
          </Button>
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
                  No episodes found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
