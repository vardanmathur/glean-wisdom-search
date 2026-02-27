import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SavedHighlightsProvider } from "@/context/SavedHighlightsContext";
import Navbar from "@/components/Navbar";
import Index from "./pages/Index";
import SearchResults from "./pages/SearchResults";
import BrowseTopics from "./pages/BrowseTopics";
import BookDetail from "./pages/BookDetail";
import SavedHighlights from "./pages/SavedHighlights";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AdminSeed from "./pages/AdminSeed";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SavedHighlightsProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/topics" element={<BrowseTopics />} />
            <Route path="/topics/:tag" element={<BrowseTopics />} />
            <Route path="/book/:title" element={<BookDetail />} />
            <Route path="/saved" element={<SavedHighlights />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin/seed" element={<AdminSeed />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SavedHighlightsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
