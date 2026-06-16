export interface Employee {
  id: number;
  user: {
    image: string;
    name: string;
    PhoneNumber: string;
  };
 
  // Legacy fields (kept for backward compatibility)
  salary?: string;
  Address?: string;
 
  // New fields
  emp_number: number;
  FirstName: string;
  LastName: string;
  position: string;
  Base_salary: number;
  address: string;
  phone_number: string;
 
  status: "Vacation" | "In Progress" | "Terminated";
}
 