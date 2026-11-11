// employee.api.ts
// Place this in src/components/ or alongside your form component.
import { API_BASE_URL } from "@/lib/config";
import { ensureOk } from "@/lib/errors";

export interface EmployeePayload {
  empNumber: number;
  firstName: string;
  lastName: string;
  baseSalary: number;
  address?: string;
  phoneNumber?: string;
  personalImage?: string;
  jobTitle?: string;
  familyStatus?: string;
  birthDate?: string;
  hireDate?: string;
  /** Also the insurance number */
  socialSecurityNumber?: string;
  insured?: boolean;
  /** null clears it */
  declaredSalary?: number | null;
}

export interface EmployeeRecord extends EmployeePayload {
  _id: string;
  // Set by the API, for a manager, on other managers' records
  otherManager?: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  await ensureOk(res);
  // A delete may be confirmed with "204 No Content": nothing to read
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const getEmployees = () => request<EmployeeRecord[]>("/employees");
export const getEmployee = (id: string) => request<EmployeeRecord>(`/employees/${id}`);
export const createEmployee = (body: EmployeePayload) => request<EmployeeRecord>("/employees", { method: "POST", body: JSON.stringify(body) });
export const updateEmployee = (id: string, body: Partial<EmployeePayload>) => request<EmployeeRecord>(`/employees/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteEmployee = (id: string) => request<{ deleted: boolean }>(`/employees/${id}`, { method: "DELETE" });
