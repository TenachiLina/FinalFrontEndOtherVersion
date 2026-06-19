// Place at: src/hooks/useShiftsManagement.ts
import { useState, useCallback, useEffect } from "react";
import { useModal } from "@/hooks/useModal";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ManagedShift {
  _id: string;
  name?: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isArchived: boolean;
}

type ShiftView = "active" | "archived";
type ShiftForm = { name: string; startTime: string; endTime: string };

const emptyForm: ShiftForm = { name: "", startTime: "", endTime: "" };

export const useShiftsManagement = () => {
  const { isOpen, openModal, closeModal } = useModal();

  const [view, setView] = useState<ShiftView>("active");
  const [shifts, setShifts] = useState<ManagedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingShift, setEditingShift] = useState<ManagedShift | null>(null);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Permanent delete confirmation. usageCount is filled in only after the
  // backend tells us the shift is still referenced by saved planning entries.
  const [pendingDelete, setPendingDelete] = useState<{ shift: ManagedShift; usageCount?: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchShifts = useCallback((targetView: ShiftView) => {
    setLoading(true);
    setError(null);
    apiFetch<ManagedShift[]>(`/shifts?status=${targetView}`)
      .then(setShifts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchShifts(view);
  }, [view, fetchShifts]);

  const switchView = useCallback((next: ShiftView) => setView(next), []);

  // ── Add / Edit modal ──────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setModalMode("add");
    setEditingShift(null);
    setForm(emptyForm);
    setFormError(null);
    openModal();
  }, [openModal]);

  const openEditModal = useCallback(
    (shift: ManagedShift) => {
      setModalMode("edit");
      setEditingShift(shift);
      setForm({ name: shift.name ?? "", startTime: shift.startTime, endTime: shift.endTime });
      setFormError(null);
      openModal();
    },
    [openModal]
  );

  const closeShiftModal = useCallback(() => {
    closeModal();
    setEditingShift(null);
    setForm(emptyForm);
    setFormError(null);
  }, [closeModal]);

  const updateForm = useCallback((field: keyof ShiftForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.startTime || !form.endTime) {
      setFormError("Start time and end time are required.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError("End time must be after start time.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim() || undefined,
        startTime: form.startTime,
        endTime: form.endTime,
      };
      if (modalMode === "add") {
        const created = await apiFetch<ManagedShift>("/shifts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (view === "active") setShifts((prev) => [...prev, created]);
      } else if (editingShift) {
        const updated = await apiFetch<ManagedShift>(`/shifts/${editingShift._id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setShifts((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      }
      closeShiftModal();
    } catch (e) {
      setFormError("Could not save this shift. " + String(e));
    } finally {
      setSaving(false);
    }
  }, [form, modalMode, editingShift, view, closeShiftModal]);

  // ── Archive / Restore ─────────────────────────────────────────────
  const archiveShift = useCallback(async (shift: ManagedShift) => {
    try {
      await apiFetch(`/shifts/${shift._id}/archive`, { method: "PATCH" });
      setShifts((prev) => prev.filter((s) => s._id !== shift._id));
    } catch (e) {
      setError("Could not archive this shift. " + String(e));
    }
  }, []);

  const restoreShift = useCallback(async (shift: ManagedShift) => {
    try {
      await apiFetch(`/shifts/${shift._id}/restore`, { method: "PATCH" });
      setShifts((prev) => prev.filter((s) => s._id !== shift._id));
    } catch (e) {
      setError("Could not restore this shift. " + String(e));
    }
  }, []);

  // ── Permanent delete (guarded by usage check) ────────────────────
  const requestDelete = useCallback((shift: ManagedShift) => setPendingDelete({ shift }), []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = useCallback(
    async (force = false) => {
      if (!pendingDelete) return;
      setDeleting(true);
      try {
        await apiFetch(`/shifts/${pendingDelete.shift._id}${force ? "?force=true" : ""}`, { method: "DELETE" });
        setShifts((prev) => prev.filter((s) => s._id !== pendingDelete.shift._id));
        setPendingDelete(null);
      } catch (e) {
        const message = String(e);
        if (message.startsWith("409")) {
          // Backend returned a usage count — surface it and let the manager confirm a forced delete.
          const match = message.match(/"usageCount":(\d+)/);
          setPendingDelete((prev) => (prev ? { ...prev, usageCount: match ? Number(match[1]) : 0 } : prev));
        } else {
          setError("Could not delete this shift. " + message);
          setPendingDelete(null);
        }
      } finally {
        setDeleting(false);
      }
    },
    [pendingDelete]
  );

  return {
    view,
    switchView,
    shifts,
    loading,
    error,
    isOpen,
    modalMode,
    editingShift,
    form,
    updateForm,
    formError,
    saving,
    openAddModal,
    openEditModal,
    closeShiftModal,
    handleSubmit,
    archiveShift,
    restoreShift,
    pendingDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
    deleting,
  };
};