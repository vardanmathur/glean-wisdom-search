import { Link, useNavigate } from "react-router-dom";
import { Leaf, Search, Bookmark, User, LogOut, Settings, BookOpen, Wrench } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Navbar = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { user, signOut } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const displayName =
    user?.user_metadata?.full_name || user?.email || "User";
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-primary">
          <Leaf className="h-6 w-6" />
          <span className="font-display text-xl font-semibold tracking-tight">Glean</span>
        </Link>

        <form onSubmit={handleSearch} className="hidden md:flex items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for wisdom..."
              className="h-9 w-64 rounded-lg border bg-secondary pl-9 pr-4 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
        </form>

        <div className="flex items-center gap-1">
          <Link
            to="/topics"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Topics
          </Link>
          <Link
            to="/books"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Books
          </Link>
          <Link
            to="/saved"
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Saved Highlights"
          >
            <Bookmark className="h-5 w-5" />
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <Avatar className="h-8 w-8">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-muted-foreground font-normal text-xs truncate">
                  {displayName}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.email === "vardan@gmail.com" && (
                  <DropdownMenuItem onClick={() => navigate("/admin/studio/highlights")}>
                    <Wrench className="mr-2 h-4 w-4" />
                    Studio
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/saved")}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  My Highlights
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/auth"
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Sign In"
            >
              <User className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
