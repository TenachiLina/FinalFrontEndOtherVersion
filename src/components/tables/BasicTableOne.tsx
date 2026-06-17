"use client";
import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Badge from "../ui/badge/Badge";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  _id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
  baseSalary: number;
  address?: string;
  phoneNumber?: string;
  personalImage?: string;
}

type SortKey = "empNumber" | "name" | "baseSalary" | "address" | "phoneNumber";
type SortDir = "asc" | "desc";

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

const getEmployees  = ()                                     => apiFetch<Employee[]>("/employees");
const createEmployee= (body: Omit<Employee, "_id">)          => apiFetch<Employee>("/employees", { method: "POST", body: JSON.stringify(body) });
const updateEmployee= (id: string, body: Partial<Employee>)  => apiFetch<Employee>(`/employees/${id}`, { method: "PUT", body: JSON.stringify(body) });
const deleteEmployee= (id: string)                           => apiFetch<unknown>(`/employees/${id}`, { method: "DELETE" });

// ─── Icons ────────────────────────────────────────────────────────────────────

const TrashIcon = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>);
const EditIcon  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const PlusIcon  = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const CloseIcon = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
const SortIcon  = ({ active, dir }: { active: boolean; dir: SortDir }) => (
  <svg className={`inline ml-1 w-3 h-3 ${active ? "text-blue-500" : "text-gray-300 dark:text-gray-600"}`} viewBox="0 0 10 14" fill="none">
    <path d={dir === "asc" && active ? "M5 1v12M1 5l4-4 4 4" : "M5 1v12M1 9l4 4 4-4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = () => ({
  empNumber: "", firstName: "", lastName: "",
  baseSalary: "", address: "", phoneNumber: "", personalImage: "",
});

// ── Field helper ──────────────────────────────────────────────────────────
 // ── Field helper — OUTSIDE the component ─────────────────────────────────────
