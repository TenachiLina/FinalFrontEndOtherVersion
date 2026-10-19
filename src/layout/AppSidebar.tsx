"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { AuthUser, CompanyInfo, canOpen } from "../lib/auth";
import { DEFAULT_BRAND } from "../lib/branding";
import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
} from "../icons/index";
import { t } from "@/lib/i18n";


type SubLink = { name: string; path: string; pro?: boolean; new?: boolean };
// A sub-item that itself opens a second dropdown (e.g. Reporting → Bonuses → Give / History)
type SubGroup = { name: string; subItems: SubLink[] };

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: (SubLink | SubGroup)[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Home",
    path: "/home",
  },

  {
    icon: <PieChartIcon />,
    name: "Reporting",
    subItems: [
      { name: "Overview", path: "/reporting/overview", pro: false },
      { name: "Weekly Advances", path: "/reporting/weekly-advances", pro: false },
      { name: "Monthly Payroll", path: "/reporting/monthly-payroll", pro: false },
      { name: "Attendance", path: "/reporting/attendance", pro: false },
      { name: "Advances", path: "/reporting/advances", pro: false },
      {
        name: "Bonuses",
        subItems: [
          { name: "Give Bonuses", path: "/reporting/bonuses/give", pro: false },
          { name: "History", path: "/reporting/bonuses/history", pro: false },
        ],
      },
    ],
  },
  {
    icon: <CalenderIcon />,
    name: "Planning",
    subItems: [
      { name: "New Planning", path: "/calendar/DoPlanning", pro: false },
      { name: "View Planning", path: "/calendar/ViewPlanning", pro: false },
      { name: "Shifts Management", path: "/calendar/ShiftsManagment", pro: false },
    ]
  },
  // {
  //   icon: <UserCircleIcon />,
  //   name: "User Profile",
  //   path: "/profile",
  // },
  {
    icon: <UserCircleIcon />,
    name: "Clock In/Out",
    subItems: [
      {  name: "Clock In / Out", path: "/clockinpage", pro: false },
      {  name: "Clock In/Out with Face recognition", path: "/clockinfacerecognitionpage", pro: false },
      {  name: "Clock-in kiosk", path: "/kiosk", pro: false },
      {  name: "Clock In/Out History", path: "/clockinpagehistory", pro: false },
    ]
  },
  // {
  //   icon: <UserCircleIcon />,
  //   name: "Clock In / Out",
  //   path: "/clockinpage",
  // },

  // {
  //   icon: <UserCircleIcon />,
  //   name: "Clock In/Out with Face recognition",
  //   path: "/clockinfacerecognitionpage",
  // },

  // {
  //   icon: <UserCircleIcon />,
  //   name: "Clock In/Out History",
  //   path: "/clockinpagehistory",
  // },
  // {
  //   icon: <UserCircleIcon />,
  //   name: "Add Employee",
  //   path: "/addEmployeeForm",
  // },
  // {
  //   name: "Forms",
  //   icon: <ListIcon />,
  //   subItems: [{ name: "Form Elements", path: "/addEmployeeForm", pro: false }],
  // },
  {
    name: "Employees Management",
    icon: <TableIcon />,
    subItems: [
      { name: "Add Employee", path: "/addEmployeeForm", pro: false },
      { name: "View Employees", path: "/basic-tables", pro: false },

    ],
  },
  // {
  //   name: "Pages",
  //   icon: <PageIcon />,
  //   subItems: [
  //     { name: "Blank Page", path: "/blank", pro: false },
  //     { name: "404 Error", path: "/error-404", pro: false },
  //   ],
  // },
  {
    icon: <UserCircleIcon />,
    name: "Users",
    path: "/users",
  },
  {
    icon: <PlugInIcon />,
    name: "Company settings",
    path: "/company-settings",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Companies",
    path: "/companies",
  },
  {
    icon: <PageIcon />,
    name: "Help & guides",
    path: "/help",
  },
];

// Keeps only the links this user can open in this company (role + features).
function visibleItems(
  items: NavItem[],
  user: AuthUser | null,
  company: CompanyInfo | null
): NavItem[] {
  if (!user) return [];
  const allowed = (path: string) => canOpen(path, user, company);
  return items.flatMap((item): NavItem[] => {
    if (!item.subItems) return item.path && allowed(item.path) ? [item] : [];
    const subItems = item.subItems.flatMap((sub): (SubLink | SubGroup)[] => {
      if (!("subItems" in sub)) return allowed(sub.path) ? [sub] : [];
      const children = sub.subItems.filter((c) => allowed(c.path));
      return children.length ? [{ ...sub, subItems: children }] : [];
    });
    return subItems.length ? [{ ...item, subItems }] : [];
  });
}

const othersItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "Charts",
    subItems: [
      { name: "Line Chart", path: "/line-chart", pro: false },
      { name: "Bar Chart", path: "/bar-chart", pro: false },
    ],
  },
  {
    icon: <BoxCubeIcon />,
    name: "UI Elements",
    subItems: [
      { name: "Alerts", path: "/alerts", pro: false },
      { name: "Avatar", path: "/avatars", pro: false },
      { name: "Badge", path: "/badge", pro: false },
      { name: "Buttons", path: "/buttons", pro: false },
      { name: "Images", path: "/images", pro: false },
      { name: "Videos", path: "/videos", pro: false },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Authentication",
    subItems: [
      { name: "Sign In", path: "/signin", pro: false },
      { name: "Sign Up", path: "/signup", pro: false },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { user, company } = useAuth();
  const brandName = company?.name ?? DEFAULT_BRAND.name;
  const brandLogo = company?.branding?.logo || DEFAULT_BRAND.logo;
  const visibleNavItems = useMemo(
    () => visibleItems(navItems, user, company),
    [user, company]
  );

  const renderMenuItems = (
    navItems: NavItem[],
    menuType: "main" | "others"
  ) => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group  ${openSubmenu?.type === menuType && openSubmenu?.index === index
                ? "menu-item-active"
                : "menu-item-inactive"
                } cursor-pointer ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
                }`}
            >
              <span
                className={` ${openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-icon-active"
                  : "menu-item-icon-inactive"
                  }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={`menu-item-text`}>{t(nav.name)}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ms-auto w-5 h-5 transition-transform duration-200  ${openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                    ? "rotate-180 text-brand-500"
                    : ""
                    }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                  }`}
              >
                <span
                  className={`${isActive(nav.path)
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                    }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={`menu-item-text`}>{t(nav.name)}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ms-9">
                {nav.subItems.map((subItem) => {
                  // ── Second-level group (e.g. Bonuses → Give Bonuses / History) ──
                  if ("subItems" in subItem) {
                    const nestedKey = `${menuType}-${index}-${subItem.name}`;
                    const nestedOpen = openNested === nestedKey;
                    const hasActiveChild = subItem.subItems.some((c) => isActive(c.path));
                    return (
                      <li key={subItem.name}>
                        <button
                          onClick={() =>
                            setOpenNested((prev) => (prev === nestedKey ? null : nestedKey))
                          }
                          className={`menu-dropdown-item w-full cursor-pointer ${nestedOpen || hasActiveChild
                            ? "menu-dropdown-item-active"
                            : "menu-dropdown-item-inactive"
                            }`}
                        >
                          {t(subItem.name)}
                          <ChevronDownIcon
                            className={`ms-auto w-4 h-4 transition-transform duration-200 ${nestedOpen ? "rotate-180" : ""
                              }`}
                          />
                        </button>
                        {nestedOpen && (
                          <ul className="mt-1 space-y-1 ms-4">
                            {subItem.subItems.map((child) => (
                              <li key={child.name}>
                                <Link
                                  href={child.path}
                                  className={`menu-dropdown-item ${isActive(child.path)
                                    ? "menu-dropdown-item-active"
                                    : "menu-dropdown-item-inactive"
                                    }`}
                                >
                                  {t(child.name)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  // ── Normal link ──
                  return (
                    <li key={subItem.name}>
                      <Link
                        href={subItem.path}
                        className={`menu-dropdown-item ${isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                          }`}
                      >
                        {t(subItem.name)}
                        <span className="flex items-center gap-1 ms-auto">
                          {subItem.new && (
                            <span
                              className={`ms-auto ${isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                                } menu-dropdown-badge `}
                            >
                              new
                            </span>
                          )}
                          {subItem.pro && (
                            <span
                              className={`ms-auto ${isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                                } menu-dropdown-badge `}
                            >
                              pro
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  // Which second-level group is open, e.g. "main-0-Bonuses"
  const [openNested, setOpenNested] = useState<string | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? visibleNavItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if ("subItems" in subItem) {
              // current page is inside a second-level group → open both levels
              if (subItem.subItems.some((child) => isActive(child.path))) {
                setOpenSubmenu({
                  type: menuType as "main" | "others",
                  index,
                });
                setOpenNested(`${menuType}-${index}-${subItem.name}`);
                submenuMatched = true;
              }
            } else if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as "main" | "others",
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [pathname, isActive, visibleNavItems]);

  // Re-measure the open dropdown whenever it (or a nested group inside it) opens/closes,
  // so the parent is tall enough to show the nested links.
  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu, openNested]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 start-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-e border-gray-200 
        ${isExpanded || isMobileOpen
          ? "w-[290px]"
          : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}
        lg:translate-x-0 lg:rtl:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
          }`}
      >
        <Link href="/home">
          {/* The company's own logo and name once inside a company (see Companies > Edit) */}
          {isExpanded || isHovered || isMobileOpen ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="h-10 w-10 rounded-lg object-contain"
                src={brandLogo}
                alt={`${brandName} logo`}
              />
              <span className="text-xl font-bold text-gray-800 dark:text-white truncate max-w-[180px]">
                {brandName}
              </span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="h-8 w-8 rounded-lg object-contain"
              src={brandLogo}
              alt={`${brandName} logo`}
            />
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  t("Menu")
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(visibleNavItems, "main")}
            </div>

            {/* <div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Others"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(othersItems, "others")}
            </div> */}
          </div>
        </nav>
        {/* {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null} */}
      </div>
    </aside>
  );
};

export default AppSidebar;