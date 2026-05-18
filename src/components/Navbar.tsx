import { Link, useNavigate } from "react-router-dom";
import { Leaf, Search, Bookmark, User, LogOut, Settings, BookOpen, Wrench, Shield, Upload, Menu, Brain, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

const Navbar = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const { isAdmin } = useIsAdmin();

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
        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="sm:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-primary">
                  <Leaf className="h-5 w-5" />
                  <span className="font-display text-lg">Glean</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                <SheetClose asChild>
                  <Link
                    to="/topics"
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Topics
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/books"
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Books
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/saved"
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <Bookmark className="h-4 w-4" />
                    Saved Highlights
                  </Link>
                </SheetClose>
                {(isAdmin || hasPermission("think")) && (
                  <SheetClose asChild>
                    <Link
                      to="/think"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Brain className="h-4 w-4" />
                      Think!
                    </Link>
                  </SheetClose>
                )}
                {hasPermission("import") && (
                  <SheetClose asChild>
                    <Link
                      to="/import"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      Import
                    </Link>
                  </SheetClose>
                )}
                {hasPermission("import") && !isAdmin && (
                  <SheetClose asChild>
                    <Link
                      to="/studio"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Sparkles className="h-4 w-4" />
                      My Studio
                    </Link>
                  </SheetClose>
                )}
                {isAdmin && (
                  <SheetClose asChild>
                    <Link
                      to="/studio"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Sparkles className="h-4 w-4" />
                      My Studio
                    </Link>
                  </SheetClose>
                )}
                {isAdmin && (
                  <SheetClose asChild>
                    <Link
                      to="/admin/permissions"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Shield className="h-4 w-4" />
                      Permissions
                    </Link>
                  </SheetClose>
                )}
                {isAdmin && (
                  <SheetClose asChild>
                    <Link
                      to="/admin/studio/highlights"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Wrench className="h-4 w-4" />
                      Admin Studio
                    </Link>
                  </SheetClose>
                )}
                {isAdmin && (
                  <SheetClose asChild>
                    <Link
                      to="/admin/books"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <BookOpen className="h-4 w-4" />
                      Books
                    </Link>
                  </SheetClose>
                )}
                {user && (
                  <SheetClose asChild>
                    <Link
                      to="/settings"
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  </SheetClose>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 text-primary">
            <Leaf className="h-6 w-6" />
            <span className="font-display text-xl font-semibold tracking-tight">Glean</span>
          </Link>
        </div>

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
            className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Topics
          </Link>
          <Link
            to="/books"
            className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Books
          </Link>
          {(isAdmin || hasPermission("think")) && (
            <Link
              to="/think"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Brain className="h-4 w-4" />
              Think!
            </Link>
          )}
          {hasPermission("import") && (
            <Link
              to="/studio"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              My Studio
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin/permissions"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Shield className="h-4 w-4" />
              Permissions
            </Link>
          )}
          <Link
            to="/saved"
            className="hidden sm:inline-flex rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/studio")}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    My Studio
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin/studio/highlights")}>
                    <Wrench className="mr-2 h-4 w-4" />
                    Admin Studio
                  </DropdownMenuItem>
                )}
                {hasPermission("import") && !isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/studio")}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    My Studio
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
