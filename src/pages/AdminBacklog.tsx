import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BacklogItem = Tables<"backlog_items">;
type Priority = "next" | "later" | "someday";
type Status = "open" | "in_progress" | "done";

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: "next", label: "Next" },
  { key: "later", label: "Later" },
  { key: "someday", label: "Someday" },
];
const STATUS_LABEL: Record<Status, string> = { open: "Open", in_progress: "In progress", done: "Done" };
const COLUMNS = "id, title, notes, area, priority, status, sort_order, created_at, updated_at, done_at";
const QUERY_KEY = ["admin-backlog"];
const ALL_AREAS = "__all__";

type Form = { title: string; notes: string; area: string; priority: Priority; status: Status };
const EMPTY_FORM: Form = { title: "", notes: "", area: "General", priority: "later", status: "open" };

const AdminBacklog = () => {
  const { user, authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState(ALL_AREAS);
  const [showDone, setShowDone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BacklogItem | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("backlog_items")
        .select(COLUMNS)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (qErr) throw qErr;
      return (data ?? []) as BacklogItem[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  // New items go after the last one in their priority group.
  const nextSortOrder = (priority: Priority) =>
    items.filter((i) => i.priority === priority).reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;

  const saveMutation = useMutation({
    mutationFn: async ({ id, values, previous }: { id: string | null; values: Form; previous: BacklogItem | null }) => {
      const now = new Date().toISOString();
      const becomesDone = values.status === "done";
      const wasDone = previous?.status === "done";
      const done_at = becomesDone ? (wasDone ? previous?.done_at ?? now : now) : null;
      const base = {
        title: values.title.trim(),
        notes: values.notes.trim() || null,
        area: values.area.trim() || "General",
        priority: values.priority,
        status: values.status,
        done_at,
        updated_at: now,
      };
      if (id && previous) {
        // Changing priority moves the item to the end of its new group.
        const sort_order = previous.priority === values.priority ? previous.sort_order : nextSortOrder(values.priority);
        const { error: uErr } = await supabase.from("backlog_items").update({ ...base, sort_order }).eq("id", id);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase
          .from("backlog_items")
          .insert({ ...base, sort_order: nextSortOrder(values.priority) });
        if (iErr) throw iErr;
      }
    },
    onSuccess: () => {
      setSheetOpen(false);
      refresh();
    },
    onError: (e) => {
      console.error("[Backlog] save failed", e);
      toast.error("Could not save this item");
    },
  });

  const toggleDoneMutation = useMutation({
    mutationFn: async ({ item, done }: { item: BacklogItem; done: boolean }) => {
      const now = new Date().toISOString();
      const patch = done
        ? { status: "done", done_at: now, updated_at: now }
        : { status: "open", done_at: null, updated_at: now };
      const { error: tErr } = await supabase.from("backlog_items").update(patch).eq("id", item.id);
      if (tErr) throw tErr;
    },
    onSuccess: refresh,
    onError: (e) => {
      console.error("[Backlog] toggle failed", e);
      toast.error("Could not update this item");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: dErr } = await supabase.from("backlog_items").delete().eq("id", id);
      if (dErr) throw dErr;
    },
    onSuccess: () => {
      setConfirmDelete(false);
      setSheetOpen(false);
      refresh();
    },
    onError: (e) => {
      console.error("[Backlog] delete failed", e);
      toast.error("Could not delete this item");
    },
  });

  const areas = useMemo(() => Array.from(new Set(items.map((i) => i.area))).sort((a, b) => a.localeCompare(b)), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!showDone && i.status === "done") return false;
      if (areaFilter !== ALL_AREAS && i.area !== areaFilter) return false;
      if (q && !`${i.title} ${i.notes ?? ""} ${i.area}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, areaFilter, showDone]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (item: BacklogItem) => {
    setEditing(item);
    setForm({
      title: item.title,
      notes: item.notes ?? "",
      area: item.area,
      priority: item.priority as Priority,
      status: item.status as Status,
    });
    setSheetOpen(true);
  };

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  const canSave = form.title.trim().length > 0 && !saveMutation.isPending;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Admin
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold text-foreground">Backlog</h1>
          <p className="mt-2 text-muted-foreground">Things to build, fix and try next</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add item
        </Button>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, notes or area…"
            className="pl-9"
          />
        </div>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_AREAS}>All areas</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox id="show-done" checked={showDone} onCheckedChange={(c) => setShowDone(c === true)} />
          <Label htmlFor="show-done" className="text-sm font-normal">
            Include done
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load the backlog. Please refresh and try again.
        </p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Nothing matches.</p>
      ) : (
        <div className="space-y-8">
          {PRIORITIES.map(({ key, label }) => {
            const group = visible.filter((i) => i.priority === key);
            if (group.length === 0) return null;
            return (
              <section key={key}>
                <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
                  {label} <span className="text-sm font-normal text-muted-foreground">· {group.length}</span>
                </h2>
                <ul className="divide-y rounded-lg border bg-card">
                  {group.map((item) => {
                    const done = item.status === "done";
                    return (
                      <li key={item.id} className="flex items-start gap-3 p-3">
                        <Checkbox
                          className="mt-1"
                          checked={done}
                          disabled={toggleDoneMutation.isPending}
                          onCheckedChange={(c) => toggleDoneMutation.mutate({ item, done: c === true })}
                          aria-label={done ? "Mark as not done" : "Mark as done"}
                        />
                        <button type="button" onClick={() => openEdit(item)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`break-words font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                              {item.title}
                            </span>
                            <Badge variant="outline" className="font-normal">
                              {item.area}
                            </Badge>
                            <Badge variant={item.status === "in_progress" ? "default" : "secondary"} className="font-normal">
                              {STATUS_LABEL[item.status as Status] ?? item.status}
                            </Badge>
                          </div>
                          {item.notes && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{item.notes}</p>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit item" : "Add item"}</SheetTitle>
            <SheetDescription>{editing ? "Update this backlog item." : "Add something to the backlog."}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bl-title">Title</Label>
              <Input id="bl-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-notes">Notes</Label>
              <Textarea
                id="bl-notes"
                rows={5}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-area">Area</Label>
              <Input
                id="bl-area"
                list="bl-areas"
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              />
              <datalist id="bl-areas">
                {areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <SheetFooter className="mt-8 gap-2 sm:justify-between">
            {editing ? (
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)} className="text-destructive">
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canSave}
                onClick={() => saveMutation.mutate({ id: editing?.id ?? null, values: form, previous: editing })}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {editing ? `"${editing.title}" will be removed from the backlog. This cannot be undone.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (editing) deleteMutation.mutate(editing.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBacklog;
