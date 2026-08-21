"use client";

import React, { useEffect, useMemo, useState } from "react";

interface AttendanceLog {
  _id?: string;
  deviceUserId: string;
  timestamp: string;
  deviceLogId?: string;
  processed?: boolean;

  // Employee information returned by backend
  employeeNumber?: string | number;
  firstName?: string;
  lastName?: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const PAGE_SIZE = 15;

function formatDateTime(timestamp: string) {
  const d = new Date(timestamp);

  if (Number.isNaN(d.getTime())) {
    return timestamp;
  }

  // IMPORTANT:
  // We don't want the +1 hour problem you had earlier.
  // Read the timestamp as it was stored by the attendance system.
  const match = timestamp.match(
    /T(\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (match) {
    const date = timestamp.substring(0, 10).split("-");

    return `${date[2]}/${date[1]}/${date[0]} ${match[1]}:${match[2]}${
      match[3] ? `:${match[3]}` : ""
    }`;
  }

  return timestamp;
}

function normalizeDeviceId(value: string) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function formatDateForInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ClockInLogsPage() {
  const today = new Date();

  const [fromDate, setFromDate] = useState(
    formatDateForInput(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 50)
    )
  );

  const [toDate, setToDate] = useState(formatDateForInput(today));

  const [search, setSearch] = useState("");

  const [logs, setLogs] = useState<AttendanceLog[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(
    new Set()
  );

  const [showAddModal, setShowAddModal] = useState(false);

  const [newPunch, setNewPunch] = useState({
    deviceUserId: "",
    timestamp: "",
  });

  const [deviceStatus, setDeviceStatus] = useState<{
  connected: boolean;
  name: string;
  ip?: string;
} | null>(null);

  // ---------------------------------------------------------
  // LOAD ATTENDANCE LOGS
  // ---------------------------------------------------------

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const url =
        `${API_BASE_URL}/attendance/device-logs` +
        `?from=${encodeURIComponent(fromDate)}` +
        `&to=${encodeURIComponent(toDate)}`;

      const response = await fetch(url, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to load attendance logs (${response.status})`
        );
      }

      const data = await response.json();

      const receivedLogs = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setLogs(receivedLogs);
      setPage(1);
      setSelectedLogs(new Set());
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load attendance logs"
      );

      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Load initially
  useEffect(() => {
    loadLogs();
  }, []);

  // ---------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------

  const filteredLogs = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) {
      return logs;
    }

    return logs.filter((log) => {
      const deviceId = normalizeDeviceId(log.deviceUserId);

      return (
        deviceId.toLowerCase().includes(query) ||
        String(log.employeeNumber ?? "")
          .toLowerCase()
          .includes(query) ||
        String(log.firstName ?? "")
          .toLowerCase()
          .includes(query) ||
        String(log.lastName ?? "")
          .toLowerCase()
          .includes(query) ||
        String(log.deviceLogId ?? "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [logs, search]);

  // ---------------------------------------------------------
  // SORT
  // ---------------------------------------------------------

  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    );
  }, [filteredLogs]);

  // ---------------------------------------------------------
  // PAGINATION
  // ---------------------------------------------------------

  const totalPages = Math.max(
    1,
    Math.ceil(sortedLogs.length / PAGE_SIZE)
  );

  const currentLogs = sortedLogs.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
  let cancelled = false;

  const checkDeviceStatus = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/device/status",
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!cancelled) {
        setDeviceStatus(data);
      }
    } catch {
      if (!cancelled) {
        setDeviceStatus({
          connected: false,
          name: "Face Recognition Machine",
        });
      }
    }
  };

  checkDeviceStatus();

  const interval = setInterval(checkDeviceStatus, 30000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, []);
  // ---------------------------------------------------------
  // SELECT LOG
  // ---------------------------------------------------------

  const toggleSelected = (id: string) => {
    setSelectedLogs((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const toggleAll = () => {
    if (currentLogs.length === 0) return;

    const allSelected = currentLogs.every((log) =>
      selectedLogs.has(log._id ?? log.deviceLogId ?? "")
    );

    setSelectedLogs((previous) => {
      const next = new Set(previous);

      currentLogs.forEach((log) => {
        const id = log._id ?? log.deviceLogId ?? "";

        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });

      return next;
    });
  };
 
  // ---------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------

  const deleteSelected = async () => {
    if (selectedLogs.size === 0) {
      alert("Sélectionnez au moins un pointage.");
      return;
    }

    if (
      !window.confirm(
        `Supprimer ${selectedLogs.size} pointage(s) ?`
      )
    ) {
      return;
    }

    try {
      for (const id of selectedLogs) {
        await fetch(
          `${API_BASE_URL}/attendance/device-logs/${id}`,
          {
            method: "DELETE",
          }
        );
      }

      await loadLogs();
    } catch (err) {
      console.error(err);

      setError("Impossible de supprimer les pointages.");
    }
  };

  // ---------------------------------------------------------
  // ADD PUNCH
  // ---------------------------------------------------------

  const addPunch = async () => {
    if (!newPunch.deviceUserId || !newPunch.timestamp) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/attendance/device-logs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceUserId: newPunch.deviceUserId,
            timestamp: new Date(newPunch.timestamp).toISOString(),
            processed: false,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to create punch");
      }

      setShowAddModal(false);

      setNewPunch({
        deviceUserId: "",
        timestamp: "",
      });

      await loadLogs();
    } catch (err) {
      console.error(err);

      setError("Impossible d'ajouter le pointage.");
    }
  };

  

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------

  return (
    <div className="min-h-screen bg-white p-5">

      {/* HEADER */}
      <div className="mb-4">

        <h1 className="text-xl font-semibold text-gray-700">
          Pointage
        </h1>

      </div>

      {/* FILTER BAR */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">

        {/* FROM */}
        <div className="relative">

          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="
              h-9
              rounded-md
              border
              border-gray-300
              bg-white
              px-3
              text-sm
              text-gray-700
              outline-none
              focus:border-blue-400
            "
          />

        </div>

        <span className="text-gray-500">
          →
        </span>

        {/* TO */}
        <div>

          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="
              h-9
              rounded-md
              border
              border-gray-300
              bg-white
              px-3
              text-sm
              text-gray-700
              outline-none
              focus:border-blue-400
            "
          />

        </div>

        {/* SEARCH */}
        <div className="ml-2 flex h-9">

          <input
            type="text"
            placeholder="Recherche"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="
              w-56
              rounded-l-md
              border
              border-gray-300
              px-3
              text-sm
              outline-none
              focus:border-blue-400
            "
          />

          <button
            onClick={loadLogs}
            className="
              rounded-r-md
              bg-gray-200
              px-4
              text-sm
              text-gray-700
              hover:bg-gray-300
            "
          >
            🔍
          </button>

        </div>

      </div>

      {/* ACTION BAR */}
      <div className="mb-4 flex gap-2">

        <button
          onClick={() => setShowAddModal(true)}
          className="
            rounded-md
            bg-[#c98573]
            px-5
            py-2
            text-sm
            font-medium
            text-white
            shadow-sm
            hover:bg-[#b87565]
          "
        >
          Ajouter pointage
        </button>

        <button
          onClick={deleteSelected}
          className="
            rounded-md
            bg-[#c98573]
            px-5
            py-2
            text-sm
            font-medium
            text-white
            shadow-sm
            hover:bg-[#b87565]
          "
        >
          🗑 supprimer
        </button>

      </div>

      {/* ERROR */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* TABLE */}
      <div className="overflow-hidden rounded-md border border-gray-200">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[900px] border-collapse">

            <thead>

              <tr className="bg-[#e5edf7] text-gray-600">

                <th className="w-10 border-b border-gray-200 px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={
                      currentLogs.length > 0 &&
                      currentLogs.every((log) =>
                        selectedLogs.has(
                          log._id ?? log.deviceLogId ?? ""
                        )
                      )
                    }
                    onChange={toggleAll}
                  />
                </th>

                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Numéro
                </th>

                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Nom
                </th>

                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Prénom
                </th>

                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Date et heure pointage
                </th>

                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Pointage
                </th>

                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  ID
                </th>

              </tr>

            </thead>

            <tbody>

              {loading ? (

                <tr>

                  <td
                    colSpan={7}
                    className="py-10 text-center text-sm text-gray-400"
                  >
                    Chargement des pointages...
                  </td>

                </tr>

              ) : currentLogs.length === 0 ? (

                <tr>

                  <td
                    colSpan={7}
                    className="py-10 text-center text-sm text-gray-400"
                  >
                    Aucun pointage trouvé.
                  </td>

                </tr>

              ) : (

                currentLogs.map((log, index) => {

                  const id =
                    log._id ??
                    log.deviceLogId ??
                    `${log.deviceUserId}-${log.timestamp}-${index}`;

                  return (

                    <tr
                      key={id}
                      className={`
                        ${
                          index % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50/50"
                        }
                        hover:bg-blue-50
                      `}
                    >

                      <td className="border-b border-gray-100 px-3 py-2 text-center">

                        <input
                          type="checkbox"
                          checked={selectedLogs.has(id)}
                          onChange={() =>
                            toggleSelected(id)
                          }
                        />

                      </td>

                      {/* EMPLOYEE NUMBER */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">

                        {log.employeeNumber ??
                          normalizeDeviceId(
                            log.deviceUserId
                          )}

                      </td>

                      {/* LAST NAME */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">

                        {log.lastName ?? "—"}

                      </td>

                      {/* FIRST NAME */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">

                        {log.firstName ?? "—"}

                      </td>

                      {/* DATE */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">

                        {formatDateTime(log.timestamp)}

                      </td>

                      {/* PUNCH */}
                      <td className="border-b border-gray-100 px-4 py-2">

                        <span className="
                          inline-flex
                          rounded-md
                          bg-green-100
                          px-2
                          py-1
                          text-xs
                          font-medium
                          text-green-700
                        ">
                          Pointage
                        </span>

                      </td>

                      {/* MACHINE LOG ID */}
                      <td className="border-b border-gray-100 px-4 py-2 text-xs font-mono text-gray-400">

                        {log.deviceLogId ?? "—"}

                      </td>

                    </tr>

                  );
                })

              )}

            </tbody>

          </table>

        </div>

      </div>

      {/* PAGINATION */}
      <div className="mt-3 flex items-center justify-end gap-1">

        <button
          disabled={page === 1}
          onClick={() =>
            setPage((p) => Math.max(1, p - 1))
          }
          className="
            rounded
            border
            border-gray-200
            px-3
            py-1.5
            text-sm
            text-gray-500
            disabled:cursor-not-allowed
            disabled:opacity-40
            hover:bg-gray-50
          "
        >
          «
        </button>

        {Array.from(
          { length: Math.min(totalPages, 5) },
          (_, i) => i + 1
        ).map((number) => (

          <button
            key={number}
            onClick={() => setPage(number)}
            className={`
              rounded
              border
              px-3
              py-1.5
              text-sm
              ${
                page === number
                  ? "border-gray-300 bg-gray-200 text-gray-700"
                  : "border-transparent text-gray-500 hover:bg-gray-100"
              }
            `}
          >
            {number}
          </button>

        ))}

        <button
          disabled={page >= totalPages}
          onClick={() =>
            setPage((p) =>
              Math.min(totalPages, p + 1)
            )
          }
          className="
            rounded
            border
            border-gray-200
            px-3
            py-1.5
            text-sm
            text-gray-500
            disabled:cursor-not-allowed
            disabled:opacity-40
            hover:bg-gray-50
          "
        >
          »
        </button>

      </div>

      {/* ADD MODAL */}
      {showAddModal && (

        <div className="
          fixed
          inset-0
          z-50
          flex
          items-center
          justify-center
          bg-black/40
        ">

          <div className="
            w-[420px]
            rounded-xl
            bg-white
            p-6
            shadow-2xl
          ">

            <div className="mb-5 flex items-center justify-between">

              <h2 className="text-lg font-semibold text-gray-800">
                Ajouter un pointage
              </h2>

              <button
                onClick={() => setShowAddModal(false)}
                className="text-xl text-gray-400 hover:text-gray-700"
              >
                ×
              </button>

            </div>

            <div className="space-y-4">

              <div>

                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Numéro employé
                </label>

                <input
                  type="text"
                  value={newPunch.deviceUserId}
                  onChange={(e) =>
                    setNewPunch((p) => ({
                      ...p,
                      deviceUserId: e.target.value,
                    }))
                  }
                  placeholder="Ex: 104"
                  className="
                    w-full
                    rounded-lg
                    border
                    border-gray-300
                    px-3
                    py-2
                    text-sm
                    outline-none
                    focus:border-blue-500
                  "
                />

              </div>

              <div>

                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Date et heure
                </label>

                <input
                  type="datetime-local"
                  value={newPunch.timestamp}
                  onChange={(e) =>
                    setNewPunch((p) => ({
                      ...p,
                      timestamp: e.target.value,
                    }))
                  }
                  className="
                    w-full
                    rounded-lg
                    border
                    border-gray-300
                    px-3
                    py-2
                    text-sm
                    outline-none
                    focus:border-blue-500
                  "
                />

              </div>

            </div>

            <div className="mt-6 flex justify-end gap-2">

              <button
                onClick={() =>
                  setShowAddModal(false)
                }
                className="
                  rounded-lg
                  border
                  border-gray-300
                  px-4
                  py-2
                  text-sm
                  text-gray-600
                "
              >
                Annuler
              </button>

              <button
                onClick={addPunch}
                className="
                  rounded-lg
                  bg-[#c98573]
                  px-5
                  py-2
                  text-sm
                  font-medium
                  text-white
                "
              >
                Ajouter
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}