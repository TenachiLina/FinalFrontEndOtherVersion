// employee.api.ts
// Place this in src/components/ or alongside your form component.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface EmployeePayload {
  empNumber: number;
  firstName: string;
  lastName: string;
  baseSalary: number;
  address?: string;
  phoneNumber?: string;
  personalImage?: string;
}

export interface EmployeeRecord extends EmployeePayload {
  _id: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[employees] ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const getEmployees  = ()                              => request<EmployeeRecord[]>("/employees");
export const getEmployee   = (id: string)                    => request<EmployeeRecord>(`/employees/${id}`);
export const createEmployee= (body: EmployeePayload)         => request<EmployeeRecord>("/employees", { method: "POST", body: JSON.stringify(body) });
export const updateEmployee= (id: string, body: Partial<EmployeePayload>) => request<EmployeeRecord>(`/employees/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteEmployee= (id: string)                    => request<{ deleted: boolean }>(`/employees/${id}`, { method: "DELETE" });
