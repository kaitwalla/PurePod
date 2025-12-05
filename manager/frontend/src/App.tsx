import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Podcast, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FeedView } from '@/components/FeedView'
import { EpisodeTable } from '@/components/EpisodeTable'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

type Tab = 'feeds' | 'episodes'

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('feeds')

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">PodcastPurifier</h1>
            <nav className="flex gap-2">
              <Button
                variant={activeTab === 'feeds' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('feeds')}
              >
                <Podcast className="mr-2 h-4 w-4" />
                Feeds
              </Button>
              <Button
                variant={activeTab === 'episodes' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('episodes')}
              >
                <Inbox className="mr-2 h-4 w-4" />
                Episode Inbox
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'feeds' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Subscribed Podcasts</h2>
            <FeedView />
          </div>
        )}
        {activeTab === 'episodes' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Episode Inbox</h2>
            <EpisodeTable />
          </div>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App
