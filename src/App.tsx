import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import Index from "./pages/Index";
import SearchResults from "./pages/SearchResults";
import BrowseTopics from "./pages/BrowseTopics";
import BookDetail from "./pages/BookDetail";
import SavedHighlights from "./pages/SavedHighlights";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import BrowseBooks from "./pages/BrowseBooks";
import AdminSeed from "./pages/AdminSeed";
import AdminStudioHighlights from "./pages/AdminStudioHighlights";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Settings from "./pages/Settings";
import Think from "./pages/Think";
import AdminPermissions from "./pages/AdminPermissions";
import Import from "./pages/Import";
import UserStudio from "./pages/UserStudio";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
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
            <Route path="/books" element={<BrowseBooks />} />
            <Route path="/saved" element={<SavedHighlights />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin/seed" element={<AdminSeed />} />
            <Route path="/admin/studio/highlights" element={<AdminStudioHighlights />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/think" element={<Think />} />
            <Route path="/admin/permissions" element={<AdminPermissions />} />
            <Route path="/import" element={<Import />} />
            <Route path="/studio" element={<UserStudio />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
