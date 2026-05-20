import { Navigate, Link } from "react-router-dom";
import { Wrench, BookOpen, Shield, FileText, Brain, Tag, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Badge } from "@/components/ui/badge";

interface ToolCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  comingSoon?: boolean;
}

const tools: ToolCard[] = [
  { title: "Admin Studio", description: "Edit highlights, tags, notes and manage embeddings", icon: Wrench, to: "/admin/studio/highlights" },
  { title: "Books", description: "Manage your book catalogue, covers and metadata", icon: BookOpen, to: "/admin/books" },
  { title: "Permissions", description: "Manage user access and feature permissions", icon: Shield, to: "/admin/permissions" },
  { title: "Worksheets", description: "View and download user worksheet downloads", icon: FileText, to: "/admin/worksheets" },
  { title: "Think! Usage", description: "Monitor Think! usage across users", icon: Brain, comingSoon: true },
  { title: "Tag Management", description: "Manage and merge tags across highlights", icon: Tag, comingSoon: true },
];

const AdminHub = () => {
  const { authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">Admin</h1>
        <p className="mt-1 text-muted-foreground">Glean management tools</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const inner = (
            <>
              {tool.comingSoon && (
                <Badge variant="secondary" className="absolute right-4 top-4 text-xs font-normal">
                  Coming soon
                </Badge>
              )}
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-lg font-semibold text-foreground">{tool.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                </div>
                {!tool.comingSoon && (
                  <ArrowRight className="h-4 w-4 mt-2 text-muted-foreground" />
                )}
              </div>
            </>
          );

          const baseCls = "relative rounded-xl border bg-card p-6 shadow-sm transition-all";
          if (tool.comingSoon) {
            return (
              <div key={tool.title} className={`${baseCls} opacity-60 cursor-default`}>
                {inner}
              </div>
            );
          }
          return (
            <Link key={tool.title} to={tool.to!} className={`${baseCls} hover:shadow-md hover:border-primary/30 cursor-pointer block`}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default AdminHub;
