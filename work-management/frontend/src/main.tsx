import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,       // 5 min — data is fresh, no re-fetch unless navigating
      gcTime: 10 * 60_000,         // 10 min — keep cache alive between navigations
      retry: 1,
      refetchOnWindowFocus: false, // KEY: stops burst of 20 queries every alt-tab
      refetchOnReconnect: false,   // no network state changes in Electron
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
