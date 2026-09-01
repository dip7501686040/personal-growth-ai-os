export type NavItem = {
  href: string;
  label: string;
  /** Phase that fills this page with real functionality. */
  phase: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", phase: "Phase 9" },
  { href: "/learning", label: "Learning", phase: "Phase 3" },
  { href: "/projects", label: "Projects", phase: "Phase 4" },
  { href: "/career", label: "Career", phase: "Phase 5" },
  { href: "/content", label: "Content", phase: "Phase 6" },
  { href: "/business", label: "Business Opportunities", phase: "Phase 7" },
  { href: "/approvals", label: "Approval Inbox", phase: "Phase 9" },
  { href: "/activity", label: "Agent Activity", phase: "Phase 2.5 / 9" },
];
