import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Check, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { user, authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [stats, setStats] = useState<{ total: number; privateCount: number; kindleCount: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Toggle is ON when highlights are public (default), OFF means all private
  const [highlightsPublic, setHighlightsPublic] = useState(true);
  const [showVisibilityConfirm, setShowVisibilityConfirm] = useState(false);
  const [pendingPublic, setPendingPublic] = useState<boolean | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  // Load profile + stats
  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      const name = profile?.display_name || user.user_metadata?.full_name || user.email || "";
      setDisplayName(name);
      setOriginalName(name);
    })();

    (async () => {
      setStatsLoading(true);
      const [totalRes, privateRes, kindleRes] = await Promise.all([
        supabase.from("highlights").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("highlights").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("visibility", "private"),
        supabase.from("highlights").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("source", "kindle"),
      ]);

      const total = totalRes.count ?? 0;
      const privateCount = privateRes.count ?? 0;
      setStats({
        total,
        privateCount,
        kindleCount: kindleRes.count ?? 0,
      });
      // If all highlights are private and user has any → toggle off
      setHighlightsPublic(total === 0 ? true : privateCount < total);
      setStatsLoading(false);
    })();
  }, [user]);

  const saveDisplayName = async () => {
    if (!user || displayName.trim() === originalName) return;
    setSavingName(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", user.id);
    setSavingName(false);

    if (error) {
      toast.error("Couldn't save your name");
      return;
    }
    setOriginalName(displayName.trim());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleVisibilityToggle = (next: boolean) => {
    // Only confirm when going from private → public (showing to others)
    if (next === true && highlightsPublic === false) {
      setPendingPublic(next);
      setShowVisibilityConfirm(true);
    } else {
      applyVisibility(next);
    }
  };

  const applyVisibility = async (next: boolean) => {
    if (!user) return;
    setUpdatingVisibility(true);
    const newVisibility = next ? "public" : "private";
    const { error } = await supabase
      .from("highlights")
      .update({ visibility: newVisibility })
      .eq("user_id", user.id);
    setUpdatingVisibility(false);

    if (error) {
      toast.error("Couldn't update visibility");
      return;
    }
    setHighlightsPublic(next);
    if (stats) {
      setStats({
        ...stats,
        privateCount: next ? 0 : stats.total,
      });
    }
    toast.success(next ? "Your highlights are now public" : "Your highlights are now private");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== "DELETE") return;
    setDeleting(true);

    // Soft delete: highlights → profile → sign out (auth user remains)
    const { error: hErr } = await supabase.from("highlights").delete().eq("user_id", user.id);
    if (hErr) {
      toast.error("Couldn't delete your highlights");
      setDeleting(false);
      return;
    }

    const { error: pErr } = await supabase.from("user_profiles").delete().eq("id", user.id);
    if (pErr) {
      toast.error("Couldn't delete your profile");
      setDeleting(false);
      return;
    }

    await signOut();
    toast.success("Your account data has been deleted");
    navigate("/");
  };

  if (authLoading || !user) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl text-foreground mb-8">Settings</h1>

      {/* Profile */}
      <section className="mb-10">
        <h2 className="font-display text-lg text-foreground mb-4">Profile</h2>
        <div className="space-y-4 rounded-lg border bg-card p-5 card-shadow">
          <div>
            <Label htmlFor="displayName" className="text-sm">Display name</Label>
            <div className="relative mt-1.5">
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={saveDisplayName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={savingName}
              />
              {savedFlash && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs text-primary animate-in fade-in">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="email" className="text-sm">Email</Label>
            <Input id="email" value={user.email ?? ""} readOnly className="mt-1.5 bg-muted text-muted-foreground" />
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="mb-10">
        <h2 className="font-display text-lg text-foreground mb-4">My Highlights</h2>
        <div className="rounded-lg border bg-card p-5 card-shadow space-y-5">
          {statsLoading || !stats ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="font-display text-2xl text-foreground">{stats.total}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total</div>
                </div>
                <div>
                  <div className="font-display text-2xl text-foreground">{stats.privateCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Private</div>
                </div>
                <div>
                  <div className="font-display text-2xl text-foreground">{stats.kindleCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">From Kindle</div>
                </div>
              </div>

              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="visibility" className="text-sm font-medium">Show my highlights publicly</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    When off, all your highlights are private and only visible to you.
                  </p>
                </div>
                <Switch
                  id="visibility"
                  checked={highlightsPublic}
                  onCheckedChange={handleVisibilityToggle}
                  disabled={updatingVisibility || stats.total === 0}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Account */}
      <section className="mb-10">
        <h2 className="font-display text-lg text-foreground mb-4">Account</h2>
        <div className="rounded-lg border bg-card p-5 card-shadow space-y-3">
          <Button variant="outline" onClick={handleSignOut} className="w-full sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>

          <Separator />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full sm:w-auto">
                <Trash2 className="mr-2 h-4 w-4" /> Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This is permanent and cannot be undone. All your highlights and your profile will be deleted.
                  Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="my-2"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete forever"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      {/* Confirm public toggle */}
      <AlertDialog open={showVisibilityConfirm} onOpenChange={setShowVisibilityConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make your highlights public?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make all your highlights visible to other users. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPublic(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPublic !== null) applyVisibility(pendingPublic);
                setPendingPublic(null);
              }}
            >
              Yes, make public
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
