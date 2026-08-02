import {
  Boxes,
  BrainCircuit,
  Building2,
  CircuitBoard,
  Cog,
  Cpu,
  Database,
  Network,
  RadioTower,
  Router,
  ShieldCheck,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import type { Department } from "@/api/types";

/**
 * One icon per department, so the admin dashboard cards are distinguishable at a glance rather than
 * twelve identical tiles of long text.
 *
 * Typed as a total `Record<Department, …>`: adding a department to the canonical list without giving
 * it an icon is a compile error, not a card that silently renders blank.
 */
export const DEPARTMENT_ICONS: Record<Department, LucideIcon> = {
  "B.E. Computer Engineering": Cpu,
  "B.E. Information Technology": Network,
  "B.E. Electronics & Tele-Communication": RadioTower,
  "B.E. Electronics and Computer Science": CircuitBoard,
  "B.E. Mechanical Engineering": Cog,
  "B.E. Civil Engineering": Building2,
  "B.E. Computer Science and Engineering (Cyber Security)": ShieldCheck,
  "B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)": Boxes,
  "B.Tech – Artificial Intelligence & Machine Learning": BrainCircuit,
  "B.Tech – Artificial Intelligence & Data Science": Database,
  "B.Tech – Internet of Things (IoT)": Wifi,
  "B.Tech – Computer Science & Engineering (CSE-IOT)": Router,
};

/**
 * A compact label for a card face. The full name is still shown; this is the "B.E." / "B.Tech" prefix
 * split out so the grid reads as a hierarchy rather than twelve wrapped sentences.
 */
export function splitDepartmentName(department: Department): { programme: string; title: string } {
  const separator = department.includes(" – ") ? " – " : " ";
  const [programme, ...rest] = department.split(separator);
  return { programme, title: rest.join(separator) || department };
}
