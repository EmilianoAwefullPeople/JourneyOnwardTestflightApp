// User Model
// Represents user profile data

export interface User {
  id?: string; // UUID (optional for local-only users)
  name: string;
  email?: string;
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
}
