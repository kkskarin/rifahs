import type { Profile } from "./types";
export const isAdmin = (p: Pick<Profile, "role">) => p.role === "owner" || p.role === "admin";