const Field = ({
  label, name, type = "text", value, onChange,
}: {
  label: string; name: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
    <input type={type} name={name} value={value} onChange={onChange}
      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 transition"
    />
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function BasicTableOne() {
  const [data,        setData]        = useState<Employee[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [apiError,    setApiError]    = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

  const [search,      setSearch]      = useState("");
  const [showEntries, setShowEntries] = useState(5);
  const [sortKey,     setSortKey]     = useState<SortKey>("empNumber");
  const [sortDir,     setSortDir]     = useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm,    setShowForm]    = useState(false);
  const [isEditing,   setIsEditing]   = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [form,        setForm]        = useState(emptyForm());

  // ── Load from API ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    getEmployees()
      .then(setData)
      .catch((e) => setApiError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Sort / filter / paginate ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter((e) =>
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      String(e.empNumber).includes(q) ||
      (e.address ?? "").toLowerCase().includes(q) ||
      (e.phoneNumber ?? "").toLowerCase().includes(q)
    );
  }, [search, data]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "name") { av = `${a.firstName} ${a.lastName}`; bv = `${b.firstName} ${b.lastName}`; }
      else { av = (a as any)[sortKey]; bv = (b as any)[sortKey]; }
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""));
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / showEntries));
  const paginated  = sorted.slice((currentPage - 1) * showEntries, currentPage * showEntries);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // ── Form handlers ─────────────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const openAdd = () => {
    setForm(emptyForm());
    setIsEditing(false);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setForm({
      empNumber:     String(emp.empNumber),
      firstName:     emp.firstName,
      lastName:      emp.lastName,
      baseSalary:    String(emp.baseSalary),
      address:       emp.address    ?? "",
      phoneNumber:   emp.phoneNumber ?? "",
      personalImage: emp.personalImage ?? "",
    });
    setIsEditing(true);
    setEditingId(emp._id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      alert("First name and last name are required.");
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      const payload = {
        empNumber:     Number(form.empNumber),
        firstName:     form.firstName,
        lastName:      form.lastName,
        baseSalary:    Number(form.baseSalary),
        address:       form.address    || undefined,
        phoneNumber:   form.phoneNumber || undefined,
        personalImage: form.personalImage || undefined,
      };

      if (isEditing && editingId) {
        const updated = await updateEmployee(editingId, payload);
        setData((prev) => prev.map((e) => e._id === editingId ? updated : e));
      } else {
        const created = await createEmployee(payload as Omit<Employee, "_id">);
        setData((prev) => [...prev, created]);
      }
      setShowForm(false);
      setForm(emptyForm());
    } catch (e) {
      setApiError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this employee?")) return;
    try {
      await deleteEmployee(id);
      setData((prev) => prev.filter((e) => e._id !== id));
    } catch (e) {
      alert(`Delete failed: ${e}`);
    }
  };

  

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Drawer */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/[0.07]">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">{isEditing ? "Edit Employee" : "Add Employee"}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><CloseIcon /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              {apiError && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600">⚠ {apiError}</div>}
<Field label="Employee Number" name="empNumber" type="number" value={form.empNumber} onChange={handleChange} />
              <div className="grid grid-cols-2 gap-3">
<Field label="First Name"  name="firstName" value={form.firstName} onChange={handleChange} />
<Field label="Last Name"   name="lastName"  value={form.lastName}  onChange={handleChange} />
              </div>
<Field label="Base Salary" name="baseSalary" type="number" value={form.baseSalary} onChange={handleChange} />
<Field label="Address"     name="address"    value={form.address}   onChange={handleChange} />
<Field label="Phone"       name="phoneNumber" value={form.phoneNumber} onChange={handleChange} />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-white/[0.07]">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.05] transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table Card */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap border-b border-gray-100 dark:border-white/[0.05]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Employees Management</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Show</span>
              <select value={showEntries} onChange={(e) => { setShowEntries(Number(e.target.value)); setCurrentPage(1); }}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-300 focus:outline-none">
                {[5,10,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input type="text" placeholder="Search..." value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
              />
            </div>
            <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              <PlusIcon /> Add Employee
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/60 dark:bg-white/[0.02]">
                {([
                  { label: "Emp #",       key: "empNumber"   },
                  { label: "Photo",       key: null          },
                  { label: "First Name",  key: "name"        },
                  { label: "Last Name",   key: "name"        },
                  { label: "Base Salary", key: "baseSalary"  },
                  { label: "Address",     key: "address"     },
                  { label: "Phone",       key: "phoneNumber" },
                  { label: "Actions",     key: null          },
                ] as { label: string; key: SortKey | null }[]).map(({ label, key }) => (
                  <th key={label}
                    onClick={() => key && handleSort(key)}
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap ${key ? "cursor-pointer hover:text-gray-700 dark:hover:text-gray-200" : ""}`}
                  >
                    {label} {key && <SortIcon active={sortKey === key} dir={sortDir} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400 animate-pulse">Loading employees…</td></tr>
              ) : apiError ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-red-400">⚠ {apiError}</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">No employees found.</td></tr>
              ) : paginated.map((emp) => (
                <tr key={emp._id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400 font-mono">{emp.empNumber}</td>
                  <td className="px-4 py-4">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 ring-2 ring-gray-100 dark:ring-white/[0.07] flex items-center justify-center text-sm font-semibold text-gray-500">
                      {emp.personalImage
                        ? <Image width={40} height={40} src={emp.personalImage} alt={emp.firstName} className="w-full h-full object-cover" />
                        : `${emp.firstName[0]}${emp.lastName[0]}`
                      }
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-800 dark:text-white/90">{emp.firstName}</td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-800 dark:text-white/90">{emp.lastName}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300 font-medium">${Number(emp.baseSalary).toLocaleString()}</td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{emp.address ?? "—"}</td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400 font-mono">{emp.phoneNumber ?? "—"}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3 text-gray-400">
                      <button onClick={() => handleDelete(emp._id)} className="hover:text-red-500 transition-colors" title="Delete"><TrashIcon /></button>
                      <button onClick={() => openEdit(emp)} className="hover:text-blue-500 transition-colors" title="Edit"><EditIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-white/[0.05] text-sm text-gray-500 dark:text-gray-400 flex-wrap gap-3">
          <span>Showing {sorted.length === 0 ? 0 : (currentPage - 1) * showEntries + 1}–{Math.min(currentPage * showEntries, sorted.length)} of {sorted.length} entries</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-white/[0.1] dark:hover:bg-white/[0.05] transition-colors">
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setCurrentPage(p)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${p === currentPage ? "border-blue-500 bg-blue-600 text-white" : "border-gray-200 hover:bg-gray-50 dark:border-white/[0.1] dark:hover:bg-white/[0.05]"}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-white/[0.1] dark:hover:bg-white/[0.05] transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}